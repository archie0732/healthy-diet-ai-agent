import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const DEV = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/development.jsonl');
const RAW = path.join(EXP, 'results/v4/dev_model_selection/raw_retrieval_results.gemma-4-31b-it.jsonl');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const OUT_DIR = path.join(EXP, 'data/annotations_v4/dev_safety_review');
const REPORT_DIR = path.join(EXP, 'results/v4/dev_model_selection');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const aliasOrder = (queryId: string, chunkId: string) => sha256(`${queryId}\0${chunkId}`);

const [devText, rawText, corpusText] = await Promise.all([
  readFile(DEV, 'utf8'), readFile(RAW, 'utf8'), readFile(CORPUS, 'utf8'),
]);
const dev = parseJsonl(devText);
const raw = parseJsonl(rawText);
const chunks = new Map(parseJsonl(corpusText).map((chunk) => [chunk.chunk_id, chunk]));
const systems = ['recency', 'oracle_cross_0.5'];
const selectedRows = raw.filter((row) => systems.includes(row.system));
if (dev.length !== 16 || selectedRows.length !== 32) throw new Error(`Expected 16 development records and 32 comparison rows; found ${dev.length}/${selectedRows.length}`);

const ledger: any[] = [];
const sections: string[] = [];
for (const record of dev) {
  const rows = selectedRows.filter((row) => row.query_id === record.draft_id);
  const candidateIds = [...new Set(rows.flatMap((row) => row.retrieved_chunk_ids))]
    .sort((left, right) => aliasOrder(record.draft_id, left).localeCompare(aliasOrder(record.draft_id, right)));
  const requiredCurrent = new Set(record.required_current_chunk_ids);
  const requiredRetained = new Set(record.required_retained_chunk_ids);
  const candidates = candidateIds.map((chunkId, index) => {
    const chunk = chunks.get(chunkId);
    if (!chunk) throw new Error(`Missing corpus chunk ${chunkId}`);
    const requiredRole = requiredCurrent.has(chunkId) ? 'required_current' : requiredRetained.has(chunkId) ? 'required_retained' : 'not_required';
    const alias = `C${index + 1}`;
    return {
      query_id: record.draft_id,
      candidate_alias: alias,
      chunk_id: chunkId,
      document_id: chunk.document_id,
      published_at: chunk.published_at,
      required_role: requiredRole,
      proposed_safety_label: requiredRole === 'not_required' ? 'needs_review' : 'citation_safe_required',
      reviewer_label: null,
      reviewer_notes: '',
      retrieved_by: rows.filter((row) => row.retrieved_chunk_ids.includes(chunkId)).map((row) => row.system),
      text: chunk.text,
    };
  });
  ledger.push(...candidates);
  sections.push(`## ${record.draft_id} — ${record.stratum}\n\n` +
    `**Question**\n\n${record.query_text}\n\n` +
    `**Required current evidence:** ${record.required_current_chunk_ids.join(', ')}\n\n` +
    `**Required retained evidence:** ${record.required_retained_chunk_ids.join(', ')}\n\n` +
    candidates.map((candidate) => `### ${candidate.candidate_alias}\n\n` +
      `- Document/date: \`${candidate.document_id}\` / ${candidate.published_at}\n` +
      `- Required role: \`${candidate.required_role}\`\n` +
      `- Proposed label: \`${candidate.proposed_safety_label}\`\n` +
      `- Reviewer choice: [ ] citation_safe  [ ] stale  [ ] forbidden  [ ] neither\n\n` +
      `> ${candidate.text.replace(/\s+/g, ' ').slice(0, 1400)}\n`).join('\n'));
}

const machineText = `${ledger.map((item) => JSON.stringify(item)).join('\n')}\n`;
const packet = `# V4 Development Safety-Label Review Packet\n\n` +
  `Scope: 16 development queries only. Validation and fresh-test records are absent.\n\n` +
  `Candidate order is deterministically randomized and system names are hidden in this packet. ` +
  `Classify each non-required candidate as \`citation_safe\`, \`stale\`, \`forbidden\`, or \`neither\`. ` +
  `A non-required passage is not automatically stale or forbidden.\n\n` + sections.join('\n\n');
const manifest = {
  status: 'needs_safety_label_review',
  development_split_sha256: sha256(devText),
  source_raw_results_sha256: sha256(rawText),
  compared_systems_hidden_from_review_packet: systems,
  query_count: dev.length,
  candidate_count: ledger.length,
  non_required_candidate_count: ledger.filter((item) => item.required_role === 'not_required').length,
  validation_record_count: 0,
  fresh_test_record_count: 0,
  machine_ledger_sha256: sha256(machineText),
};
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'safety_review_ledger.jsonl'), machineText, 'utf8');
await writeFile(path.join(OUT_DIR, 'safety_review_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(REPORT_DIR, 'SAFETY_LABEL_REVIEW_PACKET.md'), packet, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
