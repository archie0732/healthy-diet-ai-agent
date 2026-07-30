import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const EXP = path.join(ROOT, 'experiments/version_aware_rag');
const corpus = (await readFile(path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl'), 'utf8'))
  .trim().split('\n').map((line) => JSON.parse(line));
const ledger = (await readFile(path.join(EXP, 'data/annotations_v4/devval_expansion_draft/review_ledger.jsonl'), 'utf8'))
  .trim().split('\n').map((line) => JSON.parse(line));
const byId = new Map(corpus.map((chunk) => [chunk.chunk_id, chunk]));

const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const out: string[] = ['# Codex Review Packet', '', 'This packet is generated from the draft ledger and source corpus.', ''];

for (const record of ledger) {
  out.push(`## ${record.draft_id} - ${record.stratum} - ${record.split}`, '');
  out.push(`Lineage: \`${record.lineage_group_id}\``, '');
  out.push(`Query: ${record.query_text}`, '');
  out.push('Current evidence:', '');
  for (const id of record.required_current_chunk_ids) {
    const chunk = byId.get(id);
    out.push(`- \`${id}\` (${chunk?.document_id}, PDF page ${chunk?.page_number}): ${compact(chunk?.text ?? '[missing]')}`);
  }
  out.push('', 'Retained evidence:', '');
  for (const id of record.required_retained_chunk_ids) {
    const chunk = byId.get(id);
    out.push(`- \`${id}\` (${chunk?.document_id}, PDF page ${chunk?.page_number}): ${compact(chunk?.text ?? '[missing]')}`);
  }
  out.push('', `Gemini rationale: ${record.draft_rationale}`, '', 'Decision: [ ] accept  [ ] revise  [ ] reject', '', 'Reviewer notes:', '', '---', '');
}

const output = path.join(EXP, 'results/v4/devval_expansion/CODEX_REVIEW_PACKET.md');
await writeFile(output, `${out.join('\n')}\n`, 'utf8');
console.log(output);
