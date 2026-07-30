import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'data/annotations_v5/relation_detector_review');
const RESULT = path.join(EXP, 'results/v5/relation_detector_review');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const windowAt = (text: string, start: number, end: number) => normalize(text.slice(Math.max(0, start - 240), Math.min(text.length, end + 240)));

const inventoryPath = path.join(EXP, 'data/annotations_v4/candidate_relation_pairs_v4.jsonl');
const priorTestPath = path.join(EXP, 'data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl');
const corpusPath = path.join(EXP, 'data/corpus_v3/chunks.jsonl');
const [inventoryText, priorTestText, corpusText] = await Promise.all([readFile(inventoryPath, 'utf8'), readFile(priorTestPath, 'utf8'), readFile(corpusPath, 'utf8')]);
const priorTestIds = new Set(parseJsonl(priorTestText).map((row: any) => row.candidate_pair_id));
const chunks = new Map(parseJsonl(corpusText).map((row: any) => [row.chunk_id, row]));
const candidates = parseJsonl(inventoryText)
  .filter((row: any) => row.origin === 'v4_new' && !priorTestIds.has(row.candidate_pair_id))
  .sort((a: any, b: any) => a.candidate_pair_id.localeCompare(b.candidate_pair_id));
if (candidates.length !== 40) throw new Error(`Expected 40 unused v4_new pairs, found ${candidates.length}`);

const ledger = candidates.map((pair: any) => {
  const oldChunk: any = chunks.get(pair.old_chunk_id), newChunk: any = chunks.get(pair.new_chunk_id);
  if (!oldChunk || !newChunk) throw new Error(`Missing corpus chunk for ${pair.candidate_pair_id}`);
  return {
    candidate_pair_id: pair.candidate_pair_id,
    lineage_group_id: pair.lineage_group_id,
    proposed_relation_type: pair.candidate_relation_type,
    proposed_policy_label: pair.candidate_policy_label,
    old_chunk_id: pair.old_chunk_id,
    new_chunk_id: pair.new_chunk_id,
    old_source_url: oldChunk.source_url,
    new_source_url: newChunk.source_url,
    old_local_document: `data/corpus_v3/chunks.jsonl#${pair.old_chunk_id}`,
    new_local_document: `data/corpus_v3/chunks.jsonl#${pair.new_chunk_id}`,
    old_excerpt: pair.old_excerpt,
    new_excerpt: pair.new_excerpt,
    old_context_window: windowAt(oldChunk.text, pair.old_start_offset, pair.old_end_offset),
    new_context_window: windowAt(newChunk.text, pair.new_start_offset, pair.new_end_offset),
    target_population: pair.target_population,
    conditions: pair.conditions,
    review_decision: 'pending',
    final_relation_type: null,
    final_policy_label: null,
    reviewer_notes: null,
    reviewer_id: null,
    reviewed_at: null,
    eligible_for_detector_development: false
  };
});

await Promise.all([mkdir(OUT, { recursive: true }), mkdir(RESULT, { recursive: true })]);
const ledgerText = ledger.map((row) => JSON.stringify(row)).join('\n') + '\n';
await writeFile(path.join(OUT, 'review_ledger.jsonl'), ledgerText, 'utf8');
const sections = ledger.map((row, index) => `## ${index + 1}. ${row.candidate_pair_id}\n\n- Proposed relation: \`${row.proposed_relation_type}\`\n- Lineage group: \`${row.lineage_group_id}\`\n- Old chunk: \`${row.old_chunk_id}\`\n- New chunk: \`${row.new_chunk_id}\`\n- Old source URL: ${row.old_source_url || '(recorded in local corpus only)'}\n- New source URL: ${row.new_source_url || '(recorded in local corpus only)'}\n- Local evidence: \`${row.old_local_document}\`, \`${row.new_local_document}\`\n\n**Old context**\n\n> ${row.old_context_window.replace(/\n/g, ' ')}\n\n**New context**\n\n> ${row.new_context_window.replace(/\n/g, ' ')}\n\nReview: accept / revise / reject. If revising, choose duplicate, superseded, conflicting, conditional_difference, or complementary and record a reason.\n`).join('\n');
const packet = `# V5 Relation Detector Gold-Label Review Packet\n\nThese 40 pairs come from official-source candidate pairs that were not used in the V4 fresh test. The V4 sealed test file was read only to exclude its candidate IDs; no V4 retrieval outcome, metric, answer, or gold relation was read or copied. Proposed labels are drafts and cannot enter detector selection until reviewed.\n\n${sections}`;
await writeFile(path.join(RESULT, 'RELATION_GOLD_REVIEW_PACKET.md'), packet, 'utf8');
const manifest = {
  status: 'awaiting_semantic_review',
  record_count: ledger.length,
  relation_distribution: Object.fromEntries(['superseded', 'conflicting', 'conditional_difference', 'complementary'].map((label) => [label, ledger.filter((row) => row.proposed_relation_type === label).length])),
  prior_v4_fresh_overlap_count: ledger.filter((row) => priorTestIds.has(row.candidate_pair_id)).length,
  prior_v4_fresh_fields_read: ['candidate_pair_id'],
  prior_v4_fresh_outcomes_or_metrics_read: false,
  source_inventory_sha256: sha256(inventoryText),
  source_corpus_sha256: sha256(corpusText),
  prior_test_membership_file_sha256: sha256(priorTestText),
  review_ledger_sha256: sha256(ledgerText),
  review_packet_sha256: sha256(packet),
  promotion_allowed: false
};
await writeFile(path.join(OUT, 'REVIEW_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
