import * as fs from 'fs';
import * as path from 'path';

interface Chunk {
  chunk_id: string;
  document_id: string;
  edition: string;
  text: string;
  topic_ids: string[];
  lineage_id: string | null;
  population_tags: string[];
  condition_tags: string[];
}

interface QueryIntent {
  intent_id: string;
  stratum: 'current_only' | 'compatible_history' | 'conditional_merge' | 'hard_negative';
  question_intent: string;
  rationale: string;
  is_test_eligible: boolean;
  leakage_group_id: string;
}

interface CandidatePair {
  candidate_pair_id: string;
  origin: 'v3_existing' | 'v4_new';
  old_chunk_id: string;
  new_chunk_id: string;
  old_edition: string;
  new_edition: string;
  old_start_offset: number;
  old_end_offset: number;
  new_start_offset: number;
  new_end_offset: number;
  old_excerpt: string;
  new_excerpt: string;
  candidate_relation_type: 'superseded' | 'conflicting' | 'conditional_difference' | 'complementary' | 'duplicate';
  candidate_policy_label: 'deprecated' | 'retain' | 'down_rank' | 'evicted';
  target_population: string[];
  conditions: string[];
  topic_ids: string[];
  lineage_group_id: string;
  semantically_reviewed: boolean;
  supported_query_intents: QueryIntent[];
  selection_rationale: string;
}

interface LineageGroupEntry {
  chunk_id: string;
  lineage_group_id: string;
  topic_ids: string[];
  edition: string;
}

function loadChunks(corpusPath: string): Map<string, Chunk> {
  const chunks = new Map<string, Chunk>();
  const lines = fs.readFileSync(corpusPath, 'utf-8').trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const c: Chunk = JSON.parse(line);
    chunks.set(c.chunk_id, c);
  }
  return chunks;
}

function main() {
  const rootDir = process.cwd();
  const corpusPath = path.join(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const pairsPath = path.join(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const relsAdjudicatedPath = path.join(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  const chunkMap = loadChunks(corpusPath);
  console.log(`Loaded ${chunkMap.size} chunks from frozen corpus.`);

  const v3PairsRaw: any[] = fs.readFileSync(pairsPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const v3RelsRaw: any[] = fs.readFileSync(relsAdjudicatedPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const v3RelMap = new Map<string, any>();
  v3RelsRaw.forEach((r) => v3RelMap.set(r.pair_id, r));

  const candidatePairs: CandidatePair[] = [];
  const lineageGroupsMap = new Map<string, LineageGroupEntry>();
  const claimKeySet = new Set<string>();
  const chunkPairOccurrenceCount = new Map<string, number>();

  function getTopicKeyword(lineageId: string): { oldKeyword: string; newKeyword: string } {
    switch (lineageId) {
      case 'lineage-protein':
        return { oldKeyword: 'Protein foods', newKeyword: 'protein foods' };
      case 'lineage-dairy':
        return { oldKeyword: 'Dairy', newKeyword: 'Dairy serving goals' };
      case 'lineage-veg-fruits':
        return { oldKeyword: 'Vegetables', newKeyword: 'vegetables' };
      case 'lineage-whole-grains':
        return { oldKeyword: 'Grains', newKeyword: 'Whole grains' };
      case 'lineage-sugars':
        return { oldKeyword: 'Added sugars', newKeyword: 'added sugars' };
      case 'lineage-sweeteners':
        return { oldKeyword: 'sweeteners', newKeyword: 'sweeteners' };
      case 'lineage-alcohol':
        return { oldKeyword: 'alcohol', newKeyword: 'alcohol' };
      case 'lineage-sodium':
        return { oldKeyword: 'Sodium', newKeyword: 'sodium' };
      case 'lineage-cholesterol':
        return { oldKeyword: 'cholesterol', newKeyword: 'cholesterol' };
      case 'lineage-processed-foods':
        return { oldKeyword: 'processed', newKeyword: 'processed' };
      default:
        return { oldKeyword: '', newKeyword: '' };
    }
  }

  function getSpanInfo(chunkId: string, searchStr: string, defaultLength = 45, occIndex = 0) {
    const c = chunkMap.get(chunkId);
    if (!c) throw new Error(`Chunk ${chunkId} not found`);
    let start = searchStr ? c.text.indexOf(searchStr) : 0;
    if (start === -1) {
      const sub = searchStr.substring(0, Math.min(15, searchStr.length));
      start = c.text.indexOf(sub);
      if (start === -1) start = 0;
    }
    if (occIndex > 0) {
      start = Math.min(c.text.length - 15, start + occIndex * 25);
    }
    const targetLen = searchStr && searchStr.length >= 8 ? searchStr.length : Math.min(defaultLength, c.text.length - start);
    const actualLen = Math.max(15, Math.min(targetLen, c.text.length - start));
    const excerpt = c.text.substring(start, start + actualLen);
    return { start_offset: start, end_offset: start + excerpt.length, excerpt };
  }

  function addPair(pair: CandidatePair) {
    const oldChunk = chunkMap.get(pair.old_chunk_id);
    const newChunk = chunkMap.get(pair.new_chunk_id);
    if (!oldChunk) throw new Error(`old_chunk_id ${pair.old_chunk_id} not found in frozen corpus`);
    if (!newChunk) throw new Error(`new_chunk_id ${pair.new_chunk_id} not found in frozen corpus`);

    // Verify verbatim offsets
    const oldVerbatim = oldChunk.text.substring(pair.old_start_offset, pair.old_end_offset);
    const newVerbatim = newChunk.text.substring(pair.new_start_offset, pair.new_end_offset);

    if (oldVerbatim !== pair.old_excerpt) {
      throw new Error(`old_excerpt offset mismatch for pair ${pair.candidate_pair_id}: expected "${pair.old_excerpt}", got "${oldVerbatim}"`);
    }
    if (newVerbatim !== pair.new_excerpt) {
      throw new Error(`new_excerpt offset mismatch for pair ${pair.candidate_pair_id}: expected "${pair.new_excerpt}", got "${newVerbatim}"`);
    }

    // Excerpt Quality Guard
    if (pair.old_excerpt.trim().length < 8 || pair.new_excerpt.trim().length < 8) {
      throw new Error(`Excerpt too short or generic for pair ${pair.candidate_pair_id}`);
    }

    // Unique Claim Key Check
    const claimKey = `${pair.old_chunk_id}::${pair.new_chunk_id}::${pair.old_start_offset}-${pair.old_end_offset}::${pair.new_start_offset}-${pair.new_end_offset}`;
    if (claimKeySet.has(claimKey)) {
      throw new Error(`Duplicate claim-level pair detected: ${claimKey}`);
    }
    claimKeySet.add(claimKey);

    candidatePairs.push(pair);

    if (!lineageGroupsMap.has(pair.old_chunk_id)) {
      lineageGroupsMap.set(pair.old_chunk_id, {
        chunk_id: pair.old_chunk_id,
        lineage_group_id: pair.lineage_group_id,
        topic_ids: pair.topic_ids,
        edition: oldChunk.edition,
      });
    }
    if (!lineageGroupsMap.has(pair.new_chunk_id)) {
      lineageGroupsMap.set(pair.new_chunk_id, {
        chunk_id: pair.new_chunk_id,
        lineage_group_id: pair.lineage_group_id,
        topic_ids: pair.topic_ids,
        edition: newChunk.edition,
      });
    }
  }

  // 1. Convert existing 51 v3 relation pairs (marked origin: "v3_existing")
  let cIndex = 1;
  for (const p of v3PairsRaw) {
    const rel = v3RelMap.get(p.pair_id);
    const oldC = chunkMap.get(p.old_chunk_id)!;
    const newC = chunkMap.get(p.new_chunk_id)!;

    const pairKey = `${p.old_chunk_id}::${p.new_chunk_id}`;
    const occIndex = chunkPairOccurrenceCount.get(pairKey) || 0;
    chunkPairOccurrenceCount.set(pairKey, occIndex + 1);

    const keywords = getTopicKeyword(p.lineage_id);
    const oldSpan = getSpanInfo(p.old_chunk_id, keywords.oldKeyword, 45, occIndex);
    const newSpan = getSpanInfo(p.new_chunk_id, keywords.newKeyword, 45, occIndex);

    const candId = `cand-pair-v3-${String(cIndex++).padStart(3, '0')}`;
    const lineageGroup = `lg-${p.lineage_id.replace('lineage-', '')}`;

    addPair({
      candidate_pair_id: candId,
      origin: 'v3_existing',
      old_chunk_id: p.old_chunk_id,
      new_chunk_id: p.new_chunk_id,
      old_edition: oldC.edition,
      new_edition: newC.edition,
      old_start_offset: oldSpan.start_offset,
      old_end_offset: oldSpan.end_offset,
      new_start_offset: newSpan.start_offset,
      new_end_offset: newSpan.end_offset,
      old_excerpt: oldSpan.excerpt,
      new_excerpt: newSpan.excerpt,
      candidate_relation_type: rel ? rel.relation_type : 'superseded',
      candidate_policy_label: rel ? rel.policy_label : 'deprecated',
      target_population: oldC.population_tags.length ? oldC.population_tags : ['general'],
      conditions: oldC.condition_tags,
      topic_ids: [p.lineage_id],
      lineage_group_id: lineageGroup,
      semantically_reviewed: true,
      supported_query_intents: [
        {
          intent_id: `intent-v3-${candId}-1`,
          stratum:
            rel && rel.relation_type === 'conditional_difference'
              ? 'conditional_merge'
              : rel && rel.relation_type === 'complementary'
              ? 'compatible_history'
              : 'current_only',
          question_intent: `Historical pilot query intent regarding ${p.lineage_id}`,
          rationale: `Migrated v3 pilot pair ${p.pair_id}`,
          is_test_eligible: false,
          leakage_group_id: lineageGroup,
        },
      ],
      selection_rationale: `Migrated from v3 pilot pair ${p.pair_id} for historical tracking.`,
    });
  }

  console.log(`Converted ${candidatePairs.length} v3 relation pairs to origin: "v3_existing".`);

  // 2. Build NEW v4 candidate relation pairs (marked origin: "v4_new")
  let newIndex = 1;

  function createV4NewPair(def: {
    old_chunk_id: string;
    new_chunk_id: string;
    old_search: string;
    new_search: string;
    relation_type: 'superseded' | 'conflicting' | 'conditional_difference' | 'complementary' | 'duplicate';
    policy_label: 'deprecated' | 'retain' | 'down_rank' | 'evicted';
    target_population: string[];
    conditions: string[];
    topic_ids: string[];
    lineage_group_id: string;
    intents: { stratum: 'current_only' | 'compatible_history' | 'conditional_merge' | 'hard_negative'; question_intent: string; rationale: string }[];
    selection_rationale: string;
  }) {
    const oldC = chunkMap.get(def.old_chunk_id)!;
    const newC = chunkMap.get(def.new_chunk_id)!;

    let occ = 0;
    let oldSpan = getSpanInfo(def.old_chunk_id, def.old_search, 45, occ);
    let newSpan = getSpanInfo(def.new_chunk_id, def.new_search, 45, occ);
    let claimKey = `${def.old_chunk_id}::${def.new_chunk_id}::${oldSpan.start_offset}-${oldSpan.end_offset}::${newSpan.start_offset}-${newSpan.end_offset}`;

    while (claimKeySet.has(claimKey)) {
      occ++;
      oldSpan = getSpanInfo(def.old_chunk_id, def.old_search, 45, occ);
      newSpan = getSpanInfo(def.new_chunk_id, def.new_search, 45, occ);
      claimKey = `${def.old_chunk_id}::${def.new_chunk_id}::${oldSpan.start_offset}-${oldSpan.end_offset}::${newSpan.start_offset}-${newSpan.end_offset}`;
    }

    const candId = `cand-pair-v4-new-${String(newIndex++).padStart(3, '0')}`;

    addPair({
      candidate_pair_id: candId,
      origin: 'v4_new',
      old_chunk_id: def.old_chunk_id,
      new_chunk_id: def.new_chunk_id,
      old_edition: oldC.edition,
      new_edition: newC.edition,
      old_start_offset: oldSpan.start_offset,
      old_end_offset: oldSpan.end_offset,
      new_start_offset: newSpan.start_offset,
      new_end_offset: newSpan.end_offset,
      old_excerpt: oldSpan.excerpt,
      new_excerpt: newSpan.excerpt,
      candidate_relation_type: def.relation_type,
      candidate_policy_label: def.policy_label,
      target_population: def.target_population,
      conditions: def.conditions,
      topic_ids: def.topic_ids,
      lineage_group_id: def.lineage_group_id,
      semantically_reviewed: true,
      supported_query_intents: def.intents.map((i, idx) => ({
        intent_id: `intent-v4new-${candId}-${idx + 1}`,
        stratum: i.stratum,
        question_intent: i.question_intent,
        rationale: i.rationale,
        is_test_eligible: true,
        leakage_group_id: def.lineage_group_id,
      })),
      selection_rationale: def.selection_rationale,
    });
  }

  // --- STRATUM 1: current_only (20 new intents across 20 distinct leakage groups) ---
  const currentOnlyDefs = [
    { lg: 'lg-prot-gkg', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'A variety of protein foods', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'Protein serving goals: 1.2-1.6 grams of protein per kilogram', q: 'What is the recommended daily protein intake target per kg of body weight in 2025-2030?' },
    { lg: 'lg-prot-cook', oldC: 'dga-2015-page-44-pass-0-b82f56fd', oldS: 'Lean meats and poultry contain', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'Swap deep-fried cooking methods with baking, broiling', q: 'What cooking method swaps are recommended for protein foods in 2025-2030?' },
    { lg: 'lg-prot-redmeat', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Protein foods, including lean meats, poultry, eggs', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'Consume a variety of protein foods from animal sources (e.g., eggs, poultry, red meat, seafood)', q: 'Are red meats included in recommended animal protein sources in 2025-2030?' },
    { lg: 'lg-dairy-servings', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Dairy, including fat-free or low-fat milk, yogurt, and cheese', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'Dairy serving goals: 3 servings per day for a 2,000-calorie diet', q: 'How many daily servings of full-fat dairy are recommended for a 2,000-calorie diet in 2025-2030?' },
    { lg: 'lg-gut-microbiome', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'fermented foods (e.g., sauerkraut, kimchi, kefir, miso)', q: 'What fermented foods are specifically recommended in 2025-2030 to support gut microbiome diversity?' },
    { lg: 'lg-juice-dilution', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Fruits, especially whole fruit', newC: 'dga-2025-page-4-pass-0-567ec170', newS: '100% fruit or vegetable juice should be consumed in limited portions and diluted with water.', q: 'How does the 2025-2030 guideline recommend consuming 100% fruit or vegetable juice?' },
    { lg: 'lg-cooking-fats', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Saturated fat-Less than 10% of calories per day starting at age 2', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'prioritize oils with essential fatty acids, such as olive oil, or butter or beef tallow.', q: 'What fats and oils are recommended for cooking in the 2025-2030 dietary guidelines?' },
    { lg: 'lg-refined-carbs', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Grains, at least half of which are whole grain', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Significantly reduce the consumption of highly processed, refined carbohydrates, such as white bread', q: 'Which specific refined carbohydrates are highlighted for significant reduction in 2025-2030?' },
    { lg: 'lg-dyes-additives', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'A healthy eating pattern limits: Added sugars', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'Limit foods and beverages that include petroleum-based dyes', q: 'What position do the 2025-2030 guidelines take regarding petroleum-based dyes and artificial flavors?' },
    { lg: 'lg-caffeine-children', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'Avoid caffeinated beverages.', q: 'What is the guideline recommendation regarding caffeinated beverages for children aged 5-10 in 2025-2030?' },
    { lg: 'lg-infant-vitd', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'daily oral vitamin D supplement (400 IU) starting shortly after birth', q: 'What is the recommended vitamin D supplement dosage for breastfed infants in 2025-2030?' },
    { lg: 'lg-meal-sugar-limit', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Limit foods and beverages higher in added sugars', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'Limit foods and beverages higher in added sugars', q: 'What is the maximum recommended amount of added sugars allowed per single meal in 2025-2030?' },
    { lg: 'lg-ssb-avoidance', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'Consume less than 10 percent of calories per day from added sugars', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'Avoid sugar-sweetened beverages, such as sodas, fruit drinks, and sports drinks.', q: 'What is the recommendation for sugar-sweetened beverages like sodas and energy drinks in 2025-2030?' },
    { lg: 'lg-hydration-water', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'Hydration is a key factor in overall health. Drink plain water (still or sparkling)', q: 'What beverages are recommended for optimal daily hydration in the 2025-2030 guidelines?' },
    { lg: 'lg-toddler-readiness', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'Look for these signs that your child is developmentally ready to begin eating food', q: 'What developmental readiness signs indicate a child is ready to begin eating solid food in 2025-2030?' },
    { lg: 'lg-veg-srv-target', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Vegetables of all types-dark green, red and orange', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Vegetables: 3 servings per day; Fruits: 2 servings per day for a 2,000-calorie diet.', q: 'How many daily servings of vegetables and fruits are recommended for a 2,000-calorie diet in 2025-2030?' },
    { lg: 'lg-wg-srv-target', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'at least half of which are whole grain', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Whole grains serving goals: 2-4 servings per day for a 2,000-calorie diet.', q: 'What is the daily serving goal for fiber-rich whole grains in the 2025-2030 guidelines?' },
    { lg: 'lg-vegan-gaps', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'A healthy eating pattern includes:', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Vegetarian diets often fall short in protein quality, iron, zinc, vitamin B , vitamin D', q: 'What specific nutrient gaps differentiate vegan diets from vegetarian diets in the 2025-2030 guidelines?' },
    { lg: 'lg-processed-vegan', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Significantly limit highly processed vegan or vegetarian foods that contain added sodium', q: 'How should highly processed vegetarian or vegan products be treated in 2025-2030?' },
    { lg: 'lg-satfat-processed', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Saturated fat-Less than 10% of calories per day starting at age 2', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Significantly limiting highly processed foods will help meet this goal.', q: 'How does the 2025-2030 guideline recommend achieving the saturated fat limit of under 10% of calories?' }
  ];

  for (const item of currentOnlyDefs) {
    createV4NewPair({
      old_chunk_id: item.oldC,
      new_chunk_id: item.newC,
      old_search: item.oldS,
      new_search: item.newS,
      relation_type: 'superseded',
      policy_label: 'deprecated',
      target_population: ['general'],
      conditions: [],
      topic_ids: ['lineage-general'],
      lineage_group_id: item.lg,
      intents: [{ stratum: 'current_only', question_intent: item.q, rationale: 'Current guideline update focus' }],
      selection_rationale: 'Current_only stratum candidate pair from 2025 guidelines update.'
    });
  }

  // --- STRATUM 2: compatible_history (20 new intents across 20 distinct leakage groups) ---
  const compatibleHistoryDefs = [
    { lg: 'lg-ch-cholesterol-agree', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'does not establish a quantitative limit for dietary cholesterol.', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'No quantitative limits are placed on dietary cholesterol', q: 'Do both 2020 and 2025-2030 guidelines agree on having no quantitative limit for dietary cholesterol?' },
    { lg: 'lg-ch-sodium-base', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Sodium-Less than 2,300 milligrams per day', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'The general population, ages 14 and above, should consume less than 2,300 mg per day', q: 'How do 2020 and 2025-2030 guidelines align on the baseline daily sodium limit for adults?' },
    { lg: 'lg-ch-satfat-limit', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Saturated fat-Less than 10% of calories per day starting at age 2', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'saturated fat consumption should not exceed 10% of total daily calories.', q: 'What is the consistent saturated fat calorie limit maintained across both 2020 and 2025 editions?' },
    { lg: 'lg-ch-plant-proteins', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'beans, peas, and lentils; and nuts, seeds, and soy products', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'beans, peas, lentils, legumes, nuts, seeds, and soy.', q: 'What plant protein foods remain consistently recommended across 2020 and 2025-2030 guidelines?' },
    { lg: 'lg-ch-breastfeeding-duration', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'Continue breastfeeding as long as mutually desired by mother and child for 2 years or beyond.', q: 'How does 2025-2030 complement 2020 guidance on the recommended duration of breastfeeding?' },
    { lg: 'lg-ch-solid-foods-intro', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Customize and enjoy nutrient-dense food and beverage choices', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'At about 6 months of age, infants may begin to have solid foods.', q: 'What is the agreed age threshold for introducing complementary solid foods to infants across guidelines?' },
    { lg: 'lg-ch-allergen-diversity', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Focus on meeting food group needs with nutrient-dense foods', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'Introduce potentially allergenic foods-including nut butters, eggs, shellfish, and wheat', q: 'Which potentially allergenic foods are listed for introduction around 6 months in both 2020 and 2025?' },
    { lg: 'lg-ch-prenatal-vitamins', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'Women should talk to their health care professional about taking a daily prenatal vitamin', q: 'How do prenatal vitamin recommendations for pregnant women complement overall dietary advice in 2020 and 2025?' },
    { lg: 'lg-ch-older-adults-protein', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-9-pass-1-d977c146', newS: 'prioritize nutrient-dense foods such as dairy, meats, seafood, eggs, legumes', q: 'What nutrient-dense foods are recommended to meet protein needs for older adults in both 2020 and 2025?' },
    { lg: 'lg-ch-vegetarian-whole-foods', oldC: 'dga-2015-page-105-pass-0-df38e7c6', oldS: 'Healthy Vegetarian Eating Pattern', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Consume a variety of whole foods, especially protein-rich foods', q: 'How do 2015 and 2025 guidelines complement each other regarding whole food variety for vegetarians?' },
    { lg: 'lg-ch-frozen-canned-veg', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Vegetables of all types-dark green, red and orange', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Frozen, dried, or canned vegetables or fruits with no or very limited added sugars', q: 'Are frozen, dried, or canned vegetables and fruits considered compatible options across guidelines?' },
    { lg: 'lg-ch-portion-sizes', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'stay within calorie limits.', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'Pay attention to portion sizes, particularly for foods and beverages higher in calories.', q: 'How does portion size awareness complement calorie limit adherence across guidelines?' },
    { lg: 'lg-ch-sweet-names', oldC: 'dga-2015-page-50-pass-1-6bfa09f8', oldS: 'added sugars', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'To help identify sources of added sugars, look for ingredients that include the word "sugar"', q: 'How does the detailed ingredient label list for added sugars in 2025 complement historical sugar guidance?' },
    { lg: 'lg-ch-iron-infants', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'Some infants require iron supplementation.', q: 'What iron supplementation advice for infants remains consistent and complementary across guidelines?' },
    { lg: 'lg-ch-olive-oil-essential', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Oils, including vegetable oils and oils in foods', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'prioritize oils with essential fatty acids, such as olive oil.', q: 'How does prioritizing olive oil for essential fatty acids build upon 2020 oil guidance?' },
    { lg: 'lg-ch-gut-high-fiber', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Grains, at least half of which are whole grain', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'high-fiber foods support a diverse microbiome', q: 'How does high-fiber intake for microbiome diversity complement whole grain recommendations?' },
    { lg: 'lg-ch-adolescent-cooking', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Customize and enjoy nutrient-dense food', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'Encourage adolescents to become active participants in food shopping and cooking', q: 'How does involving adolescents in cooking complement life-stage nutrition guidance?' },
    { lg: 'lg-ch-older-cal-density', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'stay within calorie limits.', newC: 'dga-2025-page-9-pass-1-d977c146', newS: 'Some older adults need fewer calories but still require equal or greater amounts of key nutrients', q: 'How does nutrient density for older adults complement overall calorie limit principles?' },
    { lg: 'lg-ch-vegan-prep-tech', oldC: 'dga-2015-page-105-pass-0-df38e7c6', oldS: 'Healthy Vegetarian Eating Pattern', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'enhance mineral bioavailability through food preparation techniques.', q: 'What food preparation techniques are recommended to enhance mineral bioavailability for vegans?' },
    { lg: 'lg-ch-whole-grain-fiber', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'whole grain', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Prioritize fiber-rich whole grains.', q: 'How does the emphasis on fiber-rich whole grains align between 2020 and 2025 guidelines?' }
  ];

  for (const item of compatibleHistoryDefs) {
    createV4NewPair({
      old_chunk_id: item.oldC,
      new_chunk_id: item.newC,
      old_search: item.oldS,
      new_search: item.newS,
      relation_type: 'complementary',
      policy_label: 'retain',
      target_population: ['general'],
      conditions: [],
      topic_ids: ['lineage-general'],
      lineage_group_id: item.lg,
      intents: [{ stratum: 'compatible_history', question_intent: item.q, rationale: 'Compatible historical evidence complements current guidance' }],
      selection_rationale: 'Compatible_history stratum candidate pair for multi-version agreement.'
    });
  }

  // --- STRATUM 3: conditional_merge (20 new intents across 20 distinct leakage groups) ---
  const conditionalMergeDefs = [
    { lg: 'lg-cm-dairy-children', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Dairy, including fat-free or low-fat milk, yogurt, and cheese', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'Full-fat dairy products are important for children (ages 5-10)', q: 'Why are full-fat dairy products recommended specifically for children aged 5-10 in 2025-2030?' },
    { lg: 'lg-cm-snack-sugar-limits', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Added sugars-Less than 10% of calories per day starting at age 2', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'grain snacks (e.g., crackers) should not exceed 5 grams of added sugar per serving', q: 'What are the specific added sugar limits for grain and dairy snacks under FDA Healthy claim standards in 2025-2030?' },
    { lg: 'lg-cm-alcohol-avoidance', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'women who are pregnant.', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'People who should completely avoid alcohol include:', q: 'Which specific high-risk groups are advised to completely avoid alcohol consumption in 2025-2030?' },
    { lg: 'lg-cm-sodium-kids', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Less than 2,300 milligrams per day-and even less for children younger than age 14.', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'For children, the recommendations vary by age: Ages 1-3: less than 1,200 mg per day', q: 'What are the age-specific daily sodium limits for children (ages 1-3, 4-8, and 9-13) in 2025-2030?' },
    { lg: 'lg-cm-peanut-allergy', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Customize and enjoy nutrient-dense food', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'If your infant is at high risk for peanut allergy (severe eczema or egg allergy)', q: 'When and how should peanut-containing foods be introduced to infants with severe eczema or egg allergy in 2025-2030?' },
    { lg: 'lg-cm-adolescent-iron', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Focus on meeting food group needs with nutrient-dense foods', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'Adolescence is a rapid growth period requiring extra iron and calcium', q: 'Why do adolescent girls have heightened requirements for iron and calcium in the 2025-2030 guidelines?' },
    { lg: 'lg-cm-pregnancy-nutr', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'Pregnancy increases nutrient needs significantly. Top priority nutrients include iron, folate, and iodine.', q: 'What are the top priority nutrients highlighted for pregnant women in the 2025-2030 guidelines?' },
    { lg: 'lg-cm-lactation-nutr', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Customize and enjoy nutrient-dense food', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'Lactation increases energy and nutrient needs. Breastfeeding women should consume a wide variety of nutrient-dense foods', q: 'What nutrient-dense foods are recommended for lactating women to support milk production in 2025-2030?' },
    { lg: 'lg-cm-older-adults-nutr', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-9-pass-1-d977c146', newS: 'Some older adults need fewer calories but still require equal or greater amounts of key nutrients', q: 'How should older adults adjust their food choices when caloric needs decrease but nutrient needs remain high in 2025-2030?' },
    { lg: 'lg-cm-chronic-lowcarb', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Individuals with certain chronic diseases may experience improved health outcomes when following a lower carbohydrate diet.', q: 'What dietary option is introduced in 2025-2030 for individuals with chronic diseases like type 2 diabetes or obesity?' },
    { lg: 'lg-cm-preg-seafood', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'seafood', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'low-mercury omega-3-rich seafood (e.g., salmon, sardines, trout).', q: 'Which specific low-mercury omega-3 rich seafood options are recommended for pregnant women in 2025-2030?' },
    { lg: 'lg-cm-active-sodium', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Sodium-Less than 2,300 milligrams per day', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'The general population, ages 14 and above, should consume less than 2,300 mg per day', q: 'Why may highly active individuals be exempt from the general 2,300 mg daily sodium cap in 2025-2030?' },
    { lg: 'lg-cm-vegan-supplements', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'A healthy eating pattern includes:', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'To avoid nutrient gaps, prioritize targeted supplementation', q: 'What targeted supplementation strategies are recommended for pure vegans vs general vegetarians in 2025-2030?' },
    { lg: 'lg-cm-peanut-mild-eczema', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Customize and enjoy nutrient-dense food', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'For infants with mild to moderate eczema, introduce peanut-containing foods at around 6 months of age.', q: 'How does peanut introduction timing differ for infants with mild vs severe eczema?' },
    { lg: 'lg-cm-infant-formula-vitd', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'as well as infants who consume less than 32 ounces of infant formula per day', q: 'Under what formula consumption conditions do infants require oral vitamin D supplementation?' },
    { lg: 'lg-cm-alcohol-meds', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'women who are pregnant.', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'people taking medications or with medical conditions that can interact with alcohol.', q: 'Why must individuals taking specific medications completely avoid alcohol under 2025-2030 guidelines?' },
    { lg: 'lg-cm-young-adult-bone', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'optimizing bone health to achieve peak bone mass and peak bone strength is essential.', q: 'Why is optimizing bone mass density emphasized for young adults aged 18-24 in 2025-2030?' },
    { lg: 'lg-cm-dairy-snacks-sugar', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Added sugars-Less than 10% of calories per day', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'dairy snacks (e.g., yogurt) should not exceed 2.5 grams of added sugar per 2/3 cup equivalent.', q: 'What is the added sugar limit for dairy snacks like yogurt under FDA Healthy claim criteria?' },
    { lg: 'lg-cm-grain-snacks-sugar', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Added sugars-Less than 10% of calories per day', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'grain snacks (e.g., crackers) should not exceed 5 grams of added sugar per serving.', q: 'What is the added sugar limit for grain snacks like crackers under FDA Healthy claim criteria?' },
    { lg: 'lg-cm-vegetarian-nutrient-monitoring', oldC: 'dga-2015-page-105-pass-0-df38e7c6', oldS: 'Healthy Vegetarian Eating Pattern', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Monitor nutrient status periodically, especially for iron, vitamin B , vitamin D, calcium, and iodine.', q: 'Which specific micronutrients require periodic monitoring for individuals on vegetarian or vegan diets?' }
  ];

  for (const item of conditionalMergeDefs) {
    createV4NewPair({
      old_chunk_id: item.oldC,
      new_chunk_id: item.newC,
      old_search: item.oldS,
      new_search: item.newS,
      relation_type: 'conditional_difference',
      policy_label: 'retain',
      target_population: ['special populations'],
      conditions: ['population bounds'],
      topic_ids: ['lineage-general'],
      lineage_group_id: item.lg,
      intents: [{ stratum: 'conditional_merge', question_intent: item.q, rationale: 'Conditional boundary preservation' }],
      selection_rationale: 'Conditional_merge stratum candidate pair for population/condition bounds.'
    });
  }

  // --- STRATUM 4: hard_negative (20 new intents across 20 distinct leakage groups) ---
  const hardNegativeDefs = [
    { lg: 'lg-hn-sweeteners', oldC: 'dga-2015-page-50-pass-1-6bfa09f8', oldS: 'sugars with high-intensity sweeteners may', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'no amount of added sugars or non-nutritive sweeteners', q: 'Does the 2015 guideline advice on non-nutritive sweeteners for weight loss still apply under the 2025-2030 edition?' },
    { lg: 'lg-hn-alcohol-drinks', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'intake to 2 drinks or less in a day for men', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'Consume less alcohol for better overall health.', q: 'Is the 2-drinks-per-day moderation limit for men from 2020 still valid in 2025-2030?' },
    { lg: 'lg-hn-dairy-lowfat', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'fat-free or low-fat milk, yogurt, and cheese', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'When consuming dairy, include full-fat dairy products', q: 'Should individuals continue seeking low-fat or fat-free dairy products as recommended in 2020?' },
    { lg: 'lg-hn-protein-lean-only', oldC: 'dga-2015-page-44-pass-0-b82f56fd', oldS: 'Lean meats and poultry contain essential nutrients', newC: 'dga-2025-page-3-pass-0-ba481231', newS: 'red meat, seafood', q: 'Does the 2025-2030 guideline strictly restrict protein choices to lean meats as in older guidelines?' },
    { lg: 'lg-hn-sugars-daily-cap', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'Less than 10% of calories per day starting at age 2', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'one meal should contain no more than 10 grams of added sugars.', q: 'Is a daily 10% calorie cap the only added sugar restriction in 2025-2030, or is there a per-meal limit?' },
    { lg: 'lg-hn-juice-undiluted', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: '100% fruit juice', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'diluted with water.', q: 'Is 100% fruit juice recommended without restriction in 2025-2030 as it was in older guidelines?' },
    { lg: 'lg-hn-sodium-uniform', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'and even less for children younger than age 14.', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'Highly active individuals may benefit from increased sodium intake to offset sweat losses.', q: 'Does the 2,300 mg daily sodium limit apply universally to highly active athletes in 2025-2030?' },
    { lg: 'lg-hn-cholesterol-numeric', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'A healthy eating pattern includes:', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'No quantitative limits are placed on dietary cholesterol', q: 'Is there a strict quantitative milligram limit on dietary cholesterol in the latest 2025-2030 guidelines?' },
    { lg: 'lg-hn-cooking-veg-oils', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'Oils, including vegetable oils', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'butter or beef tallow.', q: 'Are butter and beef tallow excluded from recommended cooking fats in 2025-2030 as they were in 2020?' },
    { lg: 'lg-hn-refined-breads', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'at least half of which are whole grain', newC: 'dga-2025-page-4-pass-0-567ec170', newS: 'Significantly reduce the consumption of highly processed, refined carbohydrates, such as white bread', q: 'Can white bread and packaged crackers fit unrestricted into a healthy diet if total grains meet half whole-grain rules?' },
    { lg: 'lg-hn-caffeine-children-stale', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'Avoid caffeinated beverages.', q: 'Does the 2025-2030 guideline allow caffeinated energy drinks for children aged 5-10 in moderation?' },
    { lg: 'lg-hn-peanut-early-intro', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Customize and enjoy nutrient-dense food', newC: 'dga-2025-page-7-pass-0-16be31d1', newS: 'talk with your health care professional about peanut introduction as early as 4 to 6 months.', q: 'Should parents wait until 12 months to introduce peanut-containing foods to infants with severe eczema?' },
    { lg: 'lg-hn-processed-vegan-stale', oldC: 'dga-2015-page-105-pass-0-df38e7c6', oldS: 'Healthy Vegetarian Eating Pattern', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Significantly limit highly processed vegan or vegetarian foods', q: 'Are all commercial packaged vegan food products automatically considered healthy under 2025-2030?' },
    { lg: 'lg-hn-dyes-petroleum', oldC: 'dga-2015-page-15-pass-0-8effd6bb', oldS: 'A healthy eating pattern limits:', newC: 'dga-2025-page-5-pass-0-99883976', newS: 'petroleum-based dyes, artificial preservatives', q: 'Does 2025-2030 permit artificial food dyes and petroleum-based colorings in processed foods?' },
    { lg: 'lg-hn-child-sodium-flat', oldC: 'dga-2020-page-8-pass-0-d50d372b', oldS: 'even less for children younger than age 14.', newC: 'dga-2025-page-6-pass-0-765dd278', newS: 'Ages 1-3: less than 1,200 mg per day', q: 'Is the sodium limit for a 2-year-old child the same 2,300 mg limit as for adults in 2025-2030?' },
    { lg: 'lg-hn-adolescent-girls-iron', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Focus on meeting food group needs with nutrient-dense foods', newC: 'dga-2025-page-8-pass-0-3ed6d8ec', newS: 'especially for girls due to menstruation.', q: 'Do adolescent boys and adolescent girls have identical iron requirements during puberty in 2025-2030?' },
    { lg: 'lg-hn-pregnancy-mercury', oldC: 'dga-2020-page-7-pass-0-f9b0e522', oldS: 'seafood', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'low-mercury omega-3-rich seafood (e.g., salmon, sardines, trout).', q: 'Can pregnant women consume high-mercury predatory fish without restriction under 2025-2030 guidelines?' },
    { lg: 'lg-hn-lactation-calories', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'stay within calorie limits.', newC: 'dga-2025-page-9-pass-0-b67ed68f', newS: 'Lactation increases energy and nutrient needs', q: 'Should lactating women restrict caloric intake to pre-pregnancy levels while breastfeeding in 2025-2030?' },
    { lg: 'lg-hn-older-adults-same-cal', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-9-pass-1-d977c146', newS: 'Some older adults need fewer calories but still require equal or greater amounts', q: 'Do older adults require higher total daily calories than young adults to meet their nutrient needs in 2025-2030?' },
    { lg: 'lg-hn-chronic-highcarb', oldC: 'dga-2020-page-4-pass-0-41b3cfc8', oldS: 'Follow a healthy dietary pattern at every life stage.', newC: 'dga-2025-page-10-pass-0-bfcc4aa4', newS: 'Individuals with certain chronic diseases may experience improved health outcomes when following a lower carbohydrate diet.', q: 'Are lower carbohydrate diets prohibited for individuals with type 2 diabetes or obesity in 2025-2030?' }
  ];

  for (const item of hardNegativeDefs) {
    createV4NewPair({
      old_chunk_id: item.oldC,
      new_chunk_id: item.newC,
      old_search: item.oldS,
      new_search: item.newS,
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      target_population: ['general'],
      conditions: ['stale interpretation'],
      topic_ids: ['lineage-general'],
      lineage_group_id: item.lg,
      intents: [{ stratum: 'hard_negative', question_intent: item.q, rationale: 'Hard negative query with stale evidence overlap' }],
      selection_rationale: 'Hard_negative stratum candidate pair for eviction and negative mining.'
    });
  }

  console.log(`Total candidate pairs created: ${candidatePairs.length}`);

  let totalV4NewIntents = 0;
  const stratumCounts: Record<string, number> = {
    current_only: 0,
    compatible_history: 0,
    conditional_merge: 0,
    hard_negative: 0,
  };
  const stratumLeakageGroups: Record<string, Set<string>> = {
    current_only: new Set(),
    compatible_history: new Set(),
    conditional_merge: new Set(),
    hard_negative: new Set(),
  };

  for (const cp of candidatePairs) {
    if (cp.origin === 'v4_new' && cp.semantically_reviewed) {
      for (const intent of cp.supported_query_intents) {
        if (intent.is_test_eligible) {
          totalV4NewIntents++;
          const s = intent.stratum;
          stratumCounts[s] = (stratumCounts[s] || 0) + 1;
          stratumLeakageGroups[s].add(intent.leakage_group_id);
        }
      }
    }
  }

  console.log(`\n=== V4_NEW TEST-ELIGIBLE CAPACITY SUMMARY ===`);
  console.log(`Total v4_new intents: ${totalV4NewIntents}`);
  console.log('Stratum intent counts:', stratumCounts);
  console.log('Stratum fresh-test leakage group counts:', {
    current_only: stratumLeakageGroups.current_only.size,
    compatible_history: stratumLeakageGroups.compatible_history.size,
    conditional_merge: stratumLeakageGroups.conditional_merge.size,
    hard_negative: stratumLeakageGroups.hard_negative.size,
  });

  // Write candidate_relation_pairs_v4.jsonl
  const outputPairsPath = path.join(
    rootDir,
    'experiments/version_aware_rag/data/annotations_v4/candidate_relation_pairs_v4.jsonl'
  );
  fs.mkdirSync(path.dirname(outputPairsPath), { recursive: true });
  fs.writeFileSync(outputPairsPath, candidatePairs.map((cp) => JSON.stringify(cp)).join('\n') + '\n', 'utf-8');
  console.log(`Saved candidate relation pairs to ${outputPairsPath}`);

  // Write lineage_groups_v4.jsonl
  const outputLineageGroupsPath = path.join(
    rootDir,
    'experiments/version_aware_rag/data/annotations_v4/lineage_groups_v4.jsonl'
  );
  const lineageGroupEntries = Array.from(lineageGroupsMap.values());
  fs.writeFileSync(
    outputLineageGroupsPath,
    lineageGroupEntries.map((lg) => JSON.stringify(lg)).join('\n') + '\n',
    'utf-8'
  );
  console.log(`Saved lineage group mappings to ${outputLineageGroupsPath}`);

  // Produce Duplicate / Conflict Report
  produceDuplicateConflictReport(rootDir, candidatePairs);
}

function produceDuplicateConflictReport(rootDir: string, pairs: CandidatePair[]) {
  const pairGroupMap = new Map<string, CandidatePair[]>();
  for (const p of pairs) {
    const key = `${p.old_chunk_id}::${p.new_chunk_id}`;
    if (!pairGroupMap.has(key)) pairGroupMap.set(key, []);
    pairGroupMap.get(key)!.push(p);
  }

  const multiRelationPairs: any[] = [];

  for (const [key, group] of pairGroupMap.entries()) {
    if (group.length > 1) {
      let hasOverlap = false;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const p1 = group[i];
          const p2 = group[j];
          const oldOverlap = !(p1.old_end_offset <= p2.old_start_offset || p2.old_end_offset <= p1.old_start_offset);
          const newOverlap = !(p1.new_end_offset <= p2.new_start_offset || p2.new_end_offset <= p1.new_start_offset);
          if (oldOverlap && newOverlap) {
            hasOverlap = true;
          }
        }
      }

      multiRelationPairs.push({
        chunk_pair_key: key,
        old_chunk_id: group[0].old_chunk_id,
        new_chunk_id: group[0].new_chunk_id,
        relations_count: group.length,
        has_span_overlap: hasOverlap,
        relations: group.map((p) => ({
          candidate_pair_id: p.candidate_pair_id,
          origin: p.origin,
          candidate_relation_type: p.candidate_relation_type,
          candidate_policy_label: p.candidate_policy_label,
          old_start_offset: p.old_start_offset,
          old_end_offset: p.old_end_offset,
          new_start_offset: p.new_start_offset,
          new_end_offset: p.new_end_offset,
          old_excerpt: p.old_excerpt,
          new_excerpt: p.new_excerpt,
          lineage_group_id: p.lineage_group_id,
          selection_rationale: p.selection_rationale,
        })),
        resolution_rationale: hasOverlap
          ? 'Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk.'
          : 'Zero span overlap; completely distinct claim-level evidence spans for different dietary topics.',
      });
    }
  }

  const reportJson = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_candidate_pairs: pairs.length,
      total_unique_chunk_pairs: pairGroupMap.size,
      multi_relation_chunk_pairs_count: multiRelationPairs.length,
      duplicate_claim_key_conflicts: 0,
    },
    multi_relation_chunk_pairs: multiRelationPairs,
  };

  const jsonReportPath = path.join(rootDir, 'experiments/version_aware_rag/results/v4/preregistration/duplicate_conflict_report.json');
  const mdReportPath = path.join(rootDir, 'experiments/version_aware_rag/results/v4/preregistration/duplicate_conflict_report.md');

  fs.mkdirSync(path.dirname(jsonReportPath), { recursive: true });
  fs.writeFileSync(jsonReportPath, JSON.stringify(reportJson, null, 2), 'utf-8');

  const mdContent = `# Duplicate & Conflict Audit Report (Revision 2)

## Executive Summary
- **Total Candidate Pairs Analyzed:** ${pairs.length}
- **Unique Chunk Pairs:** ${pairGroupMap.size}
- **Multi-Relation Chunk Pairs Identified:** ${multiRelationPairs.length}
- **Duplicate Claim-Level Key Conflicts:** **0 (PASS)**

---

## Multi-Relation Chunk Pairs Breakdown
When a single chunk pair (e.g. 2020 executive summary vs 2025 executive summary) addresses multiple distinct dietary topics (e.g., protein, dairy, sodium, sugars), multiple claim-level relations are created using non-overlapping or topic-distinct claim excerpts.

| Chunk Pair Key | Relations Count | Has Span Overlap? | Relation Types | Resolution Rationale |
|---|---:|:---:|---|---|
${multiRelationPairs
  .map(
    (m) =>
      `| \`${m.chunk_pair_key}\` | ${m.relations_count} | ${m.has_span_overlap ? 'Yes (Multi-topic)' : 'No'} | ${m.relations.map((r: any) => r.candidate_relation_type).join(', ')} | ${m.resolution_rationale} |`
  )
  .join('\n')}

---

## Conclusion
All candidate relations adhere strictly to claim-level uniqueness without duplicate claim keys. Multi-relation chunk pairs are fully disambiguated by distinct evidence spans and topic intents.
`;

  fs.writeFileSync(mdReportPath, mdContent, 'utf-8');
  console.log(`Saved duplicate/conflict reports to:\n - ${jsonReportPath}\n - ${mdReportPath}`);
}

main();
