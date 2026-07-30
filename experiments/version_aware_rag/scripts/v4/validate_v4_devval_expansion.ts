import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const EXP = path.join(ROOT, 'experiments/version_aware_rag');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const LEDGER = path.join(EXP, 'data/annotations_v4/devval_expansion_draft/review_ledger.jsonl');
const MANIFEST = path.join(EXP, 'data/annotations_v4/devval_expansion_draft/model_call_manifest.json');
const FRESH = path.join(EXP, 'data/annotations_v4/candidate_relation_pairs_v4.jsonl');
const OUT = path.join(EXP, 'results/v4/devval_expansion');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (text: string) => text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [corpusText, ledgerText, modelManifestText, freshText] = await Promise.all([
  readFile(CORPUS, 'utf8'), readFile(LEDGER, 'utf8'), readFile(MANIFEST, 'utf8'), readFile(FRESH, 'utf8'),
]);
const chunks = parseJsonl(corpusText);
const ledger = parseJsonl(ledgerText);
const modelManifest = JSON.parse(modelManifestText);
const fresh = parseJsonl(freshText).filter((record) => record.origin === 'v4_new');
const chunkIds = new Set(chunks.map((chunk) => chunk.chunk_id));
const freshChunkIds = new Set(fresh.flatMap((record) => [record.old_chunk_id, record.new_chunk_id]));

const failures: string[] = [];
const assert = (condition: unknown, message: string) => { if (!condition) failures.push(message); };
assert(ledger.length === 24, `expected 24 drafts, found ${ledger.length}`);
assert(new Set(ledger.map((record) => record.draft_id)).size === ledger.length, 'draft_id values are not unique');
assert(new Set(ledger.map((record) => record.lineage_group_id)).size === ledger.length, 'lineage_group_id values are not unique');
assert(ledger.filter((record) => record.split === 'development').length === 16, 'development must contain 16 drafts');
assert(ledger.filter((record) => record.split === 'validation').length === 8, 'validation must contain 8 drafts');
assert(ledger.filter((record) => record.stratum === 'conditional_merge').length === 12, 'conditional_merge must contain 12 groups');
assert(ledger.filter((record) => record.stratum === 'compatible_history').length === 12, 'compatible_history must contain 12 groups');
assert(modelManifest.call_count === 24, `expected 24 model calls, found ${modelManifest.call_count}`);
assert(modelManifest.ledger_sha256 === sha256(ledgerText), 'ledger checksum does not match model manifest');

for (const record of ledger) {
  assert(record.review_status === 'needs_user_review', `${record.draft_id}: model draft was incorrectly promoted`);
  assert(record.reviewer_decision === null, `${record.draft_id}: reviewer decision must remain null`);
  assert(record.fresh_test_leakage_check === 'passed_no_v4_fresh_inventory_used', `${record.draft_id}: leakage flag not passed`);
  assert(Array.isArray(record.required_current_chunk_ids) && record.required_current_chunk_ids.length > 0, `${record.draft_id}: missing current evidence`);
  assert(Array.isArray(record.required_retained_chunk_ids) && record.required_retained_chunk_ids.length > 0, `${record.draft_id}: missing retained evidence`);
  for (const id of [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids]) {
    assert(chunkIds.has(id), `${record.draft_id}: missing corpus chunk ${id}`);
    assert(!freshChunkIds.has(id), `${record.draft_id}: leaked fresh-test chunk ${id}`);
    assert(id.startsWith('who-'), `${record.draft_id}: non-WHO source used: ${id}`);
  }
  assert(!/chunk[_ -]?id/i.test(record.query_text), `${record.draft_id}: query exposes chunk identifier language`);
}

const sourceDocuments = new Set(chunks.map((chunk) => chunk.document_id));
const report = {
  status: failures.length === 0 ? 'draft_expansion_ready_for_human_review' : 'invalid',
  generated_at: new Date().toISOString(),
  counts: {
    source_documents: sourceDocuments.size,
    source_chunks: chunks.length,
    drafts: ledger.length,
    development: ledger.filter((record) => record.split === 'development').length,
    validation: ledger.filter((record) => record.split === 'validation').length,
    conditional_merge_groups: ledger.filter((record) => record.stratum === 'conditional_merge').length,
    compatible_history_groups: ledger.filter((record) => record.stratum === 'compatible_history').length,
    fresh_test_overlap_chunks: ledger.flatMap((record) => [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids]).filter((id) => freshChunkIds.has(id)).length,
  },
  checksums: { corpus_sha256: sha256(corpusText), ledger_sha256: sha256(ledgerText), model_manifest_sha256: sha256(modelManifestText) },
  promotion_blocked: true,
  promotion_block_reason: 'All 24 records are model-assisted drafts with review_status=needs_user_review. Validation and promotion gates must not run until adjudication is complete.',
  failures,
};

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'coverage_audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const markdown = `# V4 Development/Validation Expansion Audit\n\n` +
  `Status: **${report.status}**\n\n` +
  `- Official WHO documents: ${report.counts.source_documents}\n` +
  `- Source chunks: ${report.counts.source_chunks}\n` +
  `- Draft queries: ${report.counts.drafts} (${report.counts.development} development, ${report.counts.validation} sealed validation)\n` +
  `- Conditional merge lineage groups: ${report.counts.conditional_merge_groups}\n` +
  `- Compatible history lineage groups: ${report.counts.compatible_history_groups}\n` +
  `- Fresh-test chunk overlap: ${report.counts.fresh_test_overlap_chunks}\n\n` +
  `## Gate\n\nPromotion remains blocked. ${report.promotion_block_reason}\n`;
await writeFile(path.join(OUT, 'COVERAGE_AUDIT.md'), markdown, 'utf8');

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
