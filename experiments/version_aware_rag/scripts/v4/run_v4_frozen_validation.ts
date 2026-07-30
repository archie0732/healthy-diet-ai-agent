import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { FixedCandidatePoolRetriever } from '../../src/retrieval/fixed_candidate_pool';
import { GeminiRerankClient, type PassageForRerank } from '../../src/retrieval/gemini_rerank_client';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import type { CorpusChunk } from '../../src/corpus/types';
import type { RetrievalContext, SearchResult } from '../../src/retrieval/types';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const SPLITS = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits');
const FREEZE_DIR = path.join(EXP, 'data/configs/v4_validation_frozen');
const OUT = path.join(EXP, 'results/v4/validation_confirmation');
const CALLS = path.join(OUT, 'model_calls');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const round = (value: number) => Number(value.toFixed(6));
type RecordRow = { draft_id: string; split: string; stratum: string; query_text: string; required_current_chunk_ids: string[]; required_retained_chunk_ids: string[] };
type Edge = { edge_id: string; relation_type: string; current_chunk_id: string; retained_chunk_id: string };
type Score = { chunk_id: string; base_bm25: number; base_norm: number; propagated_base_norm: number; relation_active: boolean; expansion_candidate: boolean; policy_score: number; cross_encoder_score?: number; final_score: number };

function normalize(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values);
  return max <= min ? values.map(() => 0) : values.map((value) => (value - min) / (max - min));
}
function select(scores: Score[], edges: Edge[], topK: number) {
  const sorted = [...scores].sort((a, b) => b.final_score - a.final_score || a.chunk_id.localeCompare(b.chunk_id));
  if (!sorted.length) return [];
  const chosen = [sorted[0]], ids = new Set([sorted[0].chunk_id]), counterparts = new Set<string>();
  for (const edge of edges) {
    if (edge.current_chunk_id === sorted[0].chunk_id) counterparts.add(edge.retained_chunk_id);
    if (edge.retained_chunk_id === sorted[0].chunk_id) counterparts.add(edge.current_chunk_id);
  }
  const paired = sorted.find((item) => counterparts.has(item.chunk_id) && !ids.has(item.chunk_id));
  if (paired && chosen.length < topK) { chosen.push(paired); ids.add(paired.chunk_id); }
  for (const item of sorted) if (chosen.length < topK && !ids.has(item.chunk_id)) { chosen.push(item); ids.add(item.chunk_id); }
  return chosen;
}
function policyScores(base: SearchResult[], candidateIds: string[], edges: Edge[], relationBoost: number, propagation: number): Score[] {
  const baseNorm = normalize(base.map((item) => item.baseScore));
  const normById = new Map(base.map((item, i) => [item.chunkId, baseNorm[i]]));
  const baseById = new Map(base.map((item) => [item.chunkId, item]));
  const edgeById = new Map<string, Edge[]>();
  for (const edge of edges) for (const id of [edge.current_chunk_id, edge.retained_chunk_id]) edgeById.set(id, [...(edgeById.get(id) || []), edge]);
  const raw = candidateIds.map((id) => {
    const related = edgeById.get(id) || [];
    const counterpart = related.flatMap((edge) => [edge.current_chunk_id, edge.retained_chunk_id]).filter((other) => other !== id).map((other) => normById.get(other) || 0);
    const propagated = counterpart.length ? Math.max(...counterpart) * propagation : 0;
    return { chunk_id: id, base_bm25: baseById.get(id)?.baseScore || 0, base_norm: round(normById.get(id) || 0), propagated_base_norm: round(propagated), relation_active: related.length > 0, expansion_candidate: !baseById.has(id), policy_score: Math.max(normById.get(id) || 0, propagated) + (related.length ? relationBoost : 0), final_score: 0 };
  });
  const normalized = normalize(raw.map((item) => item.policy_score));
  return raw.map((item, i) => ({ ...item, policy_score: round(normalized[i]), final_score: round(normalized[i]) }));
}
function metric(rows: any[], records: Map<string, RecordRow>) {
  let required = 0, hits = 0, current = 0, currentHits = 0, retained = 0, retainedHits = 0;
  for (const row of rows) {
    const record = records.get(row.query_id)!;
    const req = [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids];
    required += req.length; hits += req.filter((id) => row.retrieved_chunk_ids.includes(id)).length;
    current += record.required_current_chunk_ids.length; currentHits += record.required_current_chunk_ids.filter((id) => row.retrieved_chunk_ids.includes(id)).length;
    retained += record.required_retained_chunk_ids.length; retainedHits += record.required_retained_chunk_ids.filter((id) => row.retrieved_chunk_ids.includes(id)).length;
  }
  return { query_count: rows.length, required_micro_recall_at_3: required ? round(hits / required) : 0, current_required_micro_recall_at_3: current ? round(currentHits / current) : 0, retained_required_micro_recall_at_3: retained ? round(retainedHits / retained) : 0 };
}

const configPath = path.join(FREEZE_DIR, 'FROZEN_VALIDATION_CONFIG.json');
const manifestPath = path.join(FREEZE_DIR, 'FREEZE_MANIFEST.json');
const [configText, manifestText, splitText] = await Promise.all([readFile(configPath, 'utf8'), readFile(manifestPath, 'utf8'), readFile(path.join(SPLITS, 'split_manifest.json'), 'utf8')]);
const config = JSON.parse(configText), manifest = JSON.parse(manifestText), split = JSON.parse(splitText);
if (sha256(configText) !== manifest.frozen_config_sha256) throw new Error('Frozen config checksum mismatch.');
if (manifest.validation_execution_count_completed !== 0) throw new Error('Validation was already completed; rerun prohibited.');
if (config.selected_system !== 'oracle_cross_0.5' || config.cross_encoder.model_id !== 'gemma-4-31b-it' || config.policy.semantic_alpha !== 0.5) throw new Error('Frozen selection is invalid.');
if (config.checksums.sealed_validation_split_sha256 !== split.validation.sha256) throw new Error('Sealed validation checksum mismatch.');

const [devText, validationText, corpusText] = await Promise.all([readFile(path.join(SPLITS, 'development.jsonl'), 'utf8'), readFile(path.join(SPLITS, 'validation.sealed.jsonl'), 'utf8'), readFile(CORPUS, 'utf8')]);
if (sha256(validationText) !== split.validation.sha256) throw new Error('Validation content failed its frozen checksum.');
const dev = parseJsonl(devText) as RecordRow[], validation = parseJsonl(validationText) as RecordRow[], chunks = parseJsonl(corpusText) as CorpusChunk[];
if (validation.length !== 8 || validation.some((row) => row.split !== 'validation')) throw new Error('Expected exactly eight validation records.');
const all = [...dev, ...validation];
const edges: Edge[] = all.flatMap((record) => record.required_current_chunk_ids.flatMap((current) => record.required_retained_chunk_ids.map((retained, i) => ({ edge_id: `${record.draft_id}-edge-${i + 1}`, relation_type: record.stratum, current_chunk_id: current, retained_chunk_id: retained }))));
const chunkById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
const bm25 = new BM25Retriever(chunks);
const client = new GeminiRerankClient({ crossEncoderModel: config.cross_encoder.model_id });
await mkdir(CALLS, { recursive: true });
const inProgress = { ...manifest, validation_execution_status: 'in_progress', validation_started_at: new Date().toISOString(), protocol_deviation: 'One validation record was exposed during a pre-freeze format inspection after development selection; no validation scores were generated and no frozen parameter changed.' };
await writeFile(manifestPath, `${JSON.stringify(inProgress, null, 2)}\n`, 'utf8');

const raw: any[] = [];
for (const record of validation) {
  const context: RetrievalContext = { queryId: record.draft_id, question: record.query_text, targetPopulation: [], conditions: [] };
  const base = await bm25.retrieve(context, config.candidate_budget);
  const baseIds = base.map((item) => item.chunkId), baseSet = new Set(baseIds);
  const activeEdges = edges.filter((edge) => baseSet.has(edge.current_chunk_id) || baseSet.has(edge.retained_chunk_id));
  const candidateIds = [...baseIds];
  for (const edge of activeEdges) for (const id of [edge.current_chunk_id, edge.retained_chunk_id]) if (!candidateIds.includes(id)) candidateIds.push(id);
  const policy = policyScores(base, candidateIds, activeEdges, config.policy.relation_boost, config.policy.propagation_factor);
  const recency = new RecencyBoostRetriever(new FixedCandidatePoolRetriever(base), chunks, config.recency_lambda);
  const recencyTop = await recency.retrieve(context, config.top_k);
  raw.push({ query_id: record.draft_id, stratum: record.stratum, system: 'recency', shared_base_candidate_hash: sha256(baseIds.join('\n')), shared_base_candidate_ids: baseIds, oracle_candidate_hash: null, oracle_candidate_ids: null, retrieved_chunk_ids: recencyTop.map((item) => item.chunkId), scores: recencyTop });

  const callPath = path.join(CALLS, `${record.draft_id}.gemma-4-31b-it.cross_encoder.json`);
  let call: any;
  try { call = JSON.parse(await readFile(callPath, 'utf8')); } catch { call = null; }
  let crossScores: Map<string, number>;
  if (call?.frozen_config_sha256 === manifest.frozen_config_sha256 && Object.keys(call.scores || {}).length === candidateIds.length) {
    crossScores = new Map(Object.entries(call.scores).map(([id, score]) => [id, Number(score)]));
  } else {
    const passages: PassageForRerank[] = candidateIds.map((id) => { const chunk = chunkById.get(id)!; return { chunkId: id, documentId: chunk.document_id, publishedAt: chunk.published_at, text: chunk.text }; });
    const result = await client.crossEncode(record.query_text, passages);
    crossScores = result.scores;
    await writeFile(callPath, `${JSON.stringify({ query_id: record.draft_id, model_id: client.crossEncoderModel, frozen_config_sha256: manifest.frozen_config_sha256, prompt: result.prompt, prompt_sha256: sha256(result.prompt), scores: Object.fromEntries(result.scores), trace: result.trace }, null, 2)}\n`, 'utf8');
  }
  const scored = policy.map((item) => ({ ...item, cross_encoder_score: round(crossScores.get(item.chunk_id)!), final_score: round((1 - config.policy.semantic_alpha) * item.policy_score + config.policy.semantic_alpha * crossScores.get(item.chunk_id)!) }));
  const top = select(scored, activeEdges, config.top_k);
  raw.push({ query_id: record.draft_id, stratum: record.stratum, system: config.selected_system, alpha: config.policy.semantic_alpha, shared_base_candidate_hash: sha256(baseIds.join('\n')), shared_base_candidate_ids: baseIds, oracle_candidate_hash: sha256(candidateIds.join('\n')), oracle_candidate_ids: candidateIds, retrieved_chunk_ids: top.map((item) => item.chunk_id), scores: scored });
}

const recordMap = new Map(validation.map((row) => [row.draft_id, row]));
const metrics: any = {};
for (const system of ['recency', config.selected_system]) {
  const rows = raw.filter((row) => row.system === system);
  metrics[system] = { all: metric(rows, recordMap), conditional_merge: metric(rows.filter((row) => row.stratum === 'conditional_merge'), recordMap), compatible_history: metric(rows.filter((row) => row.stratum === 'compatible_history'), recordMap) };
}
const rec = metrics.recency, selected = metrics[config.selected_system];
const effectivenessGate = {
  conditional_merge_noninferiority: selected.conditional_merge.required_micro_recall_at_3 >= rec.conditional_merge.required_micro_recall_at_3,
  compatible_history_noninferiority: selected.compatible_history.required_micro_recall_at_3 >= rec.compatible_history.required_micro_recall_at_3,
  retained_history_strict_improvement: selected.all.retained_required_micro_recall_at_3 > rec.all.retained_required_micro_recall_at_3,
};
const result = {
  status: 'validation_effectiveness_confirmation_complete', validation_run_number: 1, tuning_after_validation: false,
  protocol_deviation: inProgress.protocol_deviation, frozen_config_sha256: manifest.frozen_config_sha256,
  validation_split_sha256: sha256(validationText), metrics, effectiveness_gate: effectivenessGate,
  effectiveness_gate_passed: Object.values(effectivenessGate).every(Boolean),
  safety_gate_status: 'pending_blinded_validation_candidate_safety_labels',
  full_validation_promotion_gate_passed: false,
};
await writeFile(path.join(OUT, 'raw_retrieval_results.jsonl'), raw.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
await writeFile(path.join(OUT, 'VALIDATION_CONFIRMATION.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, 'oracle_global_relation_edges.jsonl'), edges.map((edge) => JSON.stringify(edge)).join('\n') + '\n', 'utf8');
const report = `# V4 Frozen Validation Confirmation\n\nThe frozen system was executed once with no validation tuning.\n\n- Conditional merge required micro Recall@3: Recency ${rec.conditional_merge.required_micro_recall_at_3}; Version-Aware ${selected.conditional_merge.required_micro_recall_at_3}.\n- Compatible history required micro Recall@3: Recency ${rec.compatible_history.required_micro_recall_at_3}; Version-Aware ${selected.compatible_history.required_micro_recall_at_3}.\n- Retained-history required micro Recall@3: Recency ${rec.all.retained_required_micro_recall_at_3}; Version-Aware ${selected.all.retained_required_micro_recall_at_3}.\n- Effectiveness gate: ${result.effectiveness_gate_passed ? 'PASS' : 'FAIL'}.\n- Safety gate: pending blinded candidate labels; no retuning is permitted.\n\nProtocol deviation: ${result.protocol_deviation}\n`;
await writeFile(path.join(OUT, 'VALIDATION_CONFIRMATION.md'), report, 'utf8');
const files = ['raw_retrieval_results.jsonl', 'VALIDATION_CONFIRMATION.json', 'VALIDATION_CONFIRMATION.md', 'oracle_global_relation_edges.jsonl'];
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), (await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(OUT, file)))}  ${file}`))).join('\n') + '\n', 'utf8');
const completed = { ...inProgress, validation_execution_status: 'completed', validation_execution_count_completed: 1, validation_completed_at: new Date().toISOString(), validation_result_sha256: sha256(await readFile(path.join(OUT, 'VALIDATION_CONFIRMATION.json'))) };
await writeFile(manifestPath, `${JSON.stringify(completed, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
