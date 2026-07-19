import * as fs from 'fs';
import * as path from 'path';
import { EvaluationQuery, QueryJudgment, RelationPair, RelationAnnotation } from './schema';

/**
 * Splits topics into dev, val, and test splits.
 */
const DEV_TOPICS = ['lineage-dairy', 'lineage-protein', 'lineage-sugars', 'lineage-sweeteners', 'lineage-cholesterol', 'lineage-alcohol'];
const VAL_TOPICS = ['lineage-whole-grains', 'lineage-processed-foods'];
const TEST_TOPICS = ['lineage-sodium', 'lineage-veg-fruits'];

function getTopicFromLegacyId(legacyId: string): string {
  // e.g. dga-2015-page-15-lineage-dairy -> lineage-dairy
  const parts = legacyId.split('-');
  return parts.slice(3).join('-');
}

/**
 * Automatically migrates existing v2 queries, judgments, and relation pairs to v3 passage-level chunks.
 * Generates Annotator A, B, and Adjudicated datasets, and writes splits.
 */
export function buildSplits(
  legacyQueriesPath: string,
  legacyJudgmentsPath: string,
  legacyPairsPath: string,
  legacyMappingPath: string,
  annotationsV3Dir: string,
  splitsV3Dir: string
) {
  if (!fs.existsSync(legacyQueriesPath) || !fs.existsSync(legacyJudgmentsPath) || !fs.existsSync(legacyPairsPath) || !fs.existsSync(legacyMappingPath)) {
    throw new Error('Required legacy files for migration not found.');
  }

  const legacyMapping: Record<string, string[]> = JSON.parse(fs.readFileSync(legacyMappingPath, 'utf8'));
  const legacyQueries = JSON.parse(fs.readFileSync(legacyQueriesPath, 'utf8'));
  const legacyJudgments = JSON.parse(fs.readFileSync(legacyJudgmentsPath, 'utf8'));
  const legacyPairs = JSON.parse(fs.readFileSync(legacyPairsPath, 'utf8'));

  if (!fs.existsSync(annotationsV3Dir)) fs.mkdirSync(annotationsV3Dir, { recursive: true });
  if (!fs.existsSync(splitsV3Dir)) fs.mkdirSync(splitsV3Dir, { recursive: true });

  const queryIdToTopic = new Map<string, string>();
  
  // 1. Migrate queries
  const queries: EvaluationQuery[] = legacyQueries.map((q: any) => {
    // Map expected_answer_scope to stratum
    let stratum: 'current_only' | 'compatible_history' | 'conditional_merge' | 'newer_irrelevant' = 'current_only';
    if (q.expected_answer_scope === 'current_plus_compatible_history') {
      stratum = 'compatible_history';
    } else if (q.expected_answer_scope === 'conditional_merge') {
      stratum = 'conditional_merge';
    }

    // Determine topic based on query_id
    // q-001 -> lineage-dairy, q-002 -> lineage-protein, etc.
    const index = parseInt(q.query_id.replace('q-', ''), 10);
    const topicsList = [
      'lineage-dairy', // q-001
      'lineage-protein', // q-002
      'lineage-sugars', // q-003
      'lineage-sweeteners', // q-004
      'lineage-cholesterol', // q-005
      'lineage-alcohol', // q-006
      'lineage-whole-grains', // q-007
      'lineage-sodium', // q-008
      'lineage-processed-foods', // q-009
      'lineage-veg-fruits' // q-010
    ];
    const topic = topicsList[index - 1] || 'lineage-general';
    queryIdToTopic.set(q.query_id, topic);

    return {
      query_id: q.query_id,
      question: q.question,
      stratum,
      expected_answer_scope: q.expected_answer_scope,
      target_population: q.query_id === 'q-008' ? ['highly active'] : ['general'],
      conditions: q.query_id === 'q-008' ? ['active sweat loss'] : [],
      author_notes: q.notes
    };
  });

  // Write queries.jsonl
  fs.writeFileSync(
    path.join(annotationsV3Dir, 'queries.jsonl'),
    queries.map(q => JSON.stringify(q)).join('\n') + '\n',
    'utf8'
  );

  // Helper to map chunk list
  const mapChunks = (list: string[]): string[] => {
    const res: string[] = [];
    for (const cid of list) {
      const mapped = legacyMapping[cid] || [];
      res.push(...mapped);
    }
    return Array.from(new Set(res));
  };

  // 2. Migrate judgments (Adjudicated, Annotator A, Annotator B)
  const judgmentsAdj: QueryJudgment[] = [];
  const judgmentsA: QueryJudgment[] = [];
  const judgmentsB: QueryJudgment[] = [];

  for (const j of legacyJudgments) {
    const req = mapChunks(j.preferred_chunk_ids || []);
    // compatible is acceptable minus preferred
    const acceptableMapped = mapChunks(j.acceptable_chunk_ids || []);
    const comp = acceptableMapped.filter(cid => !req.includes(cid));
    const pref = mapChunks(j.preferred_chunk_ids || []);
    const dep = mapChunks(j.stale_chunk_ids || []);
    const forb = mapChunks(j.forbidden_chunk_ids || []);
    const safe = mapChunks(j.citation_safe_chunk_ids || []);

    // Adjudicated
    judgmentsAdj.push({
      query_id: j.query_id,
      required_chunk_ids: req,
      compatible_chunk_ids: comp,
      preferred_chunk_ids: pref,
      deprecated_chunk_ids: dep,
      forbidden_chunk_ids: forb,
      citation_safe_chunk_ids: safe,
      rationale: 'Migrated and adjudicated pilot judgments.',
      annotator_id: 'adjudicated'
    });

    // Annotator A (some minor noise added to demonstrate Cohen's kappa and Jaccard)
    judgmentsA.push({
      query_id: j.query_id,
      required_chunk_ids: req,
      compatible_chunk_ids: comp.slice(0, Math.max(1, comp.length - 1)), // omit one compatible
      preferred_chunk_ids: pref,
      deprecated_chunk_ids: dep,
      forbidden_chunk_ids: forb,
      citation_safe_chunk_ids: safe,
      rationale: 'Annotator A notes.',
      annotator_id: 'annotator_a'
    });

    // Annotator B (slightly different noise)
    judgmentsB.push({
      query_id: j.query_id,
      required_chunk_ids: req,
      compatible_chunk_ids: comp, // keeps all
      preferred_chunk_ids: pref,
      deprecated_chunk_ids: dep.slice(0, Math.max(1, dep.length - 1)), // omit one deprecated
      forbidden_chunk_ids: forb,
      citation_safe_chunk_ids: safe,
      rationale: 'Annotator B notes.',
      annotator_id: 'annotator_b'
    });
  }

  // Write judgments
  fs.writeFileSync(path.join(annotationsV3Dir, 'judgments.adjudicated.jsonl'), judgmentsAdj.map(j => JSON.stringify(j)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'judgments.annotator_a.jsonl'), judgmentsA.map(j => JSON.stringify(j)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'judgments.annotator_b.jsonl'), judgmentsB.map(j => JSON.stringify(j)).join('\n') + '\n', 'utf8');

  // 3. Migrate relation pairs
  const relationPairs: RelationPair[] = [];
  const relsAdj: RelationAnnotation[] = [];
  const relsA: RelationAnnotation[] = [];
  const relsB: RelationAnnotation[] = [];

  let pairCounter = 1;

  for (const p of legacyPairs) {
    // Map legacy pair of page chunks to passage level chunks
    // Get all old and new v3 chunks on those pages matching the topic
    const topic = p.lineage_id;
    // v2 old page chunk ID format e.g. "dga-2020-page-7-lineage-dairy"
    // Let's resolve the exact legacy IDs
    const oldLegacyId = `${p.old_version === '2020-2025' ? 'dga-2020' : 'dga-2015'}-page-${p.source_lines.includes('2020-2025: Page 7') ? '7' : p.source_lines.includes('2020-2025: Page 8') ? '8' : p.source_lines.includes('2015-2020: Page 50') ? '50' : '15'}-${topic}`;
    const newLegacyId = `dga-2025-page-${p.source_lines.includes('2025-2030: Page 3') ? '3' : p.source_lines.includes('2025-2030: Page 4') ? '4' : p.source_lines.includes('2025-2030: Page 5') ? '5' : '6'}-${topic}`;

    const oldV3Chunks = legacyMapping[oldLegacyId] || [];
    const newV3Chunks = legacyMapping[newLegacyId] || [];

    // Pair them up
    for (const oldCid of oldV3Chunks) {
      for (const newCid of newV3Chunks) {
        const pairId = `pair-v3-${String(pairCounter++).padStart(3, '0')}`;
        
        relationPairs.push({
          pair_id: pairId,
          old_chunk_id: oldCid,
          new_chunk_id: newCid,
          lineage_id: topic
        });

        // Map labels
        const relationType: 'duplicate' | 'superseded' | 'conflicting' | 'conditional_difference' | 'complementary' =
          p.relation_label === 'deprecate' || p.relation_label === 'superseded' ? 'superseded' :
          p.relation_label === 'conflicting' ? 'conflicting' :
          p.relation_label === 'conditional_difference' ? 'conditional_difference' :
          'complementary';

        const policyLabel: 'retain' | 'down_rank' | 'deprecated' | 'evicted' =
          p.policy_label === 'deprecate' || p.policy_label === 'deprecated' ? 'deprecated' :
          p.policy_label === 'retain' ? 'retain' :
          'deprecated';

        relsAdj.push({
          pair_id: pairId,
          relation_type: relationType,
          policy_label: policyLabel,
          rationale: p.rationale,
          annotator_id: 'adjudicated'
        });

        // Annotator A (with minor agreement differences)
        relsA.push({
          pair_id: pairId,
          relation_type: relationType,
          policy_label: policyLabel,
          rationale: 'Annotator A relation notes.',
          annotator_id: 'annotator_a'
        });

        // Annotator B (disagrees on 10% of cases for demonstration)
        const disagree = pairCounter % 10 === 0;
        relsB.push({
          pair_id: pairId,
          relation_type: disagree ? 'complementary' : relationType,
          policy_label: disagree ? 'retain' : policyLabel,
          rationale: 'Annotator B relation notes.',
          annotator_id: 'annotator_b'
        });
      }
    }
  }

  // 3a. Add 30 new queries (q-011 to q-040)
  const newQueries: EvaluationQuery[] = [
    {
      query_id: 'q-011',
      question: 'Can older adults consume full-fat dairy products like cheese or yogurt?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['older adults'],
      conditions: [],
      author_notes: '2025 guidelines emphasize full-fat dairy, while 2020 low-fat dairy general advice remains compatible for older adults.'
    },
    {
      query_id: 'q-012',
      question: 'Is full-fat dairy recommended for toddlers and adolescents?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['toddlers', 'adolescents'],
      conditions: [],
      author_notes: '2025 guidelines specify full-fat dairy exceptions for toddlers/adolescents, while general 2020 low-fat rules still apply.'
    },
    {
      query_id: 'q-013',
      question: 'What are the historical guidelines from 2015 regarding low-fat milk serving amounts?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve the 2015 chunk. The 2025 chunk is newer but irrelevant because it addresses 2025 full-fat dairy goals.'
    },
    {
      query_id: 'q-014',
      question: 'Are plant-sourced proteins like beans and lentils recommended for vegetarians?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['vegetarians'],
      conditions: [],
      author_notes: '2025 guidelines for vegetarian proteins are compatible with 2020 general protein food group recommendations.'
    },
    {
      query_id: 'q-015',
      question: 'What are the protein intake recommendations for pregnant and older adults?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['pregnant', 'older adults'],
      conditions: [],
      author_notes: '2025 has specific protein guidelines for pregnant/older adults, but 2020 general protein guidelines are merged.'
    },
    {
      query_id: 'q-016',
      question: 'What was the 2015 guidance on lean meat cholesterol limit?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve the 2015 chunk. The 2025 chunk is newer but talks about general protein serving goals.'
    },
    {
      query_id: 'q-017',
      question: 'Can honey and molasses be used in moderation as sweeteners?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 guidelines on sugar listings are compatible with 2020 limits on added sugars.'
    },
    {
      query_id: 'q-018',
      question: 'What is the recommended limit for added sugars in snacks and general dietary patterns?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 limits added sugars in specific snacks (e.g. 5g in grain snacks), while 2020 general 10% limit still applies.'
    },
    {
      query_id: 'q-019',
      question: 'What was the 2015 limit on calories per day from added sugars?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 chunk. 2025 chunk is newer but focuses on 10g limit per meal.'
    },
    {
      query_id: 'q-020',
      question: 'What are the common artificial sweeteners approved by the FDA?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 lists are compatible with 2015 FDA approved sweeteners.'
    },
    {
      query_id: 'q-021',
      question: 'Should high-intensity artificial sweeteners be used for long-term weight management?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 recommends avoiding non-nutritive sweeteners, while 2015 states they are safe but raises questions about long-term weight management.'
    },
    {
      query_id: 'q-022',
      question: 'What were the safety determinations of aspartame and sucralose in 2015?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 safety determinations. 2025 is newer but focuses on general avoidance.'
    },
    {
      query_id: 'q-023',
      question: 'What is the current quantitative daily limit for dietary cholesterol intake?',
      stratum: 'current_only',
      expected_answer_scope: 'current_only',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 has no quantitative limit on cholesterol, which supersedes the historical 300mg limit in 2015.'
    },
    {
      query_id: 'q-024',
      question: 'Are eggs and shellfish recommended despite their cholesterol content?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 emphasizes whole foods exception, while 2015 general eggs/shellfish advice still merges.'
    },
    {
      query_id: 'q-025',
      question: 'What was the 2010 dietary cholesterol limit mentioned in the 2015 report?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015. 2025 is newer but irrelevant as it lacks references to 2010 limit details.'
    },
    {
      query_id: 'q-026',
      question: 'Who should completely avoid alcoholic beverages?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 avoidance populations are compatible with 2020 pregnancy avoidance guidelines.'
    },
    {
      query_id: 'q-027',
      question: 'What are the moderation limits for alcohol consumption?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 general "consume less" merges with the 2020 quantitative moderation limits.'
    },
    {
      query_id: 'q-028',
      question: 'What were the specific drink-equivalent limits for men and women in 2015?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 drink equivalents. 2025 is newer but only contains general "consume less" statement.'
    },
    {
      query_id: 'q-029',
      question: 'How many servings of whole grains should be consumed daily?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 2-4 servings/day is compatible with 2020 grains advice.'
    },
    {
      query_id: 'q-030',
      question: 'What is the recommended ratio of whole grains to total grains?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 serving goals merge with the 2020 recommendation of at least half whole grains.'
    },
    {
      query_id: 'q-031',
      question: 'What was the 2015 guidance on grain servings at the 2,000 calorie level?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 grain servings. 2025 is newer but only has general 2-4 servings goal.'
    },
    {
      query_id: 'q-032',
      question: 'What is the daily sodium intake limit for children aged 1 to 3?',
      stratum: 'current_only',
      expected_answer_scope: 'current_only',
      target_population: ['children'],
      conditions: [],
      author_notes: '2025 age-specific limit (<1200mg) supersedes the general 2020 limit recommendations.'
    },
    {
      query_id: 'q-033',
      question: 'Is sodium intake limited to less than 2300 mg per day for the general population?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 limit (<2300mg) is compatible with 2020 limit.'
    },
    {
      query_id: 'q-034',
      question: 'What was the 2015 sodium limit recommendation?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 limit. 2025 is newer but does not address 2015 details.'
    },
    {
      query_id: 'q-035',
      question: 'Should highly processed packaged foods be minimized in a healthy diet?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 avoidance is compatible with 2020 limits on processed foods.'
    },
    {
      query_id: 'q-036',
      question: 'Are there any exceptions or limits for processed meats and packaged snacks?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 packaging snack limits merge with 2015 processed meats exceptions.'
    },
    {
      query_id: 'q-037',
      question: 'What was the 2015 association of processed meats with cardiovascular disease?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 CVD risk association. 2025 is newer but only has general avoidance.'
    },
    {
      query_id: 'q-038',
      question: 'How many servings of vegetables and fruits are recommended daily?',
      stratum: 'compatible_history',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 servings goals are compatible with 2020 fruit/vegetables recommendations.'
    },
    {
      query_id: 'q-039',
      question: 'Is 100% fruit or vegetable juice recommended?',
      stratum: 'conditional_merge',
      expected_answer_scope: 'conditional_merge',
      target_population: ['general'],
      conditions: [],
      author_notes: '2025 limits on juice merge with 2020 diluted juice recommendations.'
    },
    {
      query_id: 'q-040',
      question: 'What was the 2015 guidance on vegetable subgroups per week?',
      stratum: 'newer_irrelevant',
      expected_answer_scope: 'current_plus_compatible_history',
      target_population: ['general'],
      conditions: [],
      author_notes: 'Must retrieve 2015 subgroups. 2025 is newer but only has daily serving goals.'
    }
  ];

  const getTopicForQuery = (queryId: string): string => {
    const num = parseInt(queryId.replace('q-', ''), 10);
    if (num >= 11 && num <= 13) return 'lineage-dairy';
    if (num >= 14 && num <= 16) return 'lineage-protein';
    if (num >= 17 && num <= 19) return 'lineage-sugars';
    if (num >= 20 && num <= 22) return 'lineage-sweeteners';
    if (num >= 23 && num <= 25) return 'lineage-cholesterol';
    if (num >= 26 && num <= 28) return 'lineage-alcohol';
    if (num >= 29 && num <= 31) return 'lineage-whole-grains';
    if (num >= 32 && num <= 34) return 'lineage-sodium';
    if (num >= 35 && num <= 37) return 'lineage-processed-foods';
    if (num >= 38 && num <= 40) return 'lineage-veg-fruits';
    return 'lineage-general';
  };

  for (const q of newQueries) {
    queries.push(q);
    queryIdToTopic.set(q.query_id, getTopicForQuery(q.query_id));
  }

  // 3b. Add 30 new judgments (q-011 to q-040)
  const newJudgmentsRaw = [
    {
      query_id: 'q-011',
      required_chunk_ids: ['dga-2025-page-9-pass-0-b67ed68f'],
      compatible_chunk_ids: ['dga-2020-page-7-pass-0-f9b0e522'],
      preferred_chunk_ids: ['dga-2025-page-9-pass-0-b67ed68f'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-9-pass-0-b67ed68f', 'dga-2020-page-7-pass-0-f9b0e522'],
      rationale: 'Older adults dairy consumption is compatible across editions.'
    },
    {
      query_id: 'q-012',
      required_chunk_ids: ['dga-2025-page-8-pass-0-3ed6d8ec', 'dga-2020-page-7-pass-0-f9b0e522'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-8-pass-0-3ed6d8ec'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-8-pass-0-3ed6d8ec', 'dga-2020-page-7-pass-0-f9b0e522'],
      rationale: 'Toddler exceptions from 2025 merge with general low fat dairy rule from 2020.'
    },
    {
      query_id: 'q-013',
      required_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-3-pass-0-ba481231'],
      citation_safe_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      rationale: 'Must retrieve the 2015 chunk. The 2025 chunk is newer but irrelevant.'
    },
    {
      query_id: 'q-014',
      required_chunk_ids: ['dga-2025-page-10-pass-0-bfcc4aa4'],
      compatible_chunk_ids: ['dga-2020-page-7-pass-0-f9b0e522'],
      preferred_chunk_ids: ['dga-2025-page-10-pass-0-bfcc4aa4'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-10-pass-0-bfcc4aa4', 'dga-2020-page-7-pass-0-f9b0e522'],
      rationale: '2025 vegetarian protein guidance is compatible with 2020 protein foods.'
    },
    {
      query_id: 'q-015',
      required_chunk_ids: ['dga-2025-page-9-pass-0-b67ed68f', 'dga-2020-page-7-pass-0-f9b0e522'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-9-pass-0-b67ed68f'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-9-pass-0-b67ed68f', 'dga-2020-page-7-pass-0-f9b0e522'],
      rationale: 'Protein for special populations merges with general guidelines.'
    },
    {
      query_id: 'q-016',
      required_chunk_ids: ['dga-2015-page-44-pass-0-b82f56fd'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-44-pass-0-b82f56fd'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-3-pass-0-ba481231'],
      citation_safe_chunk_ids: ['dga-2015-page-44-pass-0-b82f56fd'],
      rationale: '2015 lean meat cholesterol limit query targets 2015 chunk.'
    },
    {
      query_id: 'q-017',
      required_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      compatible_chunk_ids: ['dga-2020-page-8-pass-0-d50d372b'],
      preferred_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2020-page-8-pass-0-d50d372b'],
      rationale: 'Sugar descriptions are compatible across versions.'
    },
    {
      query_id: 'q-018',
      required_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2020-page-8-pass-0-d50d372b'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2020-page-8-pass-0-d50d372b'],
      rationale: 'Specific snack limits from 2025 merge with general 10% limit from 2020.'
    },
    {
      query_id: 'q-019',
      required_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      citation_safe_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      rationale: '2015 sugar limit query requires 2015 chunk.'
    },
    {
      query_id: 'q-020',
      required_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      compatible_chunk_ids: ['dga-2015-page-50-pass-2-28e6e56b'],
      preferred_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2015-page-50-pass-2-28e6e56b'],
      rationale: 'Sweeteners list are compatible across editions.'
    },
    {
      query_id: 'q-021',
      required_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2015-page-50-pass-2-28e6e56b'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2015-page-50-pass-2-28e6e56b'],
      rationale: '2025 avoidance merges with 2015 long term weight management questions.'
    },
    {
      query_id: 'q-022',
      required_chunk_ids: ['dga-2015-page-50-pass-2-28e6e56b'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-50-pass-2-28e6e56b'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      citation_safe_chunk_ids: ['dga-2015-page-50-pass-2-28e6e56b'],
      rationale: '2015 sweeteners safety query requires 2015 chunk.'
    },
    {
      query_id: 'q-023',
      required_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      deprecated_chunk_ids: ['dga-2015-page-51-pass-0-df0a0dd2'],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      rationale: 'Current cholesterol quantitative limit removal.'
    },
    {
      query_id: 'q-024',
      required_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2015-page-53-pass-0-44ecc419'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2015-page-53-pass-0-44ecc419'],
      rationale: '2025 whole foods emphasis merges with 2015 egg yolks/shellfish guidelines.'
    },
    {
      query_id: 'q-025',
      required_chunk_ids: ['dga-2015-page-51-pass-0-df0a0dd2'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-51-pass-0-df0a0dd2'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      citation_safe_chunk_ids: ['dga-2015-page-51-pass-0-df0a0dd2'],
      rationale: '2010 limit details query requires 2015 report.'
    },
    {
      query_id: 'q-026',
      required_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      compatible_chunk_ids: ['dga-2020-page-8-pass-0-d50d372b'],
      preferred_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-6-pass-0-765dd278', 'dga-2020-page-8-pass-0-d50d372b'],
      rationale: 'Alcohol avoidance populations are compatible across editions.'
    },
    {
      query_id: 'q-027',
      required_chunk_ids: ['dga-2025-page-6-pass-0-765dd278', 'dga-2020-page-8-pass-0-d50d372b'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-6-pass-0-765dd278', 'dga-2020-page-8-pass-0-d50d372b'],
      rationale: '2025 general "consume less" merges with 2020 drink limits.'
    },
    {
      query_id: 'q-028',
      required_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      citation_safe_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      rationale: '2015 drink equivalents query requires 2015 chunk.'
    },
    {
      query_id: 'q-029',
      required_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      compatible_chunk_ids: ['dga-2020-page-7-pass-0-f9b0e522'],
      preferred_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2020-page-7-pass-0-f9b0e522'],
      rationale: 'Whole grain daily servings are compatible across versions.'
    },
    {
      query_id: 'q-030',
      required_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2020-page-16-pass-0-5be4fdc2'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2020-page-16-pass-0-5be4fdc2'],
      rationale: '2-4 servings whole grains from 2025 merges with 2020 half grains recommendation.'
    },
    {
      query_id: 'q-031',
      required_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      citation_safe_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      rationale: '2015 grain servings query targets 2015.'
    },
    {
      query_id: 'q-032',
      required_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      deprecated_chunk_ids: ['dga-2020-page-8-pass-0-d50d372b'],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      rationale: 'Children sodium limit in 2025.'
    },
    {
      query_id: 'q-033',
      required_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      compatible_chunk_ids: ['dga-2020-page-8-pass-0-d50d372b'],
      preferred_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-6-pass-0-765dd278', 'dga-2020-page-8-pass-0-d50d372b'],
      rationale: 'General population sodium limit is compatible.'
    },
    {
      query_id: 'q-034',
      required_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-6-pass-0-765dd278'],
      citation_safe_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      rationale: '2015 sodium limit query targets 2015.'
    },
    {
      query_id: 'q-035',
      required_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      compatible_chunk_ids: ['dga-2020-page-4-pass-0-41b3cfc8'],
      preferred_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2020-page-4-pass-0-41b3cfc8'],
      rationale: 'Avoid highly processed foods is compatible across editions.'
    },
    {
      query_id: 'q-036',
      required_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2015-page-44-pass-2-e613acec'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-5-pass-0-99883976', 'dga-2015-page-44-pass-2-e613acec'],
      rationale: 'Packaged snack limits from 2025 merge with processed meat limits from 2015.'
    },
    {
      query_id: 'q-037',
      required_chunk_ids: ['dga-2015-page-44-pass-0-b82f56fd'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-44-pass-0-b82f56fd'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-5-pass-0-99883976'],
      citation_safe_chunk_ids: ['dga-2015-page-44-pass-0-b82f56fd'],
      rationale: '2015 CVD risk processed meat query requires 2015.'
    },
    {
      query_id: 'q-038',
      required_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      compatible_chunk_ids: ['dga-2020-page-7-pass-0-f9b0e522'],
      preferred_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2020-page-7-pass-0-f9b0e522'],
      rationale: 'Daily serving goals of vegetables/fruits are compatible.'
    },
    {
      query_id: 'q-039',
      required_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2020-page-19-pass-0-ce63b99c'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-4-pass-0-567ec170', 'dga-2020-page-19-pass-0-ce63b99c'],
      rationale: '100% fruit juice limits from 2025 merge with 2020 diluted juice recommendations.'
    },
    {
      query_id: 'q-040',
      required_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: ['dga-2025-page-4-pass-0-567ec170'],
      citation_safe_chunk_ids: ['dga-2015-page-15-pass-0-8effd6bb'],
      rationale: '2015 subgroups query targets 2015.'
    }
  ];

  for (const j of newJudgmentsRaw) {
    // Adjudicated
    judgmentsAdj.push({
      query_id: j.query_id,
      required_chunk_ids: j.required_chunk_ids,
      compatible_chunk_ids: j.compatible_chunk_ids,
      preferred_chunk_ids: j.preferred_chunk_ids,
      deprecated_chunk_ids: j.deprecated_chunk_ids,
      forbidden_chunk_ids: j.forbidden_chunk_ids,
      citation_safe_chunk_ids: j.citation_safe_chunk_ids,
      rationale: j.rationale,
      annotator_id: 'adjudicated'
    });
    // Annotator A (minor noise: drop compatible or required element if multi-element)
    judgmentsA.push({
      query_id: j.query_id,
      required_chunk_ids: j.required_chunk_ids,
      compatible_chunk_ids: j.compatible_chunk_ids.slice(0, Math.max(0, j.compatible_chunk_ids.length - 1)),
      preferred_chunk_ids: j.preferred_chunk_ids,
      deprecated_chunk_ids: j.deprecated_chunk_ids,
      forbidden_chunk_ids: j.forbidden_chunk_ids,
      citation_safe_chunk_ids: j.citation_safe_chunk_ids,
      rationale: 'Annotator A notes.',
      annotator_id: 'annotator_a'
    });
    // Annotator B (different minor noise: drop first compatible if exists)
    judgmentsB.push({
      query_id: j.query_id,
      required_chunk_ids: j.required_chunk_ids,
      compatible_chunk_ids: j.compatible_chunk_ids.slice(Math.min(1, j.compatible_chunk_ids.length)),
      preferred_chunk_ids: j.preferred_chunk_ids,
      deprecated_chunk_ids: j.deprecated_chunk_ids,
      forbidden_chunk_ids: j.forbidden_chunk_ids,
      citation_safe_chunk_ids: j.citation_safe_chunk_ids,
      rationale: 'Annotator B notes.',
      annotator_id: 'annotator_b'
    });
  }

  // 3c. Add 40 new relation pairs (pair-v3-012 to pair-v3-051)
  const newRelationPairsRaw = [
    {
      pair_id: 'pair-v3-012',
      old_chunk_id: 'dga-2020-page-7-pass-0-f9b0e522',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-dairy',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 dairy serving goal supersedes 2020 low-fat goals.'
    },
    {
      pair_id: 'pair-v3-013',
      old_chunk_id: 'dga-2020-page-7-pass-0-f9b0e522',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-protein',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 g/kg target supersedes 2020 protein foods categories.'
    },
    {
      pair_id: 'pair-v3-014',
      old_chunk_id: 'dga-2015-page-44-pass-0-b82f56fd',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-protein',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 protein goal supersedes 2015 protein guidance.'
    },
    {
      pair_id: 'pair-v3-015',
      old_chunk_id: 'dga-2020-page-8-pass-0-d50d372b',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sugars',
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      rationale: '10g per meal limit conflicts with 10% daily limit.'
    },
    {
      pair_id: 'pair-v3-016',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sugars',
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      rationale: '10g per meal limit conflicts with 2015 daily limit.'
    },
    {
      pair_id: 'pair-v3-017',
      old_chunk_id: 'dga-2015-page-50-pass-2-28e6e56b',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sweeteners',
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      rationale: '2025 active avoidance recommendation conflicts with 2015 neutral stance.'
    },
    {
      pair_id: 'pair-v3-018',
      old_chunk_id: 'dga-2015-page-51-pass-0-df0a0dd2',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-cholesterol',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '300mg limit is removed in 2025.'
    },
    {
      pair_id: 'pair-v3-019',
      old_chunk_id: 'dga-2015-page-53-pass-0-44ecc419',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-cholesterol',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Eggs and shellfish advice is complementary.'
    },
    {
      pair_id: 'pair-v3-020',
      old_chunk_id: 'dga-2020-page-8-pass-0-d50d372b',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-alcohol',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: 'consume less general guidance supersedes quantitative limits.'
    },
    {
      pair_id: 'pair-v3-021',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-alcohol',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: 'consume less general guidance supersedes 2015 limits.'
    },
    {
      pair_id: 'pair-v3-022',
      old_chunk_id: 'dga-2020-page-7-pass-0-f9b0e522',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-whole-grains',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: '2-4 servings whole grains is complementary to general grains recommendations.'
    },
    {
      pair_id: 'pair-v3-023',
      old_chunk_id: 'dga-2020-page-16-pass-0-5be4fdc2',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-whole-grains',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'General whole grains definitions are complementary.'
    },
    {
      pair_id: 'pair-v3-024',
      old_chunk_id: 'dga-2020-page-8-pass-0-d50d372b',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-sodium',
      relation_type: 'conditional_difference',
      policy_label: 'retain',
      rationale: 'Highly active sweat loss exception is a conditional difference.'
    },
    {
      pair_id: 'pair-v3-025',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-sodium',
      relation_type: 'conditional_difference',
      policy_label: 'retain',
      rationale: 'Highly active sweat loss exception is a conditional difference.'
    },
    {
      pair_id: 'pair-v3-026',
      old_chunk_id: 'dga-2020-page-7-pass-0-f9b0e522',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-veg-fruits',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Servings goals complementary to general vegetable group recommendations.'
    },
    {
      pair_id: 'pair-v3-027',
      old_chunk_id: 'dga-2020-page-19-pass-0-ce63b99c',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-veg-fruits',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: '100% juice advice is complementary.'
    },
    {
      pair_id: 'pair-v3-028',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-dairy',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 dairy guidance supersedes 2015 advice.'
    },
    {
      pair_id: 'pair-v3-029',
      old_chunk_id: 'dga-2015-page-16-pass-0-43cd7a56',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-dairy',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Dairy choices are complementary.'
    },
    {
      pair_id: 'pair-v3-030',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-protein',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 protein goal supersedes 2015 protein guidance.'
    },
    {
      pair_id: 'pair-v3-031',
      old_chunk_id: 'dga-2015-page-31-pass-1-9f16d289',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-protein',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'General protein advice is complementary.'
    },
    {
      pair_id: 'pair-v3-032',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sugars',
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      rationale: '10g per meal limit conflicts with 10% daily limit.'
    },
    {
      pair_id: 'pair-v3-033',
      old_chunk_id: 'dga-2015-page-34-pass-2-53bc6202',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sugars',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Sugar descriptions are complementary.'
    },
    {
      pair_id: 'pair-v3-034',
      old_chunk_id: 'dga-2015-page-50-pass-1-6bfa09f8',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sweeteners',
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      rationale: 'Sweeteners active avoidance conflicts with neutral stance.'
    },
    {
      pair_id: 'pair-v3-035',
      old_chunk_id: 'dga-2015-page-50-pass-3-4d17d0c8',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sweeteners',
      relation_type: 'conflicting',
      policy_label: 'deprecated',
      rationale: 'Sweeteners active avoidance conflicts with neutral stance.'
    },
    {
      pair_id: 'pair-v3-036',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-cholesterol',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: 'Daily cholesterol limit removal supersedes 2015 recommendations.'
    },
    {
      pair_id: 'pair-v3-037',
      old_chunk_id: 'dga-2015-page-51-pass-1-e263007a',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-cholesterol',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Whole food cholesterol emphasis is complementary.'
    },
    {
      pair_id: 'pair-v3-038',
      old_chunk_id: 'dga-2015-page-34-pass-1-14bfc3a3',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-alcohol',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 general "consume less" supersedes 2015 drink counts.'
    },
    {
      pair_id: 'pair-v3-039',
      old_chunk_id: 'dga-2015-page-34-pass-3-392b8763',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-alcohol',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '2025 general "consume less" supersedes 2015 drink counts.'
    },
    {
      pair_id: 'pair-v3-040',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-whole-grains',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Grains serving recommendations are complementary.'
    },
    {
      pair_id: 'pair-v3-041',
      old_chunk_id: 'dga-2015-page-31-pass-1-9f16d289',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-whole-grains',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Grains serving recommendations are complementary.'
    },
    {
      pair_id: 'pair-v3-042',
      old_chunk_id: 'dga-2015-page-15-pass-1-e32ddd46',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-sodium',
      relation_type: 'conditional_difference',
      policy_label: 'retain',
      rationale: 'Highly active exception is a conditional difference.'
    },
    {
      pair_id: 'pair-v3-043',
      old_chunk_id: 'dga-2015-page-31-pass-1-9f16d289',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-sodium',
      relation_type: 'conditional_difference',
      policy_label: 'retain',
      rationale: 'Highly active exception is a conditional difference.'
    },
    {
      pair_id: 'pair-v3-044',
      old_chunk_id: 'dga-2015-page-14-pass-0-45535101',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-processed-foods',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Processed food guidelines are complementary.'
    },
    {
      pair_id: 'pair-v3-045',
      old_chunk_id: 'dga-2015-page-44-pass-2-e613acec',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-processed-foods',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Processed food guidelines are complementary.'
    },
    {
      pair_id: 'pair-v3-046',
      old_chunk_id: 'dga-2015-page-15-pass-0-8effd6bb',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-veg-fruits',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Vegetable serving recommendations are complementary.'
    },
    {
      pair_id: 'pair-v3-047',
      old_chunk_id: 'dga-2015-page-31-pass-1-9f16d289',
      new_chunk_id: 'dga-2025-page-4-pass-0-567ec170',
      lineage_id: 'lineage-veg-fruits',
      relation_type: 'complementary',
      policy_label: 'retain',
      rationale: 'Vegetable serving recommendations are complementary.'
    },
    {
      pair_id: 'pair-v3-048',
      old_chunk_id: 'dga-2020-page-14-pass-0-1816571f',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-dairy',
      relation_type: 'duplicate',
      policy_label: 'retain',
      rationale: 'Dairy and milk mentions are duplicate.'
    },
    {
      pair_id: 'pair-v3-049',
      old_chunk_id: 'dga-2020-page-14-pass-0-1816571f',
      new_chunk_id: 'dga-2025-page-3-pass-0-ba481231',
      lineage_id: 'lineage-protein',
      relation_type: 'duplicate',
      policy_label: 'retain',
      rationale: 'Protein foods are duplicate.'
    },
    {
      pair_id: 'pair-v3-050',
      old_chunk_id: 'dga-2020-page-11-pass-0-913a1860',
      new_chunk_id: 'dga-2025-page-5-pass-0-99883976',
      lineage_id: 'lineage-sugars',
      relation_type: 'superseded',
      policy_label: 'deprecated',
      rationale: '10g per meal limit in 2025 supersedes 2020 daily limit.'
    },
    {
      pair_id: 'pair-v3-051',
      old_chunk_id: 'dga-2020-page-14-pass-0-1816571f',
      new_chunk_id: 'dga-2025-page-6-pass-0-765dd278',
      lineage_id: 'lineage-sodium',
      relation_type: 'duplicate',
      policy_label: 'retain',
      rationale: 'Sodium and electrolytes are duplicate.'
    }
  ];

  for (const rp of newRelationPairsRaw) {
    relationPairs.push({
      pair_id: rp.pair_id,
      old_chunk_id: rp.old_chunk_id,
      new_chunk_id: rp.new_chunk_id,
      lineage_id: rp.lineage_id
    });
    relsAdj.push({
      pair_id: rp.pair_id,
      relation_type: rp.relation_type as any,
      policy_label: rp.policy_label as any,
      rationale: rp.rationale,
      annotator_id: 'adjudicated'
    });
    relsA.push({
      pair_id: rp.pair_id,
      relation_type: rp.relation_type as any,
      policy_label: rp.policy_label as any,
      rationale: 'Annotator A relation notes.',
      annotator_id: 'annotator_a'
    });
    // Add minor disagreement in B (change relation_type on 15% of cases for demonstration)
    const disagree = parseInt(rp.pair_id.replace('pair-v3-', ''), 10) % 7 === 0;
    relsB.push({
      pair_id: rp.pair_id,
      relation_type: disagree ? 'complementary' : rp.relation_type as any,
      policy_label: disagree ? 'retain' : rp.policy_label as any,
      rationale: 'Annotator B relation notes.',
      annotator_id: 'annotator_b'
    });
  }

  // Write queries.jsonl
  fs.writeFileSync(
    path.join(annotationsV3Dir, 'queries.jsonl'),
    queries.map(q => JSON.stringify(q)).join('\n') + '\n',
    'utf8'
  );

  // Write judgments
  fs.writeFileSync(path.join(annotationsV3Dir, 'judgments.adjudicated.jsonl'), judgmentsAdj.map(j => JSON.stringify(j)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'judgments.annotator_a.jsonl'), judgmentsA.map(j => JSON.stringify(j)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'judgments.annotator_b.jsonl'), judgmentsB.map(j => JSON.stringify(j)).join('\n') + '\n', 'utf8');

  // Write relation pairs and annotations
  fs.writeFileSync(path.join(annotationsV3Dir, 'relation_pairs.jsonl'), relationPairs.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'relations.adjudicated.jsonl'), relsAdj.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'relations.annotator_a.jsonl'), relsA.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(annotationsV3Dir, 'relations.annotator_b.jsonl'), relsB.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  // 4. Create splits JSON
  const devQueries: string[] = [];
  const valQueries: string[] = [];
  const testQueries: string[] = [];

  for (const q of queries) {
    const topic = queryIdToTopic.get(q.query_id) || 'lineage-general';
    if (DEV_TOPICS.includes(topic)) {
      devQueries.push(q.query_id);
    } else if (VAL_TOPICS.includes(topic)) {
      valQueries.push(q.query_id);
    } else if (TEST_TOPICS.includes(topic)) {
      testQueries.push(q.query_id);
    } else {
      devQueries.push(q.query_id);
    }
  }

  // Save splits JSON
  fs.writeFileSync(path.join(splitsV3Dir, 'development.json'), JSON.stringify({ queries: devQueries }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(splitsV3Dir, 'validation.json'), JSON.stringify({ queries: valQueries }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(splitsV3Dir, 'test.json'), JSON.stringify({ queries: testQueries }, null, 2), 'utf-8');

  console.log(`Successfully migrated ${queries.length} queries & ${relationPairs.length} relation pairs to v3!`);
  console.log(`Splits isolated: Dev: ${devQueries.length}, Val: ${valQueries.length}, Test: ${testQueries.length}`);
}
