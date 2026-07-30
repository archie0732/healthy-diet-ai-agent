import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CHUNKS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const SOURCE_MANIFEST = path.join(EXP, 'data/sources_v5/who_fao/MANIFEST.json');
const R2_8_RESULT = path.join(EXP, 'results/v5/r2_8_shared_pool_development/DEVELOPMENT_RESULT.json');
const R2_8_GUARD = path.join(EXP, 'data/configs/v5_r2_8_shared_pool_development/EXECUTION_GUARD.json');
const PROTOCOL = path.join(EXP, 'R2_9_RETRIEVAL_VALIDATION_PROTOCOL.md');
const OUT = path.join(EXP, 'data/configs/v5_r2_9_retrieval_validation');
const AUDIT = path.join(EXP, 'data/annotations_v5/r2_9_retrieval_validation');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
type Label = 'PAIR_PRESERVE' | 'BLOCK_RETAINED';
type Spec = {
  id: string; label: Label; oldPage: number; oldPrintedPage: number; oldExcerpt: string; oldClaim: string;
  currentChunk: string; currentClaim: string; query: string; rationale: string;
};
const specs: Spec[] = [
  {
    id: 'pufa-historical-goal-current-replacement', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'Polyunsaturated fatty acids: 6-10% of total energy.',
    oldClaim: 'The 2003 population goal placed polyunsaturated fatty acids at 6 to 10 percent of total energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-47-pass-0-08749858aa',
    currentClaim: 'Current evidence supports replacing saturated fatty acids with polyunsaturated fatty acids to improve cardiovascular outcomes and LDL cholesterol.',
    query: 'What historical PUFA energy range was set, and what current role does PUFA have when replacing saturated fat?',
    rationale: 'OLD supplies the historical range and CURRENT supplies modern replacement evidence.',
  },
  {
    id: 'n6-historical-goal-current-tfa-replacement', label: 'PAIR_PRESERVE', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'n-6 polyunsaturated fatty acids: 5-8% of total energy.',
    oldClaim: 'The 2003 n-6 polyunsaturated-fat goal was 5 to 8 percent of total energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-51-pass-0-a823ac8705',
    currentClaim: 'Current evidence evaluates polyunsaturated fatty acids as replacements for trans-fatty acids.',
    query: 'What historical n-6 PUFA range applied, and how does current guidance use PUFA when replacing trans fat?',
    rationale: 'OLD supplies the historical n-6 range and CURRENT supplies the trans-fat replacement role.',
  },
  {
    id: 'sodium-historical-beneficial-level-current-evidence', label: 'PAIR_PRESERVE', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Current evidence suggests that no more than 70 mmol or 1.7 g sodium per day is beneficial in reducing blood pressure.',
    oldClaim: 'The 2003 report identified no more than 1.7 grams sodium per day as beneficial for blood pressure.',
    currentChunk: 'who-sodium-2012-page-26-pass-1-02389cc7d7',
    currentClaim: 'Current sodium guidance rates blood-pressure evidence as high quality while mortality and cardiovascular outcome evidence is lower quality and subject to review.',
    query: 'What sodium level was described as beneficial historically, and how strong is the current evidence across outcomes?',
    rationale: 'OLD supplies the historical level and CURRENT supplies the evidence-quality distinction.',
  },
  {
    id: 'active-group-fat-history-current-child-range', label: 'PAIR_PRESERVE', oldPage: 17, oldPrintedPage: 70,
    oldExcerpt: 'Very active groups with diets high in vegetables, legumes, fruits and wholegrain cereals may sustain total fat intake up to 35% without unhealthy weight gain.',
    oldClaim: 'The historical report allowed very active groups with high-quality diets to sustain fat intake up to 35 percent.',
    currentChunk: 'who-total-fat-2023-page-31-pass-1-c3a3ada0aa',
    currentClaim: 'Current guidance considers total-fat intakes up to 35 percent appropriate for children and adolescents to meet growth demands.',
    query: 'Which group historically could sustain 35 percent fat, and which current younger population may also use an upper range of 35 percent?',
    rationale: 'OLD supplies the active-group context and CURRENT supplies the child/adolescent context.',
  },
  {
    id: 'sugar-country-target-current-five-percent', label: 'PAIR_PRESERVE', oldPage: 66, oldPrintedPage: 119,
    oldExcerpt: 'Countries with high free-sugar consumption should formulate reduction goals aiming toward no more than 10% of energy intake.',
    oldClaim: 'The historical report urged high-consumption countries to reduce free sugars toward no more than 10 percent of energy.',
    currentChunk: 'who-sugars-2015-page-25-pass-0-a3de6537ae',
    currentClaim: 'Current guidance suggests a further reduction below 5 percent of energy because dental-caries effects accumulate across life.',
    query: 'What historical country-level sugar target was advised, and what stricter current target is supported by cumulative dental-caries risk?',
    rationale: 'OLD supplies the historical country target and CURRENT supplies the stricter current target and rationale.',
  },
  {
    id: 'all-source-sodium-current-iodization', label: 'PAIR_PRESERVE', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'The sodium goal should take into account all dietary sources, including monosodium glutamate and preservatives.',
    oldClaim: 'The historical sodium goal counted all dietary sources, including monosodium glutamate and preservatives.',
    currentChunk: 'who-sodium-2012-page-27-pass-0-aee1a17991',
    currentClaim: 'Current sodium guidance requires monitoring and adjustment of salt iodization as salt intake falls.',
    query: 'Which sodium sources were counted historically, and what current iodization monitoring must accompany sodium reduction?',
    rationale: 'OLD supplies source coverage and CURRENT supplies the monitoring requirement.',
  },
  {
    id: 'potassium-current-child-adjustment', label: 'BLOCK_RETAINED', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Adequate dietary potassium lowers blood pressure and is protective against stroke and cardiac arrhythmias.',
    oldClaim: 'Adequate potassium helps lower blood pressure and protects against stroke and arrhythmias.',
    currentChunk: 'who-potassium-2012-page-25-pass-1-3f0bde22f5',
    currentClaim: 'Current child potassium guidance adjusts the adult target using energy requirements and recognizes the need for child trials.',
    query: 'How does current WHO guidance adjust potassium intake for children, and what evidence gap remains?',
    rationale: 'CURRENT fully answers the current child-adjustment question; OLD provides only general benefit context.',
  },
  {
    id: 'carbohydrate-current-primary-sources', label: 'BLOCK_RETAINED', oldPage: 5, oldPrintedPage: 58,
    oldExcerpt: 'Tubers such as potatoes and cassava should not be included in the fruits and vegetables category.',
    oldClaim: 'The historical report excluded potatoes and cassava from the fruit-and-vegetable category.',
    currentChunk: 'who-carbohydrate-2023-page-37-pass-2-2571c279ec',
    currentClaim: 'Current evidence supports whole grains, vegetables, fruits, and pulses as primary carbohydrate sources.',
    query: 'Which food groups does current WHO guidance identify as primary carbohydrate sources?',
    rationale: 'CURRENT fully supplies the requested current source groups.',
  },
  {
    id: 'nss-current-comparison-evidence', label: 'BLOCK_RETAINED', oldPage: 4, oldPrintedPage: 57,
    oldExcerpt: 'Drinks rich in free sugars increase overall energy intake by reducing appetite control.',
    oldClaim: 'Historically, free-sugar-rich drinks were linked to higher energy intake through reduced appetite control.',
    currentChunk: 'who-nss-2023-page-35-pass-0-b030d30ab9',
    currentClaim: 'Current trials comparing non-sugar sweeteners with free sugars do not directly establish replacement effects because many added test products to existing diets.',
    query: 'What limitation affects current trials comparing non-sugar sweeteners with free sugars?',
    rationale: 'CURRENT directly supplies the requested current trial limitation.',
  },
  {
    id: 'total-fat-current-replacement-caution', label: 'BLOCK_RETAINED', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'For women of reproductive age, at least 20% of energy from fat may be beneficial.',
    oldClaim: 'The historical report indicated a fat lower bound of at least 20 percent for women of reproductive age.',
    currentChunk: 'who-total-fat-2023-page-31-pass-0-63ac07055b',
    currentClaim: 'Current guidance warns that reducing fat may provide less benefit if replaced with poor-quality carbohydrates such as free sugars.',
    query: 'What current dietary-quality caution applies when reducing total fat?',
    rationale: 'CURRENT fully supplies the requested current caution; OLD is outside query scope.',
  },
  {
    id: 'lsss-current-kidney-applicability', label: 'BLOCK_RETAINED', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Adequate potassium intake may be achieved through daily consumption of fruits and vegetables.',
    oldClaim: 'Historically, fruits and vegetables were recommended to achieve adequate potassium intake.',
    currentChunk: 'who-lsss-2025-page-41-pass-2-078cc32e3e',
    currentClaim: 'Current lower-sodium-salt evidence excluded kidney disease and other circumstances in which increased potassium may be unsafe.',
    query: 'Which current kidney-related applicability limitation constrains lower-sodium potassium salt substitutes?',
    rationale: 'CURRENT directly supplies the current safety limitation.',
  },
  {
    id: 'tfa-current-sub-one-percent-evidence', label: 'BLOCK_RETAINED', oldPage: 36, oldPrintedPage: 89,
    oldExcerpt: 'Limiting total fat can make reduced saturated and trans-fat goals easier to meet.',
    oldClaim: 'The historical report linked total-fat control to meeting saturated- and trans-fat goals.',
    currentChunk: 'who-sat-trans-fat-2023-page-50-pass-2-6884293ed5',
    currentClaim: 'Current evidence below 1 percent trans fat is more limited, leading to a conditional recommendation.',
    query: 'Why is the current recommendation to reduce trans fat below one percent conditional?',
    rationale: 'CURRENT fully supplies the requested current evidence reason.',
  },
];

const [chunksText, sourceManifestText, r28Text, r28GuardText, protocolText] = await Promise.all([
  readFile(CHUNKS, 'utf8'), readFile(SOURCE_MANIFEST, 'utf8'), readFile(R2_8_RESULT, 'utf8'),
  readFile(R2_8_GUARD, 'utf8'), readFile(PROTOCOL, 'utf8'),
]);
const r28 = JSON.parse(r28Text), r28Guard = JSON.parse(r28GuardText);
if (!r28.gate_passed || r28Guard.status !== 'r2_8_development_passed_locked_new_validation_construction_allowed') {
  throw new Error('R2.8 did not authorize new retrieval Validation construction');
}
const chunks = parseJsonl(chunksText), chunkMap = new Map(chunks.map((row: any) => [row.chunk_id, row]));
const sourceManifest = JSON.parse(sourceManifestText);
const oldDoc = sourceManifest.documents.find((document: any) => document.document_id === 'who-fao-trs-916-2003-part2');
if (!oldDoc) throw new Error('Missing WHO/FAO 2003 source');
const priorCurrentChunkIds = new Set<string>();
for (const directory of ['v5_r2_3_codex_audited_action_detector', 'v5_r2_4_atomic_action_detector', 'v5_r2_5_expanded_local_action_detector', 'v5_r2_6_query_conditioned_action_detector', 'v5_r2_7_preaudited_cross_version']) {
  for (const file of ['development.jsonl', 'validation.sealed.jsonl']) {
    for (const row of parseJsonl(await readFile(path.join(EXP, 'data/configs', directory, file), 'utf8'))) {
      if (row.old_evidence?.chunk_id) priorCurrentChunkIds.add(row.old_evidence.chunk_id);
      if (row.current_evidence?.chunk_id) priorCurrentChunkIds.add(row.current_evidence.chunk_id);
    }
  }
}
const collisions = specs.filter((spec) => priorCurrentChunkIds.has(spec.currentChunk));
if (collisions.length) throw new Error(`Prior current chunk collision: ${collisions.map((spec) => spec.id).join(', ')}`);
if (new Set(specs.map((spec) => spec.currentChunk)).size !== specs.length) throw new Error('Duplicate current chunk');
if (new Set(specs.map((spec) => sha256(spec.oldExcerpt))).size !== specs.length) throw new Error('Duplicate OLD excerpt');
if (specs.filter((spec) => spec.label === 'PAIR_PRESERVE').length !== 6 || specs.filter((spec) => spec.label === 'BLOCK_RETAINED').length !== 6) throw new Error('Validation must be 6/6 balanced');

const records = specs.map((spec, index) => {
  const current: any = chunkMap.get(spec.currentChunk);
  if (!current) throw new Error(`Missing ${spec.currentChunk}`);
  const queryId = `r2.9-${String(index + 1).padStart(2, '0')}-${spec.id}`;
  return {
    query_id: queryId, query: spec.query, lineage_group: `r2.9-${spec.id}`,
    evidence_items: [
      {
        item_id: `${queryId}::OLD`, lineage_group: `r2.9-${spec.id}`, role: 'OLD', year: 2003, text: spec.oldClaim,
        source: { document_id: oldDoc.document_id, official_catalog_url: oldDoc.official_catalog_url, official_pdf_url: oldDoc.official_pdf_url, source_sha256: oldDoc.sha256, pdf_page_number: spec.oldPage, printed_page_number: spec.oldPrintedPage, normalized_excerpt: spec.oldExcerpt },
      },
      {
        item_id: `${queryId}::CURRENT`, lineage_group: `r2.9-${spec.id}`, role: 'CURRENT', year: Number(current.edition.match(/\d{4}/)?.[0] || 2025), text: spec.currentClaim,
        source: { document_id: current.document_id, official_url: current.source_url, official_pdf_url: current.source_download_url, source_sha256: current.source_checksum, page_number: current.page_number, chunk_id: current.chunk_id, source_text: current.text },
      },
    ],
    judgment: {
      query_id: queryId, stratum: spec.label,
      required_item_ids: spec.label === 'PAIR_PRESERVE' ? [`${queryId}::OLD`, `${queryId}::CURRENT`] : [`${queryId}::CURRENT`],
      deprecated_item_ids: spec.label === 'BLOCK_RETAINED' ? [`${queryId}::OLD`] : [],
    },
    audit: {
      decision: 'accept', action_label: spec.label, rationale: spec.rationale,
      reviewer_id: 'codex-gpt5-primary-reviewer', reviewer_type: 'ai_primary_reviewer_not_independent_human',
      retrieval_results_observed_before_audit: false, external_model_api_used: false, audited_at: '2026-07-23T00:00:00.000+08:00',
    },
  };
});
const inputText = `${records.map(({ judgment, audit, ...input }) => JSON.stringify(input)).join('\n')}\n`;
const judgmentText = `${records.map((record) => JSON.stringify(record.judgment)).join('\n')}\n`;
const auditText = `${records.map((record) => JSON.stringify({ query_id: record.query_id, query: record.query, ...record.audit })).join('\n')}\n`;
const manifest = {
  schema_version: 'v5-r2.9-retrieval-validation-1', status: 'new_validation_frozen_before_retrieval',
  r2_8_frozen_result_sha256: sha256(r28Text), r2_8_frozen_policy: { candidate_pool_size: 20, top_k: 3, recency_lambda: 0.75, history_pair_boost: 0.75 },
  protocol_sha256: sha256(protocolText), query_count: 12, corpus_item_count: 24,
  distribution: { PAIR_PRESERVE: 6, BLOCK_RETAINED: 6 },
  retrieval_inputs_sha256: sha256(inputText), judgments_sealed_sha256: sha256(judgmentText), pre_model_audit_sha256: sha256(auditText),
  prior_current_chunk_collision_count: 0, external_model_api_used: false, validation_execution_count: 0, fresh_v5_test_created: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  status: 'r2_9_one_shot_validation_unlocked', manifest_sha256: sha256(manifestText), validation_execution_count: 0,
  judgments_may_be_read_only_after_all_retrieval_calls: true, tuning_after_validation_allowed: false,
  external_model_api_allowed: false, fresh_v5_test_created: false,
};
await Promise.all([mkdir(OUT, { recursive: true }), mkdir(AUDIT, { recursive: true })]);
await Promise.all([
  writeFile(path.join(OUT, 'retrieval_inputs.jsonl'), inputText, 'utf8'),
  writeFile(path.join(OUT, 'judgments.sealed.jsonl'), judgmentText, 'utf8'),
  writeFile(path.join(OUT, 'MANIFEST.json'), manifestText, 'utf8'),
  writeFile(path.join(OUT, 'EXECUTION_GUARD.json'), `${JSON.stringify(guard, null, 2)}\n`, 'utf8'),
  writeFile(path.join(AUDIT, 'pre_retrieval_audit_ledger.jsonl'), auditText, 'utf8'),
]);
console.log(JSON.stringify(manifest, null, 2));
