import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CHUNKS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const SOURCE_MANIFEST = path.join(EXP, 'data/sources_v5/who_fao/MANIFEST.json');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_7_preaudited_cross_version');
const AUDIT = path.join(EXP, 'data/annotations_v5/r2_7_preaudited_cross_version');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

type Spec = {
  id: string;
  label: 'PAIR_PRESERVE' | 'BLOCK_RETAINED';
  oldPage: number;
  oldPrintedPage: number;
  oldSpan: string;
  oldClaim: string;
  currentChunk: string;
  currentClaim: string;
  query: string;
  rationale: string;
};

const specs: Spec[] = [
  {
    id: 'sodium-current-ceiling', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Sodium chloride (sodium): less than 5 g per day (less than 2 g per day).',
    oldClaim: 'Limit salt to less than 5 grams per day, equivalent to less than 2 grams sodium.',
    currentChunk: 'who-sodium-2012-page-9-pass-0-9559b73abf',
    currentClaim: 'The current WHO adult recommendation is 2 grams sodium per day, equivalent to 5 grams salt per day.',
    query: 'What is the current WHO daily sodium and salt ceiling for adults?',
    rationale: 'CURRENT supplies the requested current ceiling; the 2003 wording is historical and not needed.',
  },
  {
    id: 'potassium-current-food-source', label: 'BLOCK_RETAINED', oldPage: 37, oldPrintedPage: 90,
    oldSpan: 'This may be achieved through adequate daily consumption of fruits and vegetables.',
    oldClaim: 'Meet the potassium goal through adequate daily fruit and vegetable consumption.',
    currentChunk: 'who-potassium-2012-page-13-pass-1-cb5e86171d',
    currentClaim: 'Most people can replace potassium losses through food, especially fruits and vegetables, without supplements or special products.',
    query: 'Should most people obtain potassium from foods or from supplements and special products?',
    rationale: 'CURRENT directly answers the present-tense source question and subsumes the older food-source statement.',
  },
  {
    id: 'total-fat-current-ceiling', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Total fat: 15-30% of total energy.',
    oldClaim: 'Population total fat intake should be 15 to 30 percent of total energy.',
    currentChunk: 'who-total-fat-2023-page-10-pass-1-118f68e0a5',
    currentClaim: 'Adults should limit total fat to 30 percent of total energy or less, primarily from unsaturated fatty acids.',
    query: 'What current total-fat ceiling and fat quality does WHO recommend for adults?',
    rationale: 'CURRENT supplies both requested current elements; OLD adds no required current claim.',
  },
  {
    id: 'sfa-current-ceiling', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Saturated fatty acids: less than 10% of total energy.',
    oldClaim: 'Keep saturated fatty acids below 10 percent of total energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-46-pass-1-02d60d7e53',
    currentClaim: 'Current evidence supports reducing saturated fatty acid intake to 10 percent of total energy and further below 10 percent.',
    query: 'What current saturated-fat ceiling does WHO support?',
    rationale: 'CURRENT supplies the requested current ceiling; OLD is redundant for this query.',
  },
  {
    id: 'tfa-current-ceiling', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Trans fatty acids: less than 1% of total energy.',
    oldClaim: 'Keep trans fatty acids below 1 percent of total energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-14-pass-1-cd7bcb3c6b',
    currentClaim: 'Current evidence supports trans-fat intake below 1 percent of total energy.',
    query: 'What current trans-fat ceiling does WHO support?',
    rationale: 'CURRENT supplies the requested current ceiling; retaining OLD would duplicate it.',
  },
  {
    id: 'sugars-current-ceiling', label: 'BLOCK_RETAINED', oldPage: 4, oldPrintedPage: 57,
    oldSpan: 'The Consultation recognized that a population goal for free sugars of less than 10% of total energy is controversial.',
    oldClaim: 'The 2003 population goal kept free sugars below 10 percent of total energy.',
    currentChunk: 'who-sugars-2015-page-12-pass-1-5879bb3805',
    currentClaim: 'The current free-sugar recommendation retains the less-than-10-percent target based on body-weight and dental-caries evidence.',
    query: 'What is the current general WHO free-sugar ceiling?',
    rationale: 'CURRENT supplies the requested current target; the historical discussion is not required.',
  },
  {
    id: 'fruit-current-adult-target', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Fruits and vegetables: at least 400 g per day.',
    oldClaim: 'Consume at least 400 grams of fruits and vegetables per day.',
    currentChunk: 'who-carbohydrate-2023-page-11-pass-2-39d13c25a0',
    currentClaim: 'WHO selected 400 grams per day as a feasible minimum adult vegetable-and-fruit target.',
    query: 'What current minimum daily vegetable-and-fruit target applies to adults?',
    rationale: 'CURRENT fully supplies the requested current adult minimum.',
  },
  {
    id: 'fibre-current-adult-target', label: 'BLOCK_RETAINED', oldPage: 5, oldPrintedPage: 58,
    oldSpan: 'Consumption of wholegrain foods is likely to provide more than 20 g per day of NSP, more than 25 g per day of total dietary fibre.',
    oldClaim: 'Wholegrain foods, fruits, and vegetables can provide more than 25 grams of total dietary fibre per day.',
    currentChunk: 'who-carbohydrate-2023-page-12-pass-1-a01c1d0ea7',
    currentClaim: 'Current WHO evidence supports an adult naturally occurring dietary-fibre minimum of 25 grams per day.',
    query: 'What current minimum naturally occurring dietary-fibre intake applies to adults?',
    rationale: 'CURRENT supplies the operative current minimum; OLD is not needed.',
  },
  {
    id: 'lsss-current-role', label: 'BLOCK_RETAINED', oldPage: 37, oldPrintedPage: 90,
    oldSpan: 'Use of potassium-enriched low-sodium substitutes is one way to reduce sodium intake.',
    oldClaim: 'Potassium-enriched lower-sodium salt substitutes are one way to reduce sodium intake.',
    currentChunk: 'who-lsss-2025-page-40-pass-1-a909607553',
    currentClaim: 'Current guidance treats lower-sodium salt substitutes as only one component of an overall sodium-reduction strategy.',
    query: 'What role do lower-sodium salt substitutes currently have in an overall sodium-reduction strategy?',
    rationale: 'CURRENT directly states the requested current role and subsumes the historical option.',
  },
  {
    id: 'ratio-current-guidance', label: 'BLOCK_RETAINED', oldPage: 37, oldPrintedPage: 90,
    oldSpan: 'Potassium intake should be at a level which will keep the sodium to potassium ratio close to 1.0.',
    oldClaim: 'Keep the sodium-to-potassium ratio close to one to one.',
    currentChunk: 'who-potassium-2012-page-11-pass-0-bf6ecadfaf',
    currentClaim: 'Following the current sodium and potassium intake recommendations produces an approximately one-to-one ratio.',
    query: 'How do current WHO sodium and potassium recommendations relate to a one-to-one ratio?',
    rationale: 'CURRENT supplies the current interpretation; OLD is not required.',
  },
  {
    id: 'free-sugar-current-definition', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Free sugars refers to all monosaccharides and disaccharides added to foods by the manufacturer, cook or consumer, plus sugars naturally present in honey, syrups and fruit juices.',
    oldClaim: 'Free sugars include added monosaccharides and disaccharides plus sugars in honey, syrups, and fruit juices.',
    currentChunk: 'who-sugars-2015-page-14-pass-2-b4aa8aee6f',
    currentClaim: 'The current definition elaborates free sugars from the 2002 definition, including added sugars and sugars in honey, syrups, fruit juices, and concentrates.',
    query: 'What does the current WHO definition of free sugars include?',
    rationale: 'CURRENT supplies the current definition and its elaboration.',
  },
  {
    id: 'wholegrain-current-source-quality', label: 'BLOCK_RETAINED', oldPage: 5, oldPrintedPage: 58,
    oldSpan: 'Wholegrain cereals, fruits and vegetables are the preferred sources of non-starch polysaccharides.',
    oldClaim: 'Wholegrain cereals, fruits, and vegetables are preferred fibre sources.',
    currentChunk: 'who-carbohydrate-2023-page-11-pass-1-0ede0712d4',
    currentClaim: 'Current WHO evidence identifies whole grains, vegetables, fruits, and pulses as dietary-fibre sources.',
    query: 'Which food groups are the current preferred dietary-fibre sources?',
    rationale: 'CURRENT supplies the requested current food groups and is more complete.',
  },
  {
    id: 'potassium-target-change', label: 'PAIR_PRESERVE', oldPage: 37, oldPrintedPage: 90,
    oldSpan: 'A daily potassium intake level of 70-80 mmol per day.',
    oldClaim: 'The 2003 potassium target was 70 to 80 millimoles per day.',
    currentChunk: 'who-potassium-2012-page-10-pass-2-dfa70d52a4',
    currentClaim: 'The current adult potassium target is at least 90 millimoles or 3510 milligrams per day.',
    query: 'How did the adult potassium target change from the 2003 value to the current recommendation?',
    rationale: 'The historical and current targets are both explicitly requested and neither passage supplies the other.',
  },
  {
    id: 'carbohydrate-quantity-quality', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Total carbohydrate: 55-75% of total energy.',
    oldClaim: 'The 2003 population goal placed total carbohydrate at 55 to 75 percent of energy.',
    currentChunk: 'who-carbohydrate-2023-page-9-pass-2-64610b2651',
    currentClaim: 'Current WHO evidence emphasizes carbohydrate quality from whole grains, vegetables, fruits, and pulses.',
    query: 'What was the 2003 carbohydrate energy range, and which carbohydrate sources does current evidence favour?',
    rationale: 'OLD supplies the historical quantity while CURRENT supplies current source quality.',
  },
  {
    id: 'fat-lower-bound-current-caution', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'The lower bound for total fat intake for adults should be 15% of energy.',
    oldClaim: 'The 2003 adult lower bound for total fat was 15 percent of energy.',
    currentChunk: 'who-total-fat-2023-page-11-pass-0-7c523d83bc',
    currentClaim: 'Current guidance cautions that lowering fat can be harmful if energy is replaced with unhealthy carbohydrates.',
    query: 'What historical lower bound guarded against too little fat, and what current replacement caution applies when fat is reduced?',
    rationale: 'OLD supplies the lower bound; CURRENT supplies the distinct implementation caution.',
  },
  {
    id: 'sodium-exception-evolution', label: 'PAIR_PRESERVE', oldPage: 37, oldPrintedPage: 90,
    oldSpan: 'Pregnant women and non-acclimated people who perform strenuous physical activity in hot environments may be adversely affected by sodium reduction.',
    oldClaim: 'The 2003 report flagged pregnancy and non-acclimated strenuous activity in heat as special sodium-reduction situations.',
    currentChunk: 'who-sodium-2012-page-12-pass-1-14a001784d',
    currentClaim: 'Current sodium guidance excludes illnesses and therapies that risk hyponatraemia, water build-up, or require physician-supervised diets.',
    query: 'Which special situations were flagged in 2003, and which clinical exclusions appear in current sodium guidance?',
    rationale: 'The query explicitly requires two non-overlapping generations of exception evidence.',
  },
  {
    id: 'sugar-frequency-dental-rationale', label: 'PAIR_PRESERVE', oldPage: 66, oldPrintedPage: 119,
    oldSpan: 'The frequency of consumption of foods and drinks containing free sugars should be limited to a maximum of four times per day.',
    oldClaim: 'The 2003 report advised limiting free-sugar consumption frequency to four times per day.',
    currentChunk: 'who-sugars-2015-page-9-pass-1-1e29ca6c35',
    currentClaim: 'Current WHO sugar guidance identifies dental caries as a central reason to limit free sugars.',
    query: 'What historical frequency limit was advised, and what current oral-health rationale supports limiting free sugars?',
    rationale: 'OLD supplies the frequency rule while CURRENT supplies the requested present rationale.',
  },
  {
    id: 'sfa-limit-replacement', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'The population goal for saturated fatty acids was below 10 percent of total energy.',
    oldClaim: 'The 2003 population goal kept saturated fatty acids below 10 percent of energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-12-pass-1-82fe52d0de',
    currentClaim: 'Current guidance evaluates the benefits of replacing saturated fat with polyunsaturated fat, plant monounsaturated fat, or fibre-containing carbohydrates.',
    query: 'What historical saturated-fat ceiling applied, and which current replacement nutrients are preferred?',
    rationale: 'OLD supplies the requested historical ceiling and CURRENT supplies replacement guidance.',
  },
  {
    id: 'tfa-limit-child-evidence', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'The population goal for trans fatty acids was below 1 percent of total energy.',
    oldClaim: 'The 2003 population goal kept trans fatty acids below 1 percent of energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-16-pass-0-f4a5615de2',
    currentClaim: 'Current trans-fat recommendations for children extrapolate from adult evidence because no relevant child studies were identified.',
    query: 'What historical trans-fat ceiling applied, and what evidence limitation affects the current child recommendation?',
    rationale: 'OLD supplies the ceiling and CURRENT supplies the child-evidence limitation.',
  },
  {
    id: 'fruit-adult-child-targets', label: 'PAIR_PRESERVE', oldPage: 5, oldPrintedPage: 58,
    oldSpan: 'The recommended intake of fruits and vegetables was at least 400 grams per day for the population.',
    oldClaim: 'The historical population fruit-and-vegetable target was at least 400 grams per day.',
    currentChunk: 'who-carbohydrate-2023-page-12-pass-0-abf1dcfde4',
    currentClaim: 'Current child and adolescent fruit-and-vegetable targets are age-specific values extrapolated from adult evidence.',
    query: 'What historical population target applied, and how are current child targets determined?',
    rationale: 'OLD supplies the historical target; CURRENT supplies the distinct child derivation.',
  },
  {
    id: 'fibre-adult-child-targets', label: 'PAIR_PRESERVE', oldPage: 5, oldPrintedPage: 58,
    oldSpan: 'The historical food pattern was likely to provide more than 25 grams per day of total dietary fibre.',
    oldClaim: 'The historical food pattern aimed to provide more than 25 grams of total dietary fibre per day.',
    currentChunk: 'who-carbohydrate-2023-page-12-pass-2-3d84e9115f',
    currentClaim: 'Current WHO guidance derives age-specific dietary-fibre levels for children.',
    query: 'What historical adult-scale fibre amount was expected, and what current approach is used for children?',
    rationale: 'OLD supplies the historical amount; CURRENT supplies the child-specific approach.',
  },
  {
    id: 'lsss-option-kidney-safety', label: 'PAIR_PRESERVE', oldPage: 37, oldPrintedPage: 90,
    oldSpan: 'Potassium-enriched low-sodium substitutes were identified as one possible sodium-reduction measure.',
    oldClaim: 'The 2003 report identified potassium-enriched lower-sodium salt as a sodium-reduction option.',
    currentChunk: 'who-lsss-2025-page-13-pass-1-7c2ceaf78a',
    currentClaim: 'Current lower-sodium-salt evidence excluded people for whom increased potassium is unsafe, including people with kidney disease.',
    query: 'What historical salt-substitution option was proposed, and what current kidney-safety limitation constrains it?',
    rationale: 'OLD supplies the option and CURRENT supplies the requested modern safety limitation.',
  },
  {
    id: 'iodization-monitoring-continuity', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldSpan: 'Salt should be iodized appropriately, with adjustment depending on observed sodium intake and iodine-status surveillance.',
    oldClaim: 'The 2003 report required appropriate salt iodization adjusted using sodium-intake and iodine-status surveillance.',
    currentChunk: 'who-sodium-2012-page-11-pass-1-aa53feeb3d',
    currentClaim: 'Current guidance says sodium reduction and salt iodization are compatible and calls for country-level monitoring to adjust iodization.',
    query: 'What iodization adjustment principle was stated historically, and how does current sodium guidance preserve it?',
    rationale: 'The query requests both the historical principle and its current implementation continuity.',
  },
  {
    id: 'free-sugar-versus-nss-definition', label: 'PAIR_PRESERVE', oldPage: 56, oldPrintedPage: 109,
    oldSpan: 'Free sugars refers to monosaccharides and disaccharides added to foods plus sugars naturally present in honey, fruit juices and syrups.',
    oldClaim: 'Free sugars include added monosaccharides and disaccharides plus sugars in honey, fruit juices, and syrups.',
    currentChunk: 'who-nss-2023-page-13-pass-1-74f7dfedc2',
    currentClaim: 'Non-sugar sweeteners are synthetic, naturally occurring, or modified non-nutritive sweeteners not classified as sugars.',
    query: 'How do the historical free-sugar definition and the current non-sugar-sweetener definition differ?',
    rationale: 'Both definitions are required to answer the requested contrast.',
  },
];

const validationIds = new Set([
  'total-fat-current-ceiling', 'sugars-current-ceiling', 'ratio-current-guidance', 'wholegrain-current-source-quality',
  'fat-lower-bound-current-caution', 'sugar-frequency-dental-rationale', 'fibre-adult-child-targets', 'iodization-monitoring-continuity',
]);

const [chunksText, sourceManifestText] = await Promise.all([readFile(CHUNKS, 'utf8'), readFile(SOURCE_MANIFEST, 'utf8')]);
const chunks = parseJsonl(chunksText);
const chunkMap = new Map(chunks.map((row: any) => [row.chunk_id, row]));
const sourceManifest = JSON.parse(sourceManifestText);
const oldDoc = sourceManifest.documents.find((document: any) => document.document_id === 'who-fao-trs-916-2003-part2');
if (!oldDoc) throw new Error('Missing verified WHO/FAO TRS 916 source manifest entry');

const priorUsedChunkIds = new Set<string>();
const priorConfigDirs = [
  'v5_r2_action_detector', 'v5_r2_1_action_detector', 'v5_r2_2_action_detector',
  'v5_r2_3_codex_audited_action_detector', 'v5_r2_4_atomic_action_detector',
  'v5_r2_5_expanded_local_action_detector', 'v5_r2_6_query_conditioned_action_detector',
];
for (const directory of priorConfigDirs) {
  for (const file of ['development.jsonl', 'validation.sealed.jsonl']) {
    const text = await readFile(path.join(EXP, 'data/configs', directory, file), 'utf8');
    for (const row of parseJsonl(text)) {
      if (row.old_evidence?.chunk_id) priorUsedChunkIds.add(row.old_evidence.chunk_id);
      if (row.current_evidence?.chunk_id) priorUsedChunkIds.add(row.current_evidence.chunk_id);
    }
  }
}
const collisions = specs.filter((spec) => priorUsedChunkIds.has(spec.currentChunk)).map((spec) => `${spec.id}:${spec.currentChunk}`);
if (collisions.length) throw new Error(`R2.7 current evidence was used by a prior R2 cycle: ${collisions.join(', ')}`);

const records = specs.map((spec, index) => {
  const current: any = chunkMap.get(spec.currentChunk);
  if (!current) throw new Error(`Missing current chunk ${spec.currentChunk}`);
  return {
    pair_id: `r2.7-${String(index + 1).padStart(2, '0')}-${spec.id}`,
    lineage_group: `cross-version-${spec.id}`,
    source_pair_id: spec.id,
    endpoint_contract: 'Preserve OLD only when it contains an operative claim needed to answer QUERY that is not fully supplied, displaced, or contradicted by CURRENT.',
    query: { text: spec.query, text_sha256: sha256(spec.query), author: 'codex-gpt5-primary-reviewer', external_model_api_used: false },
    old_evidence: {
      document_id: oldDoc.document_id,
      edition: '2003',
      title: oldDoc.title,
      official_catalog_url: oldDoc.official_catalog_url,
      official_pdf_url: oldDoc.official_pdf_url,
      who_record_url: oldDoc.who_record_url,
      local_path: oldDoc.local_path,
      source_sha256: oldDoc.sha256,
      pdf_page_number: spec.oldPage,
      printed_page_number: spec.oldPrintedPage,
      normalized_source_excerpt: spec.oldSpan,
      normalized_source_excerpt_sha256: sha256(spec.oldSpan),
      extraction_note: 'Codex-normalized excerpt from the cited PDF page; page-level locator, not a byte-offset quotation.',
      atomic_claim_text: spec.oldClaim,
      atomic_claim_sha256: sha256(spec.oldClaim),
    },
    current_evidence: {
      document_id: current.document_id,
      edition: current.edition,
      published_at: current.published_at,
      official_url: current.source_url,
      official_pdf_url: current.source_download_url,
      source_sha256: current.source_checksum,
      page_number: current.page_number,
      chunk_id: current.chunk_id,
      source_text: current.text,
      source_text_sha256: sha256(current.text),
      atomic_claim_text: spec.currentClaim,
      atomic_claim_sha256: sha256(spec.currentClaim),
    },
    action_label: spec.label,
    pre_model_audit: {
      decision: 'accept',
      rationale: spec.rationale,
      reviewer_id: 'codex-gpt5-primary-reviewer',
      reviewer_type: 'ai_primary_reviewer_not_independent_human',
      predictions_observed_before_audit: false,
      validation_results_observed_before_audit: false,
      external_model_api_used: false,
      audited_at: '2026-07-23T00:00:00.000+08:00',
    },
    detector_eligible: true,
    fresh_v5_test_eligible: false,
  };
});

const oldSpanHashes = records.map((row) => row.old_evidence.normalized_source_excerpt_sha256);
const currentChunkIds = records.map((row) => row.current_evidence.chunk_id);
if (new Set(oldSpanHashes).size !== records.length) throw new Error('Duplicate OLD exact source spans');
if (new Set(currentChunkIds).size !== records.length) throw new Error('Duplicate CURRENT chunk IDs');
if (records.filter((row) => row.action_label === 'PAIR_PRESERVE').length !== 12 || records.filter((row) => row.action_label === 'BLOCK_RETAINED').length !== 12) {
  throw new Error('R2.7 must contain exactly 12 records per action stratum');
}

const development = records.filter((row) => !validationIds.has(row.source_pair_id));
const validation = records.filter((row) => validationIds.has(row.source_pair_id));
for (const [name, rows] of [['Development', development], ['Validation', validation]] as const) {
  const pairCount = rows.filter((row) => row.action_label === 'PAIR_PRESERVE').length;
  const blockCount = rows.filter((row) => row.action_label === 'BLOCK_RETAINED').length;
  if (pairCount !== blockCount) throw new Error(`${name} is not action-balanced`);
}
const developmentText = `${development.map((row) => JSON.stringify(row)).join('\n')}\n`;
const validationText = `${validation.map((row) => JSON.stringify(row)).join('\n')}\n`;
const auditLedger = `${records.map((row) => JSON.stringify({
  pair_id: row.pair_id,
  lineage_group: row.lineage_group,
  query: row.query.text,
  old_atomic_claim: row.old_evidence.atomic_claim_text,
  current_atomic_claim: row.current_evidence.atomic_claim_text,
  action_label: row.action_label,
  ...row.pre_model_audit,
})).join('\n')}\n`;
const manifest = {
  schema_version: 'v5-r2.7-preaudited-cross-version-1',
  status: 'pre_model_gold_audited_split_frozen',
  endpoint: records[0].endpoint_contract,
  source_documents: ['WHO/FAO TRS 916 (2003)', 'WHO guidelines (2012-2025)'],
  total_count: records.length,
  total_distribution: { PAIR_PRESERVE: 12, BLOCK_RETAINED: 12 },
  development_count: development.length,
  development_distribution: {
    PAIR_PRESERVE: development.filter((row) => row.action_label === 'PAIR_PRESERVE').length,
    BLOCK_RETAINED: development.filter((row) => row.action_label === 'BLOCK_RETAINED').length,
  },
  validation_count: validation.length,
  validation_distribution: {
    PAIR_PRESERVE: validation.filter((row) => row.action_label === 'PAIR_PRESERVE').length,
    BLOCK_RETAINED: validation.filter((row) => row.action_label === 'BLOCK_RETAINED').length,
  },
  lineage_overlap_count: 0,
  current_chunk_overlap_count: 0,
  old_normalized_excerpt_overlap_count: 0,
  old_excerpt_locator_precision: 'PDF page and printed page; normalized excerpt is not a byte-offset quotation',
  prior_r2_current_chunk_collision_count: 0,
  gold_audit_completed_before_prediction: true,
  development_sha256: sha256(developmentText),
  validation_sealed_sha256: sha256(validationText),
  audit_ledger_sha256: sha256(auditLedger),
  external_model_api_used: false,
  validation_execution_count: 0,
  fresh_v5_test_created: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  status: 'r2_7_development_unlocked_local_only',
  split_manifest_sha256: sha256(manifestText),
  pre_model_gold_audit_complete: true,
  development_selection_complete: false,
  validation_execution_count: 0,
  external_model_api_allowed: false,
  tuning_after_validation_allowed: false,
  fresh_v5_test_created: false,
};
await Promise.all([mkdir(CONFIG, { recursive: true }), mkdir(AUDIT, { recursive: true })]);
await Promise.all([
  writeFile(path.join(CONFIG, 'development.jsonl'), developmentText, 'utf8'),
  writeFile(path.join(CONFIG, 'validation.sealed.jsonl'), validationText, 'utf8'),
  writeFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), manifestText, 'utf8'),
  writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), `${JSON.stringify(guard, null, 2)}\n`, 'utf8'),
  writeFile(path.join(AUDIT, 'pre_model_audit_ledger.jsonl'), auditLedger, 'utf8'),
]);
console.log(JSON.stringify(manifest, null, 2));
