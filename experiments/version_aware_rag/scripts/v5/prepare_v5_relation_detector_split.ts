import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'data/configs/v5_relation_detector');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const paths = {
  corpus: path.join(EXP, 'data/corpus_v3/chunks.jsonl'),
  pairs: path.join(EXP, 'data/annotations_v3/relation_pairs.jsonl'),
  gold: path.join(EXP, 'data/annotations_v3/relations.adjudicated.jsonl')
};
const [corpusText, pairsText, goldText] = await Promise.all([readFile(paths.corpus, 'utf8'), readFile(paths.pairs, 'utf8'), readFile(paths.gold, 'utf8')]);
const chunks = new Map(parseJsonl(corpusText).map((row: any) => [row.chunk_id, row]));
const gold = new Map(parseJsonl(goldText).map((row: any) => [row.pair_id, row]));
const endpointGroups = new Map<string, any[]>();
for (const pair of parseJsonl(pairsText)) {
  const key = `${pair.old_chunk_id}|${pair.new_chunk_id}`;
  endpointGroups.set(key, [...(endpointGroups.get(key) || []), { ...pair, gold: gold.get(pair.pair_id) }]);
}

const consistent: any[] = [];
const ambiguous: any[] = [];
for (const [endpointKey, rows] of [...endpointGroups].sort(([a], [b]) => a.localeCompare(b))) {
  const labels = [...new Set(rows.map((row) => row.gold.relation_type))];
  const base = { endpoint_key: endpointKey, old_chunk_id: rows[0].old_chunk_id, new_chunk_id: rows[0].new_chunk_id, pair_ids: rows.map((row) => row.pair_id), labels };
  if (labels.length !== 1) {
    ambiguous.push({ ...base, reason: 'identical_detector_input_has_conflicting_gold_labels' });
    continue;
  }
  const oldChunk: any = chunks.get(base.old_chunk_id);
  const newChunk: any = chunks.get(base.new_chunk_id);
  if (!oldChunk || !newChunk) throw new Error(`Missing corpus endpoint for ${endpointKey}`);
  consistent.push({
    ...base,
    relation_type: labels[0],
    old_text: oldChunk.text,
    new_text: newChunk.text,
    old_published_at: oldChunk.published_at,
    new_published_at: newChunk.published_at
  });
}

// One endpoint group per class is sealed for validation. Selection is purely
// lexical and declared before any detector call; all remaining groups are dev.
const byClass = new Map<string, any[]>();
for (const row of consistent) byClass.set(row.relation_type, [...(byClass.get(row.relation_type) || []), row]);
const validation: any[] = [];
const development: any[] = [];
for (const [label, rows] of [...byClass].sort(([a], [b]) => a.localeCompare(b))) {
  rows.sort((a, b) => a.endpoint_key.localeCompare(b.endpoint_key));
  if (rows.length < 2) throw new Error(`Cannot create endpoint-disjoint split for ${label}`);
  validation.push({ ...rows[rows.length - 1], split: 'validation' });
  development.push(...rows.slice(0, -1).map((row) => ({ ...row, split: 'development' })));
}
development.sort((a, b) => a.endpoint_key.localeCompare(b.endpoint_key));
validation.sort((a, b) => a.endpoint_key.localeCompare(b.endpoint_key));

await mkdir(OUT, { recursive: true });
const devText = development.map((row) => JSON.stringify(row)).join('\n') + '\n';
const validationText = validation.map((row) => JSON.stringify(row)).join('\n') + '\n';
const ambiguousText = ambiguous.map((row) => JSON.stringify(row)).join('\n') + '\n';
await writeFile(path.join(OUT, 'development.jsonl'), devText, 'utf8');
await writeFile(path.join(OUT, 'validation.sealed.jsonl'), validationText, 'utf8');
await writeFile(path.join(OUT, 'ambiguous_excluded.jsonl'), ambiguousText, 'utf8');
const distribution = (rows: any[]) => Object.fromEntries([...new Set(rows.map((row) => row.relation_type))].sort().map((label) => [label, rows.filter((row) => row.relation_type === label).length]));
const manifest = {
  status: 'prepared_before_detector_calls',
  created_at: new Date().toISOString(),
  split_unit: 'unique_old_new_endpoint_pair',
  split_rule: 'lexicographically_last_consistent_endpoint_group_per_relation_class_is_validation; all other consistent groups are development',
  development_count: development.length,
  validation_count: validation.length,
  ambiguous_excluded_count: ambiguous.length,
  development_distribution: distribution(development),
  validation_distribution: distribution(validation),
  endpoint_overlap_count: development.filter((d) => validation.some((v) => v.endpoint_key === d.endpoint_key)).length,
  validation_labels_must_not_be_read_during_development_selection: true,
  input_checksums: { corpus_sha256: sha256(corpusText), pairs_sha256: sha256(pairsText), gold_sha256: sha256(goldText) },
  artifact_checksums: { development_sha256: sha256(devText), validation_sealed_sha256: sha256(validationText), ambiguous_excluded_sha256: sha256(ambiguousText) }
};
await writeFile(path.join(OUT, 'SPLIT_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
await writeFile(path.join(OUT, 'DETECTOR_GUARD.json'), JSON.stringify({
  status: 'development_selection_unlocked',
  split_manifest_sha256: sha256(JSON.stringify(manifest, null, 2) + '\n'),
  validation_sealed_sha256: sha256(validationText),
  development_selection_complete: false,
  validation_execution_count: 0,
  fresh_v4_data_allowed: false,
  tuning_after_validation_allowed: false
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
