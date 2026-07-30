import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const INPUT = path.join(EXP, 'data/annotations_v5/codex_mined_relation_pairs/reviewed_pairs.jsonl');
const CHUNKS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const OUT = path.join(EXP, 'data/configs/v5_r2_action_detector');
const REVIEW = path.join(EXP, 'data/annotations_v5/r2_action_detector');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const preserved = new Set(['conditional_difference', 'complementary']);
const priorValidationIds = new Set(['v5claim-006', 'v5claim-010', 'v5claim-012', 'v5claim-015', 'v5claim-018']);

const [inputText, chunksText] = await Promise.all([readFile(INPUT, 'utf8'), readFile(CHUNKS, 'utf8')]);
const sourceRows = parseJsonl(inputText);
const chunks = parseJsonl(chunksText);
const chunkById = new Map(chunks.map((row: any) => [row.chunk_id, row]));

const correctedRelations = new Map([['v5claim-006', 'conditional_difference']]);
const development = sourceRows.map((row: any) => {
  const corrected = correctedRelations.get(row.pair_id) || row.relation_type;
  return {
    ...row,
    pair_id: `r2dev-${row.pair_id}`,
    source_pair_id: row.pair_id,
    original_relation_type: row.relation_type,
    corrected_relation_type: corrected,
    action_label: preserved.has(corrected) ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED',
    correction_applied: corrected !== row.relation_type,
    prior_failed_validation_reclassified_as_development: priorValidationIds.has(row.pair_id),
    fresh_v5_test_eligible: false,
    detector_development_eligible: true,
  };
});

const oldSource = {
  document_id: 'who-fao-trs-916-2003',
  edition: '2003',
  published_at: '2003-04-22',
  official_url: 'https://www.fao.org/4/AC911E/AC911E00.htm',
  official_pdf_url: 'https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf',
  who_record_url: 'https://iris.who.int/bitstream/handle/10665/42665/WHO_TRS_916.pdf?sequence=1',
  local_path: 'experiments/version_aware_rag/data/sources_v5/who_fao/WHO_FAO_TRS_916_2003_part2.pdf',
  source_sha256: 'f7d8b51b455f4853354b1b86339797da689426f440bc3fa62304eaa4b3d29429',
  page_number: 3,
  printed_page_number: 56,
};

function oldEvidence(text: string) {
  return { ...oldSource, text, text_sha256: sha256(text), extraction_method: 'pdfplumber_0.11.9_plus_visual_poppler_verification' };
}

function chunkEvidence(chunkId: string, text: string) {
  const chunk: any = chunkById.get(chunkId);
  if (!chunk) throw new Error(`Missing source chunk ${chunkId}`);
  if (!normalize(chunk.text).includes(normalize(text))) throw new Error(`Evidence quote not found in ${chunkId}: ${text}`);
  return {
    document_id: chunk.document_id,
    edition: chunk.edition,
    published_at: chunk.published_at,
    official_url: chunk.source_url,
    official_pdf_url: chunk.source_download_url,
    local_path: `experiments/version_aware_rag/data/sources_v4/who/${{
      'who-carbohydrate-2023': 'who_carbohydrate_2023.pdf',
      'who-total-fat-2023': 'who_total_fat_2023.pdf',
      'who-sat-trans-fat-2023': 'who_saturated_trans_fat_2023.pdf',
      'who-sugars-2015': 'who_sugars_2015.pdf',
      'who-nss-2023': 'who_non_sugar_sweeteners_2023.pdf',
      'who-sodium-2012': 'who_sodium_2012.pdf',
      'who-potassium-2012': 'who_potassium_2012.pdf',
      'who-lsss-2025': 'who_lower_sodium_salt_substitutes_2025.pdf',
    }[chunk.document_id]}`,
    source_sha256: chunk.source_checksum,
    page_number: chunk.page_number,
    chunk_id: chunk.chunk_id,
    text,
    text_sha256: sha256(text),
    extraction_method: 'frozen_v4_pdf_chunk_exact_substring',
  };
}

const E = {
  totalFatReplacement: chunkEvidence('who-total-fat-2023-page-9-pass-1-d8028a183f', 'The guidance in this guideline replaces previous WHO guidance on total fat intake, including that from the 1989 WHO Study Group on Diet, Nutrition and the Prevention of Chronic Diseases and the 2002 Joint WHO/FAO Expert Consultation on Diet, Nutrition and the Prevention of Chronic Diseases.'),
  satFatReplacement: chunkEvidence('who-sat-trans-fat-2023-page-9-pass-1-7c6dee9464', 'The guidance in this guideline replaces previous WHO guidance on SFA and TFA intake, including that from the 1989 WHO Study Group on Diet, Nutrition and the Prevention of Chronic Diseases and the 2002 Joint WHO/FAO Expert Consultation on Diet, Nutrition and the Prevention of Chronic Diseases.'),
  carbReplacement: chunkEvidence('who-carbohydrate-2023-page-16-pass-1-411225edc3', 'The guidance in this guideline replaces previous WHO guidance on carbohydrate intake, including that from the 1989 WHO Study Group on Diet, Nutrition and the Prevention of Chronic Diseases (31) and the 2002 Joint WHO/FAO Expert Consultation on Diet, Nutrition and the Prevention of Chronic Diseases (32).'),
  carbohydrate: chunkEvidence('who-carbohydrate-2023-page-10-pass-0-d0ff69fccf', 'WHO recommends that carbohydrate intake should come primarily from whole grains, vegetables, fruits and pulses (strong recommendation, relevant for all individuals 2 years of age and older).'),
  fruitAdult: chunkEvidence('who-carbohydrate-2023-page-10-pass-0-d0ff69fccf', 'In adults, WHO recommends an intake of at least 400 g of vegetables and fruits per day (strong recommendation).'),
  fibreAdult: chunkEvidence('who-carbohydrate-2023-page-10-pass-0-d0ff69fccf', 'In adults, WHO recommends an intake of at least 25 g per day of naturally occurring dietary fibre as consumed in foods (strong recommendation).'),
  totalFat: chunkEvidence('who-total-fat-2023-page-10-pass-0-55a27fcbc1', 'To reduce the risk of unhealthy weight gain, WHO suggests that adults limit total fat intake to 30% of total energy intake or less (conditional recommendation)'),
  saturatedFat: chunkEvidence('who-sat-trans-fat-2023-page-11-pass-0-241c79aa0a', 'WHO recommends that adults and children reduce saturated fatty acid intake to 10% of total energy intake (strong recommendation).'),
  sugars: chunkEvidence('who-sugars-2015-page-12-pass-0-737526a649', 'In both adults and children, WHO recommends reducing the intake of free sugars to less than 10% of total energy intake 2 (strong recommendation).'),
  nss: chunkEvidence('who-nss-2023-page-10-pass-1-9d61be8a51', 'WHO suggests that non-sugar sweeteners not be used as a means of achieving weight control or reducing the risk of noncommunicable diseases (conditional recommendation).'),
  sodium: chunkEvidence('who-sodium-2012-page-10-pass-1-94b88869a3', 'WHO recommends a reduction to <2 g/day sodium (5 g/day salt) in adults (strong recommendation).'),
  potassium: chunkEvidence('who-potassium-2012-page-10-pass-1-d7bcb1c747', 'WHO suggests a potassium intake of at least 90 mmol/day (3510 mg/day) for adults (conditional recommendation2 ).'),
  lsss: chunkEvidence('who-lsss-2025-page-12-pass-0-a257aa450a', 'WHO suggests replacing regular table salt with lower-sodium salt substitutes that contain potassium (conditional recommendation).'),
  lsssScope: chunkEvidence('who-lsss-2025-page-12-pass-0-a257aa450a', 'This recommendation is intended for adults (not pregnant women or children) in general populations, excluding individuals with kidney impairments or with other circumstances or conditions that might compromise potassium excretion.'),
};

const validation = [
  ['r2val-block-total-fat', 'BLOCK_RETAINED', 'total fat guidance replacement', oldEvidence('Total fat: 15–30% of total energy.'), E.totalFatReplacement, 'The current guideline explicitly replaces the 2002/2003 total-fat guidance.'],
  ['r2val-block-saturated-fat', 'BLOCK_RETAINED', 'saturated fat guidance replacement', oldEvidence('Saturated fatty acids: less than 10% of total energy.'), E.satFatReplacement, 'The current SFA/TFA guideline explicitly replaces the older guidance.'],
  ['r2val-block-trans-fat', 'BLOCK_RETAINED', 'trans fat guidance replacement', oldEvidence('Trans fatty acids: less than 1% of total energy.'), E.satFatReplacement, 'The current SFA/TFA guideline explicitly replaces the older guidance.'],
  ['r2val-block-carbohydrate', 'BLOCK_RETAINED', 'carbohydrate guidance replacement', oldEvidence('Total carbohydrate: 55–75% of total energy.'), E.carbReplacement, 'The current carbohydrate guideline explicitly replaces the 2002/2003 guidance.'],
  ['r2val-block-fruit-veg', 'BLOCK_RETAINED', 'fruit and vegetable threshold update', oldEvidence('Fruits and vegetables: at least 400 g per day.'), E.fruitAdult, 'The newer recommendation is the current adult threshold; the old duplicate should not consume a second retrieval slot.'],
  ['r2val-block-fibre', 'BLOCK_RETAINED', 'dietary fibre threshold update', oldEvidence('Total dietary fibre: from foods.'), E.fibreAdult, 'The newer guidance supplies the current quantitative adult threshold and displaces the vague older statement.'],
  ['r2val-pair-fat-quantity-quality', 'PAIR_PRESERVE', 'total fat quantity plus saturated fat quality', E.totalFat, E.saturatedFat, 'Total-fat quantity and saturated-fat composition are distinct, simultaneously applicable constraints.'],
  ['r2val-pair-sugars-nss', 'PAIR_PRESERVE', 'free sugars plus non-sugar sweeteners', E.sugars, E.nss, 'Free-sugar limits and non-sugar-sweetener guidance address distinct substitution choices.'],
  ['r2val-pair-sodium-potassium', 'PAIR_PRESERVE', 'sodium reduction plus potassium intake', E.sodium, E.potassium, 'Both electrolyte recommendations remain applicable and provide distinct targets.'],
  ['r2val-pair-sodium-lsss', 'PAIR_PRESERVE', 'sodium target plus lower-sodium salt implementation', E.sodium, E.lsss, 'The older sodium target and newer implementation option contribute distinct compatible evidence.'],
  ['r2val-pair-potassium-lsss-safety', 'PAIR_PRESERVE', 'potassium target plus LSSS safety scope', E.potassium, E.lsssScope, 'The general potassium target and newer exclusion conditions are jointly required for safe advice.'],
  ['r2val-pair-carbohydrate-sugars', 'PAIR_PRESERVE', 'carbohydrate sources plus free-sugar limit', E.carbohydrate, E.sugars, 'Carbohydrate source quality and the free-sugar ceiling are distinct compatible constraints.'],
].map(([pair_id, action_label, topic, old_evidence, current_evidence, reviewer_rationale], index) => ({
  pair_id, action_label, topic, old_evidence, current_evidence, reviewer_rationale,
  reviewer_id: 'codex-gpt5-primary-reviewer', reviewer_type: 'ai_primary_reviewer_not_independent_human',
  review_decision: 'accept', evidence_alignment_verified: true, deterministic_order: index + 1,
  development_eligible: false, validation_only: true, fresh_v5_test_eligible: false,
}));

const devEvidence = new Set(development.flatMap((row: any) => [row.old_evidence.text_sha256, row.current_evidence.text_sha256]));
const valEvidence = validation.flatMap((row: any) => [(row.old_evidence as any).text_sha256, (row.current_evidence as any).text_sha256]);
const overlap = [...new Set(valEvidence.filter((hash: string) => devEvidence.has(hash)))];
if (overlap.length) throw new Error(`R2 development/validation evidence leakage: ${overlap.join(',')}`);

await Promise.all([mkdir(OUT, { recursive: true }), mkdir(REVIEW, { recursive: true })]);
const devText = development.map((row: any) => JSON.stringify(row)).join('\n') + '\n';
const valText = validation.map((row: any) => JSON.stringify(row)).join('\n') + '\n';
const correction = {
  correction_id: 'r2-correction-v5claim-006', source_pair_id: 'v5claim-006', original_relation_type: 'duplicate',
  corrected_relation_type: 'conditional_difference', resulting_action_label: 'PAIR_PRESERVE',
  reason: 'The newer passage explicitly adds applicability starting at age 2; treating the pair as a pure duplicate discards a scope condition.',
  correction_timing: 'post_failed_validation_diagnosis', original_artifact_mutated: false,
  eligible_use: 'r2_development_only', reviewer_id: 'codex-gpt5-primary-reviewer',
};
const correctionText = JSON.stringify(correction) + '\n';
await writeFile(path.join(OUT, 'development.jsonl'), devText, 'utf8');
await writeFile(path.join(OUT, 'validation.sealed.jsonl'), valText, 'utf8');
await writeFile(path.join(REVIEW, 'CORRECTION_LEDGER.jsonl'), correctionText, 'utf8');
const manifest = {
  schema_version: 'v5-r2-action-detector-1', status: 'r2_split_frozen_before_model_calls',
  endpoint: 'binary_retrieval_action', labels: ['PAIR_PRESERVE', 'BLOCK_RETAINED'],
  development_count: development.length, validation_count: validation.length,
  development_distribution: Object.fromEntries(['PAIR_PRESERVE', 'BLOCK_RETAINED'].map((x) => [x, development.filter((r: any) => r.action_label === x).length])),
  validation_distribution: Object.fromEntries(['PAIR_PRESERVE', 'BLOCK_RETAINED'].map((x) => [x, validation.filter((r: any) => r.action_label === x).length])),
  development_includes_all_prior_failed_validation: true, validation_sources: ['WHO', 'FAO'],
  evidence_hash_overlap_count: overlap.length, validation_labels_must_not_be_read_during_development_selection: true,
  input_sha256: sha256(inputText), chunks_sha256: sha256(chunksText), correction_ledger_sha256: sha256(correctionText),
  development_sha256: sha256(devText), validation_sealed_sha256: sha256(valText),
  reviewer_provenance: 'codex-gpt5-primary-reviewer_not_independent_human', fresh_v5_test_created: false,
};
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(path.join(OUT, 'SPLIT_MANIFEST.json'), manifestText, 'utf8');
await writeFile(path.join(OUT, 'EXECUTION_GUARD.json'), JSON.stringify({
  status: 'development_unlocked', split_manifest_sha256: sha256(manifestText), development_selection_complete: false,
  validation_execution_count: 0, tuning_after_validation_allowed: false, fresh_v5_test_created: false,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
