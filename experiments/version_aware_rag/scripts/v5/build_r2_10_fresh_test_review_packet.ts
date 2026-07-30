import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CHUNKS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const SOURCE_MANIFEST = path.join(EXP, 'data/sources_v5/who_fao/MANIFEST.json');
const FROZEN_DIR = path.join(EXP, 'data/configs/v5_r2_10_frozen_policy');
const OUT = path.join(EXP, 'data/annotations_v5/r2_10_fresh_test_draft');
const RESULT = path.join(EXP, 'results/v5/r2_10_fresh_test_construction');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
type Stratum = 'explicit_history' | 'conditional_merge' | 'current_only' | 'hard_negative_current';
type Spec = {
  id: string; stratum: Stratum; oldPage: number; oldPrintedPage: number; oldExcerpt: string; oldClaim: string;
  currentChunk: string; currentClaim: string; query: string; rationale: string;
};
const specs: Spec[] = [
  {
    id: 'explicit-n3-tfa-replacement', stratum: 'explicit_history', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'n-3 polyunsaturated fatty acids: 1-2% of total energy.',
    oldClaim: 'The 2003 n-3 polyunsaturated-fat goal was 1 to 2 percent of total energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-51-pass-2-eb0f143a12',
    currentClaim: 'Current evidence does not support replacing trans fat with saturated fat and is inconclusive for refined carbohydrates or free sugars.',
    query: 'What historical n-3 PUFA range applied, and which current replacements for trans fat are not preferred or remain inconclusive?',
    rationale: 'The query explicitly requires a historical nutrient range and current replacement evidence.',
  },
  {
    id: 'explicit-sodium-hot-clinical-exceptions', stratum: 'explicit_history', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Non-acclimated people performing strenuous activity in hot environments may be adversely affected by sodium reduction.',
    oldClaim: 'The historical report flagged non-acclimated strenuous activity in heat as a sodium-reduction exception.',
    currentChunk: 'who-sodium-2012-page-26-pass-0-79e05e2ed5',
    currentClaim: 'Current sodium recommendations exclude illnesses and therapies that risk hyponatraemia, water build-up, or require physician-supervised diets.',
    query: 'Which heat-related exception was recognized historically, and which clinical exclusions are recognized currently?',
    rationale: 'Both generations of exception evidence are explicitly requested.',
  },
  {
    id: 'explicit-sugar-goal-conditional-policy', stratum: 'explicit_history', oldPage: 4, oldPrintedPage: 57,
    oldExcerpt: 'The 2003 Consultation retained a population goal for free sugars below 10% of total energy.',
    oldClaim: 'The historical population goal kept free sugars below 10 percent of total energy.',
    currentChunk: 'who-sugars-2015-page-24-pass-2-755599d38d',
    currentClaim: 'Current guidance explains that conditional recommendations require policy debate because benefit-harm certainty is lower.',
    query: 'What historical free-sugar goal was retained, and what does a current conditional recommendation require from policy-makers?',
    rationale: 'OLD supplies the historical target; CURRENT supplies the policy meaning.',
  },
  {
    id: 'explicit-fat-range-current-threshold', stratum: 'explicit_history', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'The historical population range for total fat was 15-30% of total energy, with context-specific lower bounds.',
    oldClaim: 'The historical population total-fat range was 15 to 30 percent of energy.',
    currentChunk: 'who-total-fat-2023-page-30-pass-1-345d23b2d0',
    currentClaim: 'Current guidance selected 30 percent because trials commonly began above that level and achieved levels near or below it.',
    query: 'What historical total-fat range applied, and why was the current 30-percent threshold selected?',
    rationale: 'The query requires the historical range and current threshold rationale.',
  },
  {
    id: 'conditional-sfa-goal-safety', stratum: 'conditional_merge', oldPage: 36, oldPrintedPage: 89,
    oldExcerpt: 'Limiting saturated fatty acids helps reduce cardiovascular risk while total fat quantity remains context dependent.',
    oldClaim: 'Saturated fatty acid intake should be limited as part of cardiovascular risk reduction.',
    currentChunk: 'who-sat-trans-fat-2023-page-47-pass-2-0c1430db13',
    currentClaim: 'Current evidence found no undesirable effects or mitigating factors that argue against lower saturated-fat intake.',
    query: 'What cardiovascular purpose supports limiting saturated fat, and did current evidence identify mitigating harms?',
    rationale: 'The two compatible claims answer distinct parts of a non-temporally worded question.',
  },
  {
    id: 'conditional-tfa-limit-current-lipid-effect', stratum: 'conditional_merge', oldPage: 36, oldPrintedPage: 89,
    oldExcerpt: 'Trans-fat reduction was included among dietary goals intended to lower coronary heart disease risk.',
    oldClaim: 'Reducing trans fat was a dietary goal for lowering coronary heart disease risk.',
    currentChunk: 'who-sat-trans-fat-2023-page-50-pass-1-67c3e9a0e7',
    currentClaim: 'Current trials find that replacing trans fat with unsaturated fats or carbohydrates reduces LDL cholesterol and improves blood lipids.',
    query: 'What disease-prevention purpose supports trans-fat reduction, and what lipid effect follows replacement with other nutrients?',
    rationale: 'Both retained purpose and current replacement evidence are required.',
  },
  {
    id: 'conditional-sugar-energy-dental', stratum: 'conditional_merge', oldPage: 4, oldPrintedPage: 57,
    oldExcerpt: 'Free sugars contribute to dietary energy density and can promote positive energy balance.',
    oldClaim: 'Free sugars increase dietary energy density and can promote positive energy balance.',
    currentChunk: 'who-sugars-2015-page-24-pass-1-56c8156596',
    currentClaim: 'Current evidence links free-sugar changes with body weight and bases the below-10-percent recommendation partly on dental-caries evidence.',
    query: 'How can free sugars affect energy balance, and which current body-weight and dental evidence supports limiting them?',
    rationale: 'The query requires complementary mechanism and current evidence claims.',
  },
  {
    id: 'conditional-fat-minimum-current-effect', stratum: 'conditional_merge', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'Most adults require a total-fat lower bound near 15% of energy to support essential physiological functions.',
    oldClaim: 'A total-fat lower bound near 15 percent of energy supports essential physiological functions.',
    currentChunk: 'who-total-fat-2023-page-30-pass-2-eb5a7497dc',
    currentClaim: 'Current trials interpret lower-fat arms as reducing weight gain or producing greater weight reduction than controls.',
    query: 'Why is a minimum fat intake physiologically relevant, and how are current lower-fat trial effects interpreted?',
    rationale: 'The question requires the retained lower-bound rationale and current trial interpretation.',
  },
  {
    id: 'current-potassium-recommendation-strength', stratum: 'current_only', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Potassium intake around 70-80 mmol per day was linked to a sodium-potassium ratio near one.',
    oldClaim: 'The historical potassium benchmark was around 70 to 80 millimoles per day.',
    currentChunk: 'who-potassium-2012-page-24-pass-1-d2b064757f',
    currentClaim: 'Current guidance explains the implications of strong and conditional potassium recommendations for patients, clinicians, and policy-makers.',
    query: 'What are the current practical implications of strong versus conditional potassium recommendations?',
    rationale: 'CURRENT fully answers the current-only policy question; OLD is deprecated for this query.',
  },
  {
    id: 'current-carbohydrate-adult-evidence', stratum: 'current_only', oldPage: 5, oldPrintedPage: 58,
    oldExcerpt: 'Wholegrain cereals, fruits and vegetables were historically preferred as fibre-rich carbohydrate foods.',
    oldClaim: 'Historically, whole grains, fruits, and vegetables were preferred fibre-rich carbohydrate foods.',
    currentChunk: 'who-carbohydrate-2023-page-37-pass-0-c5eda1ef80',
    currentClaim: 'Current adult evidence links higher whole-grain intake with lower mortality, cardiovascular disease, diabetes, and colorectal-cancer risk.',
    query: 'Which adult health outcomes are associated with higher whole-grain intake in current evidence?',
    rationale: 'CURRENT directly answers the present evidence question.',
  },
  {
    id: 'current-nss-long-term-effects', stratum: 'current_only', oldPage: 56, oldPrintedPage: 109,
    oldExcerpt: 'Free sugars were defined separately from non-nutritive sweetening agents.',
    oldClaim: 'Historical free-sugar guidance did not treat non-nutritive sweeteners as sugars.',
    currentChunk: 'who-nss-2023-page-34-pass-1-062872d547',
    currentClaim: 'Current evidence reports no long-term body-fat benefit from non-sugar sweeteners and possible increased risks of diabetes, cardiovascular disease, mortality, and preterm birth.',
    query: 'What long-term benefits and risks does current evidence report for non-sugar sweeteners?',
    rationale: 'CURRENT fully answers the current evidence question.',
  },
  {
    id: 'current-lsss-policy-context', stratum: 'current_only', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Potassium-enriched lower-sodium salt was historically described as one sodium-reduction option.',
    oldClaim: 'Historically, potassium-enriched lower-sodium salt was one possible sodium-reduction measure.',
    currentChunk: 'who-lsss-2025-page-40-pass-2-cc04d44aac',
    currentClaim: 'Current guidance says conditional lower-sodium-salt policy requires setting-specific discussion and should accompany broader salt-reduction interventions.',
    query: 'What current policy process is required before adopting lower-sodium salt substitutes?',
    rationale: 'CURRENT fully answers the current policy-process question.',
  },
  {
    id: 'hard-sfa-below-ten-evidence', stratum: 'hard_negative_current', oldPage: 3, oldPrintedPage: 56,
    oldExcerpt: 'The earlier population goal placed saturated fat below ten percent of energy.',
    oldClaim: 'An earlier population goal kept saturated fat below 10 percent of energy.',
    currentChunk: 'who-sat-trans-fat-2023-page-47-pass-1-1c716a307f',
    currentClaim: 'Current evidence finds greater LDL reduction below 10 percent saturated fat and no important undesirable effects.',
    query: 'What does current evidence say about LDL reduction and undesirable effects below ten percent saturated fat?',
    rationale: 'CURRENT is the only required evidence despite strong lexical similarity to OLD.',
  },
  {
    id: 'hard-carbohydrate-child-evidence', stratum: 'hard_negative_current', oldPage: 5, oldPrintedPage: 58,
    oldExcerpt: 'The historical report inferred benefits of whole grains, vegetables, and fruits mainly at population level.',
    oldClaim: 'Historical population guidance favoured whole grains, vegetables, and fruits.',
    currentChunk: 'who-carbohydrate-2023-page-37-pass-1-92354bb179',
    currentClaim: 'Current child and adolescent evidence is consistent with adult benefits but is limited and not suitable for meta-analysis.',
    query: 'How complete and consistent is the current child evidence for whole grains, vegetables, fruits, and pulses?',
    rationale: 'CURRENT supplies the requested evidence-quality assessment; OLD is a lexical hard negative.',
  },
  {
    id: 'hard-nss-delivery-forms', stratum: 'hard_negative_current', oldPage: 56, oldPrintedPage: 109,
    oldExcerpt: 'Sweeteners and sugars can appear in beverages and solid foods through different formulations.',
    oldClaim: 'Historical discussion distinguished sugars across beverages and solid foods.',
    currentChunk: 'who-nss-2023-page-34-pass-2-0292be3f67',
    currentClaim: 'Current non-sugar-sweetener trials delivered sweeteners through premixed beverages, participant-added products, solid foods, and capsules.',
    query: 'Through which delivery forms were non-sugar sweeteners administered in current trials?',
    rationale: 'CURRENT alone answers the delivery-form question; OLD is a lexical hard negative.',
  },
  {
    id: 'hard-lsss-evidence-basis', stratum: 'hard_negative_current', oldPage: 37, oldPrintedPage: 90,
    oldExcerpt: 'Earlier lower-sodium-salt discussion was based on sodium reduction and potassium plausibility.',
    oldClaim: 'Earlier guidance treated lower-sodium salt as a plausible sodium-reduction tool.',
    currentChunk: 'who-lsss-2025-page-41-pass-0-74fd4aa2a9',
    currentClaim: 'Current lower-sodium-salt guidance bases its rationale on moderate-to-low-certainty evidence assessed under GRADE.',
    query: 'What is the current evidence-certainty basis for the lower-sodium-salt recommendation?',
    rationale: 'CURRENT alone supplies the evidence-certainty answer; OLD is a close topical distractor.',
  },
];

const [chunksText, sourceManifestText, frozenText, guardText] = await Promise.all([
  readFile(CHUNKS, 'utf8'), readFile(SOURCE_MANIFEST, 'utf8'),
  readFile(path.join(FROZEN_DIR, 'FROZEN_POLICY_PACKAGE.json'), 'utf8'),
  readFile(path.join(FROZEN_DIR, 'FRESH_TEST_GUARD.json'), 'utf8'),
]);
const frozen = JSON.parse(frozenText), guard = JSON.parse(guardText);
if (frozen.status !== 'policy_frozen_before_fresh_test_construction' || guard.status !== 'fresh_test_construction_allowed_execution_locked' || guard.fresh_test_execution_count !== 0) {
  throw new Error('R2.10 fresh-test construction guard failed');
}
const chunks = parseJsonl(chunksText), chunkMap = new Map(chunks.map((row: any) => [row.chunk_id, row]));
const sourceManifest = JSON.parse(sourceManifestText);
const oldDoc = sourceManifest.documents.find((document: any) => document.document_id === 'who-fao-trs-916-2003-part2');
if (!oldDoc) throw new Error('Missing WHO/FAO 2003 source');
const priorChunkIds = new Set<string>();
const configRoot = path.join(EXP, 'data/configs');
for (const entry of await readdir(configRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('v5_r2_') || entry.name.startsWith('v5_r2_10')) continue;
  for (const file of await readdir(path.join(configRoot, entry.name))) {
    if (!file.endsWith('.jsonl')) continue;
    for (const row of parseJsonl(await readFile(path.join(configRoot, entry.name, file), 'utf8'))) {
      if (row.old_evidence?.chunk_id) priorChunkIds.add(row.old_evidence.chunk_id);
      if (row.current_evidence?.chunk_id) priorChunkIds.add(row.current_evidence.chunk_id);
      for (const item of row.evidence_items || []) if (item.source?.chunk_id) priorChunkIds.add(item.source.chunk_id);
    }
  }
}
const collisions = specs.filter((spec) => priorChunkIds.has(spec.currentChunk));
if (collisions.length) throw new Error(`Fresh current chunk collision: ${collisions.map((spec) => `${spec.id}:${spec.currentChunk}`).join(', ')}`);
if (new Set(specs.map((spec) => spec.currentChunk)).size !== specs.length) throw new Error('Duplicate fresh current chunk');
for (const stratum of ['explicit_history', 'conditional_merge', 'current_only', 'hard_negative_current']) {
  if (specs.filter((spec) => spec.stratum === stratum).length !== 4) throw new Error(`Expected four ${stratum} records`);
}
const records = specs.map((spec, index) => {
  const current: any = chunkMap.get(spec.currentChunk);
  if (!current) throw new Error(`Missing ${spec.currentChunk}`);
  const queryId = `r2.10-${String(index + 1).padStart(2, '0')}-${spec.id}`;
  const requiresOld = spec.stratum === 'explicit_history' || spec.stratum === 'conditional_merge';
  return {
    query_id: queryId, stratum: spec.stratum, query: spec.query, lineage_group: `r2.10-${spec.id}`,
    old_evidence: {
      item_id: `${queryId}::OLD`, role: 'OLD', year: 2003, atomic_claim_text: spec.oldClaim,
      official_catalog_url: oldDoc.official_catalog_url, official_pdf_url: oldDoc.official_pdf_url,
      local_path: oldDoc.local_path, source_sha256: oldDoc.sha256, pdf_page_number: spec.oldPage,
      printed_page_number: spec.oldPrintedPage, normalized_source_excerpt: spec.oldExcerpt,
    },
    current_evidence: {
      item_id: `${queryId}::CURRENT`, role: 'CURRENT', year: Number(current.edition.match(/\d{4}/)?.[0] || 2025),
      atomic_claim_text: spec.currentClaim, official_url: current.source_url, official_pdf_url: current.source_download_url,
      source_sha256: current.source_checksum, page_number: current.page_number, chunk_id: current.chunk_id, source_text: current.text,
    },
    judgment: {
      required_item_ids: requiresOld ? [`${queryId}::OLD`, `${queryId}::CURRENT`] : [`${queryId}::CURRENT`],
      deprecated_item_ids: requiresOld ? [] : [`${queryId}::OLD`],
    },
    review: {
      decision: 'needs_project_owner_review', rationale: spec.rationale,
      drafted_by: 'codex-gpt5-primary-reviewer', independent_blinded_review: false,
      retrieval_results_observed: false, external_model_api_used: false,
    },
  };
});
const ledgerText = `${records.map((row) => JSON.stringify(row)).join('\n')}\n`;
const packetLines = [
  '# R2.10 Fresh Held-Out Test Review Packet',
  '',
  'Status: **REVIEW REQUIRED - TEST EXECUTION LOCKED**',
  '',
  `Frozen policy SHA-256: \`${sha256(frozenText)}\``,
  '',
  'Please review each query, OLD/CURRENT evidence, and required/deprecated decision. To request a change, reply in chat with the query ID and replacement. Do not infer any retrieval result: none exists.',
  '',
  'Approval options:',
  '',
  '- `同意全部，checksum <packet checksum>`',
  '- `<query-id> 的 query 改成 ...`',
  '- `<query-id> 的 OLD/CURRENT 判定應改為 ...`',
  '- `刪除 <query-id>`',
  '',
];
for (const row of records) {
  packetLines.push(
    `## ${row.query_id}`,
    '',
    `- Stratum: \`${row.stratum}\``,
    `- Query: ${row.query}`,
    `- Required: ${row.judgment.required_item_ids.map((id: string) => `\`${id}\``).join(', ')}`,
    `- Deprecated: ${row.judgment.deprecated_item_ids.length ? row.judgment.deprecated_item_ids.map((id: string) => `\`${id}\``).join(', ') : 'none'}`,
    `- Rationale: ${row.review.rationale}`,
    '',
    `OLD (${row.old_evidence.year}, PDF page ${row.old_evidence.pdf_page_number}, printed page ${row.old_evidence.printed_page_number}):`,
    '',
    `> ${row.old_evidence.atomic_claim_text}`,
    '',
    `Source: ${row.old_evidence.official_pdf_url}`,
    '',
    `CURRENT (${row.current_evidence.year}, PDF page ${row.current_evidence.page_number}, chunk \`${row.current_evidence.chunk_id}\`):`,
    '',
    `> ${row.current_evidence.atomic_claim_text}`,
    '',
    `Source: ${row.current_evidence.official_url}`,
    '',
  );
}
const packetWithoutChecksum = `${packetLines.join('\n')}\n`;
const packetChecksum = sha256(packetWithoutChecksum);
const packetText = packetWithoutChecksum.replace(
  'Frozen policy SHA-256:',
  `Review packet content SHA-256: \`${packetChecksum}\`\n\nFrozen policy SHA-256:`,
);
const manifest = {
  schema_version: 'v5-r2.10-fresh-test-draft-1',
  status: 'draft_constructed_review_required_execution_locked',
  frozen_policy_sha256: sha256(frozenText),
  record_count: records.length,
  strata_counts: Object.fromEntries(['explicit_history', 'conditional_merge', 'current_only', 'hard_negative_current'].map((stratum) => [stratum, records.filter((row) => row.stratum === stratum).length])),
  unique_lineage_count: new Set(records.map((row) => row.lineage_group)).size,
  unique_current_chunk_count: new Set(records.map((row) => row.current_evidence.chunk_id)).size,
  prior_current_chunk_collision_count: 0,
  draft_ledger_sha256: sha256(ledgerText),
  review_packet_content_sha256: packetChecksum,
  review_packet_file_sha256: sha256(packetText),
  project_owner_signoff_recorded: false,
  retrieval_result_exists: false,
  fresh_test_execution_count: 0,
  external_model_api_used: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await Promise.all([mkdir(OUT, { recursive: true }), mkdir(RESULT, { recursive: true })]);
await Promise.all([
  writeFile(path.join(OUT, 'fresh_test_draft.jsonl'), ledgerText, 'utf8'),
  writeFile(path.join(OUT, 'DRAFT_MANIFEST.json'), manifestText, 'utf8'),
  writeFile(path.join(RESULT, 'R2_10_FRESH_TEST_REVIEW_PACKET.md'), packetText, 'utf8'),
  writeFile(path.join(FROZEN_DIR, 'FRESH_TEST_GUARD.json'), `${JSON.stringify({
    ...guard,
    status: 'fresh_test_draft_constructed_review_required_execution_locked',
    fresh_test_constructed: true,
    draft_manifest_sha256: sha256(manifestText),
    review_packet_file_sha256: sha256(packetText),
    owner_signoff_recorded: false,
    fresh_test_execution_count: 0,
  }, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify(manifest, null, 2));
