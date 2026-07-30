import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const VALIDATION = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl');
const RAW = path.join(EXP, 'results/v4/validation_confirmation/raw_retrieval_results.jsonl');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const OUT_DIR = path.join(EXP, 'data/annotations_v4/validation_safety_review');
const REPORT = path.join(EXP, 'results/v4/validation_confirmation/SAFETY_LABEL_REVIEW_PACKET.md');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const aliasOrder = (queryId: string, chunkId: string) => sha256(`${queryId}\0${chunkId}`);

const [validationText, rawText, corpusText] = await Promise.all([readFile(VALIDATION, 'utf8'), readFile(RAW, 'utf8'), readFile(CORPUS, 'utf8')]);
const validation = parseJsonl(validationText), raw = parseJsonl(rawText);
const chunks = new Map(parseJsonl(corpusText).map((chunk) => [chunk.chunk_id, chunk]));
const systems = ['recency', 'oracle_cross_0.5'];
const ledger: any[] = [], sections: string[] = [];
for (const record of validation) {
  const rows = raw.filter((row) => row.query_id === record.draft_id && systems.includes(row.system));
  if (rows.length !== 2) throw new Error(`${record.draft_id}: expected two system rows.`);
  const ids = [...new Set(rows.flatMap((row) => row.retrieved_chunk_ids))].sort((a, b) => aliasOrder(record.draft_id, a).localeCompare(aliasOrder(record.draft_id, b)));
  const current = new Set(record.required_current_chunk_ids), retained = new Set(record.required_retained_chunk_ids);
  const candidates = ids.map((chunkId, index) => {
    const chunk = chunks.get(chunkId); if (!chunk) throw new Error(`Missing ${chunkId}`);
    const requiredRole = current.has(chunkId) ? 'required_current' : retained.has(chunkId) ? 'required_retained' : 'not_required';
    return { query_id: record.draft_id, candidate_alias: `C${index + 1}`, chunk_id: chunkId, document_id: chunk.document_id, published_at: chunk.published_at, required_role: requiredRole, proposed_safety_label: requiredRole === 'not_required' ? 'needs_review' : 'citation_safe', reviewer_label: requiredRole === 'not_required' ? null : 'citation_safe', reviewer_notes: requiredRole === 'not_required' ? '' : 'Required evidence is citation-safe by the approved validation judgment.', retrieved_by: rows.filter((row) => row.retrieved_chunk_ids.includes(chunkId)).map((row) => row.system), text: chunk.text, review_status: 'validation_blinded_packet' };
  });
  ledger.push(...candidates);
  sections.push(`## ${record.draft_id} — ${record.stratum}\n\n**Question**\n\n${record.query_text}\n\n` + candidates.map((item) => `### ${item.candidate_alias}\n\n- Document/date: \`${item.document_id}\` / ${item.published_at}\n- Required role: \`${item.required_role}\`\n- Reviewer choice: [ ] citation_safe  [ ] stale  [ ] forbidden  [ ] neither\n\n> ${item.text.replace(/\s+/g, ' ').slice(0, 1400)}\n`).join('\n'));
}
const ledgerText = ledger.map((row) => JSON.stringify(row)).join('\n') + '\n';
const packet = `# V4 Validation Safety Review Packet\n\nSystem identities are hidden from the readable packet. This packet was generated only after the one-shot frozen effectiveness run; labels cannot be used for retuning.\n\n${sections.join('\n\n')}`;
const manifest = { status: 'needs_validation_safety_review', query_count: validation.length, candidate_count: ledger.length, non_required_candidate_count: ledger.filter((row) => row.required_role === 'not_required').length, source_raw_sha256: sha256(rawText), validation_split_sha256: sha256(validationText), ledger_sha256: sha256(ledgerText), compared_systems_hidden: systems };
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'safety_review_ledger.jsonl'), ledgerText, 'utf8');
await writeFile(path.join(OUT_DIR, 'safety_review_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(REPORT, packet, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
