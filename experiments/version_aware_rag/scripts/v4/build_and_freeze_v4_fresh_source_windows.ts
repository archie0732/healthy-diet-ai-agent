import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const INVENTORY = path.join(EXP, 'data/annotations_v4/candidate_relation_pairs_v4.jsonl');
const CORPUS = path.join(EXP, 'data/corpus_v3/chunks.jsonl');
const OUT = path.join(EXP, 'data/corpus_v4_fresh_frozen');
const FREEZE = path.join(EXP, 'data/configs/v4_fresh_test_frozen');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

const [inventoryText, corpusText, packageText, guardText] = await Promise.all([
  readFile(INVENTORY, 'utf8'), readFile(CORPUS, 'utf8'),
  readFile(path.join(FREEZE, 'FROZEN_FRESH_TEST_PACKAGE.json'), 'utf8'),
  readFile(path.join(FREEZE, 'FRESH_TEST_GUARD.json'), 'utf8'),
]);
const frozen = JSON.parse(packageText), guard = JSON.parse(guardText);
if (sha256(packageText) !== guard.frozen_package_sha256 || guard.test_inventory_read_count !== 0 || guard.final_test_created) throw new Error('Fresh-test guard failed before source-window derivation.');
if (sha256(inventoryText) !== frozen.input_checksums.candidate_inventory.sha256 || sha256(corpusText) !== frozen.input_checksums.corpus_v3.sha256) throw new Error('Frozen source input changed.');
const parents = new Map(parseJsonl(corpusText).map((row) => [row.chunk_id, row]));
const pairs = parseJsonl(inventoryText).filter((row) => row.origin === 'v4_new').sort((a, b) => a.candidate_pair_id.localeCompare(b.candidate_pair_id));
const derived: any[] = [], provenance: any[] = [], failures: string[] = [];
for (const pair of pairs) for (const role of ['old', 'new'] as const) {
  const parentId = pair[`${role}_chunk_id`], parent = parents.get(parentId);
  if (!parent) throw new Error(`${pair.candidate_pair_id}/${role}: missing parent ${parentId}.`);
  const evidenceStart = Number(pair[`${role}_start_offset`]), evidenceEnd = Number(pair[`${role}_end_offset`]);
  const start = Math.max(0, evidenceStart - 650), end = Math.min(parent.text.length, evidenceEnd + 950);
  const text = parent.text.slice(start, end).trim();
  const excerpt = String(pair[`${role}_excerpt`]);
  if (!normalize(text).includes(normalize(excerpt))) failures.push(`${pair.candidate_pair_id}/${role}: derived window does not contain excerpt`);
  const chunkId = `v4fresh-${pair.candidate_pair_id}-${role}`;
  derived.push({ ...parent, chunk_id: chunkId, passage_index: role === 'old' ? 0 : 1, char_start: parent.char_start + start, char_end: parent.char_start + end, text, topic_ids: pair.topic_ids, population_tags: pair.target_population, condition_tags: pair.conditions, lineage_id: pair.lineage_group_id });
  provenance.push({ chunk_id: chunkId, candidate_pair_id: pair.candidate_pair_id, role, parent_chunk_id: parentId, parent_source_checksum: parent.source_checksum, evidence_start_offset: evidenceStart, evidence_end_offset: evidenceEnd, window_start_offset: start, window_end_offset: end, source_excerpt: excerpt, derived_text_sha256: sha256(text) });
}
const uniqueIds = new Set(derived.map((row) => row.chunk_id));
const uniqueTexts = new Set(derived.map((row) => sha256(normalize(row.text))));
if (failures.length || derived.length !== 160 || uniqueIds.size !== 160) throw new Error(JSON.stringify({ failures, derived: derived.length, uniqueIds: uniqueIds.size }));
const chunksText = derived.map((row) => JSON.stringify(row)).join('\n') + '\n';
const provenanceText = provenance.map((row) => JSON.stringify(row)).join('\n') + '\n';
const manifest = { status: 'frozen_fresh_test_source_windows', source_inventory_sha256: sha256(inventoryText), parent_corpus_sha256: sha256(corpusText), record_count: derived.length, unique_chunk_ids: uniqueIds.size, unique_normalized_texts: uniqueTexts.size, excerpt_containment_failures: failures.length, chunks_sha256: sha256(chunksText), provenance_sha256: sha256(provenanceText), derivation_rule: 'For each exact evidence offset: 650 characters before through 950 characters after, clipped to the frozen parent chunk.' };
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'chunks.jsonl'), chunksText, 'utf8');
await writeFile(path.join(OUT, 'provenance.jsonl'), provenanceText, 'utf8');
await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const addendum = { status: 'fresh_test_source_corpus_addendum_frozen_before_final_test_creation', base_frozen_package_sha256: guard.frozen_package_sha256, source_window_manifest_sha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`), chunks_sha256: manifest.chunks_sha256, provenance_sha256: manifest.provenance_sha256, policy_or_endpoint_change: false };
const addendumText = `${JSON.stringify(addendum, null, 2)}\n`;
await writeFile(path.join(FREEZE, 'FRESH_SOURCE_CORPUS_ADDENDUM.json'), addendumText, 'utf8');
await writeFile(path.join(FREEZE, 'FRESH_TEST_GUARD.json'), `${JSON.stringify({ ...guard, status: 'fresh_source_corpus_frozen_test_construction_unlocked', source_corpus_addendum_sha256: sha256(addendumText), source_corpus_chunks_sha256: manifest.chunks_sha256 }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...manifest, source_corpus_addendum_sha256: sha256(addendumText) }, null, 2));
