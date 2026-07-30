import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { FixedCandidatePoolRetriever } from '../../src/retrieval/fixed_candidate_pool';
import { GeminiRerankClient, cosine, type ApiTrace, type PassageForRerank } from '../../src/retrieval/gemini_rerank_client';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import type { CorpusChunk } from '../../src/corpus/types';
import type { RetrievalContext, SearchResult } from '../../src/retrieval/types';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const DEV = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/development.jsonl');
const SPLIT_MANIFEST = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/split_manifest.json');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const OUT = path.join(EXP, 'results/v4/dev_model_selection');
const RAW_CALLS = path.join(OUT, 'model_calls');
const CANDIDATE_BUDGET = 20;
const TOP_K = 3;
const RECENCY_LAMBDA = 0.75;
const RELATION_BOOST = 0.35;
const PROPAGATION_FACTOR = 0.9;
const ALPHAS = [0.25, 0.5, 0.75, 1];
const CROSS_ENCODER_MODEL = process.env.V4_CROSS_ENCODER_MODEL || 'gemini-3.5-flash';
const CROSS_MODEL_SLUG = CROSS_ENCODER_MODEL.replace(/[^a-zA-Z0-9._-]+/g, '_');
const CROSS_THINKING_LEVEL = CROSS_ENCODER_MODEL.startsWith('gemini-3') ? 'minimal' : 'not_applicable';
const SKIP_CROSS_ENCODER = process.env.V4_SKIP_CROSS_ENCODER === '1';
const CROSS_BATCH_SIZE = CROSS_ENCODER_MODEL === 'gemini-3.5-flash' ? 8 : Number.MAX_SAFE_INTEGER;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const round = (value: number) => Number(value.toFixed(6));
const rateLimitPause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type DevRecord = {
  draft_id: string;
  split: 'development';
  stratum: 'conditional_merge' | 'compatible_history';
  query_text: string;
  required_current_chunk_ids: string[];
  required_retained_chunk_ids: string[];
};
type Edge = { edge_id: string; relation_type: string; current_chunk_id: string; retained_chunk_id: string };
type CandidateScore = {
  chunk_id: string;
  base_bm25: number;
  base_norm: number;
  propagated_base_norm: number;
  relation_active: boolean;
  expansion_candidate: boolean;
  policy_score: number;
  embedding_score?: number;
  cross_encoder_score?: number;
  final_score: number;
};
type RawResult = {
  query_id: string;
  stratum: string;
  system: string;
  alpha: number | null;
  shared_base_candidate_hash: string;
  shared_base_candidate_ids: string[];
  oracle_candidate_hash: string | null;
  oracle_candidate_ids: string[] | null;
  retrieved_chunk_ids: string[];
  scores: CandidateScore[];
};

function normalize(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  if (max <= min) return values.map(() => 0);
  return values.map((value) => (value - min) / (max - min));
}

function selectWithPairCoverage(scores: CandidateScore[], activeEdges: Edge[]): CandidateScore[] {
  const sorted = [...scores].sort((a, b) => b.final_score - a.final_score || a.chunk_id.localeCompare(b.chunk_id));
  if (!sorted.length) return [];
  const selected: CandidateScore[] = [sorted[0]];
  const selectedIds = new Set([sorted[0].chunk_id]);
  const counterparts = new Set<string>();
  for (const edge of activeEdges) {
    if (edge.current_chunk_id === sorted[0].chunk_id) counterparts.add(edge.retained_chunk_id);
    if (edge.retained_chunk_id === sorted[0].chunk_id) counterparts.add(edge.current_chunk_id);
  }
  const paired = sorted.find((candidate) => counterparts.has(candidate.chunk_id) && !selectedIds.has(candidate.chunk_id));
  if (paired && selected.length < TOP_K) {
    selected.push(paired);
    selectedIds.add(paired.chunk_id);
  }
  for (const candidate of sorted) {
    if (selected.length >= TOP_K) break;
    if (!selectedIds.has(candidate.chunk_id)) {
      selected.push(candidate);
      selectedIds.add(candidate.chunk_id);
    }
  }
  return selected;
}

function scoreOracleCandidates(base: SearchResult[], candidateIds: string[], activeEdges: Edge[]): CandidateScore[] {
  const baseById = new Map(base.map((candidate) => [candidate.chunkId, candidate]));
  const baseNorms = normalize(base.map((candidate) => candidate.baseScore));
  const baseNormById = new Map(base.map((candidate, index) => [candidate.chunkId, baseNorms[index]]));
  const edgeByEndpoint = new Map<string, Edge[]>();
  for (const edge of activeEdges) {
    for (const id of [edge.current_chunk_id, edge.retained_chunk_id]) edgeByEndpoint.set(id, [...(edgeByEndpoint.get(id) || []), edge]);
  }
  const raw = candidateIds.map((id) => {
    const related = edgeByEndpoint.get(id) || [];
    const counterpartBase = related.flatMap((edge) => [edge.current_chunk_id, edge.retained_chunk_id])
      .filter((other) => other !== id).map((other) => baseNormById.get(other) || 0);
    const propagated = counterpartBase.length ? Math.max(...counterpartBase) * PROPAGATION_FACTOR : 0;
    const baseNorm = baseNormById.get(id) || 0;
    const policy = Math.max(baseNorm, propagated) + (related.length ? RELATION_BOOST : 0);
    return {
      chunk_id: id,
      base_bm25: baseById.get(id)?.baseScore || 0,
      base_norm: round(baseNorm),
      propagated_base_norm: round(propagated),
      relation_active: related.length > 0,
      expansion_candidate: !baseById.has(id),
      policy_score: policy,
      final_score: policy,
    };
  });
  const policyNorm = normalize(raw.map((candidate) => candidate.policy_score));
  return raw.map((candidate, index) => ({ ...candidate, policy_score: round(policyNorm[index]), final_score: round(policyNorm[index]) }));
}

function metricBlock(rows: RawResult[], records: Map<string, DevRecord>) {
  let required = 0, requiredHits = 0, current = 0, currentHits = 0, retained = 0, retainedHits = 0;
  let queryRecallTotal = 0, nonRequiredHits = 0;
  for (const row of rows) {
    const record = records.get(row.query_id)!;
    const requiredIds = [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids];
    const hits = requiredIds.filter((id) => row.retrieved_chunk_ids.includes(id)).length;
    required += requiredIds.length;
    requiredHits += hits;
    current += record.required_current_chunk_ids.length;
    currentHits += record.required_current_chunk_ids.filter((id) => row.retrieved_chunk_ids.includes(id)).length;
    retained += record.required_retained_chunk_ids.length;
    retainedHits += record.required_retained_chunk_ids.filter((id) => row.retrieved_chunk_ids.includes(id)).length;
    queryRecallTotal += requiredIds.length ? hits / requiredIds.length : 0;
    const requiredSet = new Set(requiredIds);
    nonRequiredHits += row.retrieved_chunk_ids.filter((id) => !requiredSet.has(id)).length;
  }
  return {
    query_count: rows.length,
    mean_query_recall_at_3: rows.length ? round(queryRecallTotal / rows.length) : 0,
    required_micro_recall_at_3: required ? round(requiredHits / required) : 0,
    current_required_micro_recall_at_3: current ? round(currentHits / current) : 0,
    retained_required_micro_recall_at_3: retained ? round(retainedHits / retained) : 0,
    non_required_hit_rate_at_3_diagnostic_only: rows.length ? round(nonRequiredHits / (rows.length * TOP_K)) : 0,
    stale_forbidden_hit_rate_at_3: null,
    stale_forbidden_status: 'not_evaluable_missing_query_level_labels',
  };
}

async function mapLimit<T, R>(values: T[], limit: number, fn: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await fn(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function crossEncodeBatched(client: GeminiRerankClient, query: string, passages: PassageForRerank[]) {
  if (passages.length <= CROSS_BATCH_SIZE) return client.crossEncode(query, passages);
  const batches: PassageForRerank[][] = [];
  for (let offset = 0; offset < passages.length; offset += CROSS_BATCH_SIZE) batches.push(passages.slice(offset, offset + CROSS_BATCH_SIZE));
  const results = await Promise.all(batches.map((batch) => client.crossEncode(query, batch)));
  const scores = new Map<string, number>();
  const rationales = new Map<string, string>();
  for (const result of results) {
    for (const [id, score] of result.scores) scores.set(id, score);
    for (const [id, rationale] of result.rationales) rationales.set(id, rationale);
  }
  const rawResponse = results.map((result) => result.trace.rawResponse);
  const prompts = results.map((result) => result.prompt);
  return {
    scores,
    rationales,
    prompt: prompts.join('\n\n--- CROSS BATCH ---\n\n'),
    trace: {
      ...results[0].trace,
      requestSha256: sha256(prompts.join('\n---\n')),
      responseSha256: sha256(JSON.stringify(rawResponse)),
      latencyMs: Math.max(...results.map((result) => result.trace.latencyMs)),
      usageMetadata: { batches: results.map((result) => result.trace.usageMetadata) },
      rawResponse,
    },
  };
}

await mkdir(RAW_CALLS, { recursive: true });
const [devText, splitManifestText, corpusText] = await Promise.all([
  readFile(DEV, 'utf8'), readFile(SPLIT_MANIFEST, 'utf8'), readFile(CORPUS, 'utf8'),
]);
const splitManifest = JSON.parse(splitManifestText);
if (sha256(devText) !== splitManifest.development.sha256 || splitManifest.validation.read_allowed_now !== false) {
  throw new Error('Development split checksum or validation seal guard failed.');
}
const records = parseJsonl(devText) as DevRecord[];
if (records.length !== 16 || records.some((record) => record.split !== 'development')) throw new Error('Development runner received a non-development record.');
const chunks = parseJsonl(corpusText) as CorpusChunk[];
const chunkById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
const recordById = new Map(records.map((record) => [record.draft_id, record]));
const edges: Edge[] = records.flatMap((record) => record.required_current_chunk_ids.flatMap((current) =>
  record.required_retained_chunk_ids.map((retained, index) => ({
    edge_id: `${record.draft_id}-edge-${index + 1}`,
    relation_type: record.stratum,
    current_chunk_id: current,
    retained_chunk_id: retained,
  }))));
const bm25 = new BM25Retriever(chunks);
const client = new GeminiRerankClient({ embeddingModel: 'gemini-embedding-001', crossEncoderModel: CROSS_ENCODER_MODEL, embeddingDimensions: 768 });
const modelRegistryFile = `model_registry.${CROSS_MODEL_SLUG}.json`;
const cachedRegistry = await readFile(path.join(OUT, modelRegistryFile), 'utf8').then(JSON.parse).catch(async () =>
  readFile(path.join(OUT, 'model_registry.json'), 'utf8').then(JSON.parse).catch(() => null));
const embeddingDescriptor = cachedRegistry?.embedding?.model_id === client.embeddingModel
  ? { descriptor: cachedRegistry.embedding.descriptor, descriptorSha256: cachedRegistry.embedding.descriptor_sha256 }
  : await client.describeModel(client.embeddingModel);
const crossDescriptor = cachedRegistry?.cross_encoder?.model_id === client.crossEncoderModel
  ? { descriptor: cachedRegistry.cross_encoder.descriptor, descriptorSha256: cachedRegistry.cross_encoder.descriptor_sha256 }
  : await client.describeModel(client.crossEncoderModel);
await writeFile(path.join(OUT, modelRegistryFile), `${JSON.stringify({
  api_version: client.apiVersion,
  embedding: { model_id: client.embeddingModel, descriptor_sha256: embeddingDescriptor.descriptorSha256, descriptor: embeddingDescriptor.descriptor, dimensions: 768, query_task: 'QUESTION_ANSWERING', document_task: 'RETRIEVAL_DOCUMENT' },
  cross_encoder: { model_id: client.crossEncoderModel, descriptor_sha256: crossDescriptor.descriptorSha256, descriptor: crossDescriptor.descriptor, temperature: 0, thinking_level: CROSS_THINKING_LEVEL, output_schema: 'scores_only_v1', max_output_tokens: 2048 },
  model_weight_hash_available_from_provider: false,
  hash_interpretation: 'Provider model-descriptor response SHA-256; Gemini API does not expose a model-weights hash.',
}, null, 2)}\n`, 'utf8');

const queryState: Array<{
  record: DevRecord; context: RetrievalContext; base: SearchResult[]; baseHash: string; activeEdges: Edge[]; candidateIds: string[]; oracleScores: CandidateScore[];
}> = [];
for (const record of records) {
  const context: RetrievalContext = { queryId: record.draft_id, question: record.query_text, targetPopulation: [], conditions: [] };
  const base = await bm25.retrieve(context, CANDIDATE_BUDGET);
  const baseIds = base.map((candidate) => candidate.chunkId);
  const baseSet = new Set(baseIds);
  const activeEdges = edges.filter((edge) => baseSet.has(edge.current_chunk_id) || baseSet.has(edge.retained_chunk_id));
  const candidateIds = [...baseIds];
  for (const edge of activeEdges) for (const id of [edge.current_chunk_id, edge.retained_chunk_id]) if (!candidateIds.includes(id)) candidateIds.push(id);
  queryState.push({ record, context, base, baseHash: sha256(baseIds.join('\n')), activeEdges, candidateIds, oracleScores: scoreOracleCandidates(base, candidateIds, activeEdges) });
}

const uniqueDocumentIds = [...new Set(queryState.flatMap((state) => state.candidateIds))].sort();
const embeddingTraces: Array<{ kind: string; id: string; trace: Omit<ApiTrace, 'rawResponse'> }> = [];
const documentVectors = new Map<string, number[]>();
const queryVectors = new Map<string, number[]>();
const embeddingCachePath = path.join(RAW_CALLS, 'embedding_vectors.jsonl');
const embeddingTracePath = path.join(RAW_CALLS, 'embedding_call_traces.jsonl');
const cachedEmbeddingText = await readFile(embeddingCachePath, 'utf8').catch(() => '');
if (cachedEmbeddingText) {
  for (const item of parseJsonl(cachedEmbeddingText)) {
    if (item.kind === 'document') documentVectors.set(item.id, item.vector);
    if (item.kind === 'query') queryVectors.set(item.id, item.vector);
  }
}
const embeddingCacheComplete = uniqueDocumentIds.every((id) => documentVectors.has(id)) && queryState.every((state) => queryVectors.has(state.record.draft_id));
if (!embeddingCacheComplete) {
  documentVectors.clear();
  queryVectors.clear();
  for (let offset = 0; offset < uniqueDocumentIds.length; offset += 50) {
    const ids = uniqueDocumentIds.slice(offset, offset + 50);
    const result = await client.embedBatch(ids.map((id) => {
      const chunk = chunkById.get(id);
      if (!chunk) throw new Error(`Missing corpus chunk ${id}`);
      return { text: chunk.text, taskType: 'RETRIEVAL_DOCUMENT' as const, title: chunk.document_id };
    }));
    ids.forEach((id, index) => documentVectors.set(id, result.vectors[index]));
    const { rawResponse: _raw, ...trace } = result.trace;
    embeddingTraces.push({ kind: 'document_batch', id: `${offset}-${offset + ids.length - 1}`, trace });
  }
  const queryEmbeddingResult = await client.embedBatch(queryState.map((state) => ({ text: state.record.query_text, taskType: 'QUESTION_ANSWERING' as const })));
  queryState.forEach((state, index) => queryVectors.set(state.record.draft_id, queryEmbeddingResult.vectors[index]));
  const { rawResponse: _queryRaw, ...queryTrace } = queryEmbeddingResult.trace;
  embeddingTraces.push({ kind: 'query_batch', id: 'all-development-queries', trace: queryTrace });
  await writeFile(embeddingCachePath, [
    ...[...documentVectors].map(([id, vector]) => JSON.stringify({ kind: 'document', id, vector })),
    ...[...queryVectors].map(([id, vector]) => JSON.stringify({ kind: 'query', id, vector })),
  ].join('\n') + '\n', 'utf8');
  await writeFile(embeddingTracePath, embeddingTraces.map((trace) => JSON.stringify(trace)).join('\n') + '\n', 'utf8');
}

const crossScores = new Map<string, Map<string, number>>();
const crossRationales = new Map<string, Map<string, string>>();
for (const state of SKIP_CROSS_ENCODER ? [] : queryState) {
  const callPath = path.join(RAW_CALLS, `${state.record.draft_id}.${CROSS_MODEL_SLUG}.cross_encoder.json`);
  const cached = await readFile(callPath, 'utf8').then(JSON.parse).catch(() => null);
  const cachedBatchSize = cached?.cross_batch_size ?? (client.crossEncoderModel === 'gemini-3.5-flash' ? null : Number.MAX_SAFE_INTEGER);
  if (cached?.model_id === client.crossEncoderModel && cached?.output_schema === 'scores_only_v1' && cached?.thinking_level === CROSS_THINKING_LEVEL && cachedBatchSize === CROSS_BATCH_SIZE && cached?.scores && Object.keys(cached.scores).length === state.candidateIds.length) {
    crossScores.set(state.record.draft_id, new Map(Object.entries(cached.scores).map(([id, score]) => [id, Number(score)])));
    crossRationales.set(state.record.draft_id, new Map(Object.entries(cached.rationales || {}).map(([id, rationale]) => [id, String(rationale)])));
    continue;
  }
  const passages: PassageForRerank[] = state.candidateIds.map((id) => {
    const chunk = chunkById.get(id)!;
    return { chunkId: id, documentId: chunk.document_id, publishedAt: chunk.published_at, text: chunk.text };
  });
  const result = await crossEncodeBatched(client, state.record.query_text, passages);
  crossScores.set(state.record.draft_id, result.scores);
  crossRationales.set(state.record.draft_id, result.rationales);
  await writeFile(callPath, `${JSON.stringify({
    query_id: state.record.draft_id,
    model_id: result.trace.modelId,
    thinking_level: CROSS_THINKING_LEVEL,
    output_schema: 'scores_only_v1',
    cross_batch_size: CROSS_BATCH_SIZE,
    prompt: result.prompt,
    prompt_sha256: sha256(result.prompt),
    scores: Object.fromEntries(result.scores),
    rationales: Object.fromEntries(result.rationales),
    trace: result.trace,
  }, null, 2)}\n`, 'utf8');
  await rateLimitPause(4_000);
}

const raw: RawResult[] = [];
for (const state of queryState) {
  const recency = new RecencyBoostRetriever(new FixedCandidatePoolRetriever(state.base), chunks, RECENCY_LAMBDA);
  const recencyResults = await recency.retrieve(state.context, TOP_K);
  raw.push({
    query_id: state.record.draft_id, stratum: state.record.stratum, system: 'recency', alpha: null,
    shared_base_candidate_hash: state.baseHash, shared_base_candidate_ids: state.base.map((candidate) => candidate.chunkId),
    oracle_candidate_hash: null, oracle_candidate_ids: null, retrieved_chunk_ids: recencyResults.map((candidate) => candidate.chunkId),
    scores: recencyResults.map((candidate) => ({ chunk_id: candidate.chunkId, base_bm25: candidate.baseScore, base_norm: candidate.scoreComponents.base_norm, propagated_base_norm: 0, relation_active: false, expansion_candidate: false, policy_score: 0, final_score: candidate.finalScore })),
  });
  const oracleHash = sha256(state.candidateIds.join('\n'));
  const oracleSelected = selectWithPairCoverage(state.oracleScores, state.activeEdges);
  raw.push({
    query_id: state.record.draft_id, stratum: state.record.stratum, system: 'oracle_lineage', alpha: null,
    shared_base_candidate_hash: state.baseHash, shared_base_candidate_ids: state.base.map((candidate) => candidate.chunkId),
    oracle_candidate_hash: oracleHash, oracle_candidate_ids: state.candidateIds, retrieved_chunk_ids: oracleSelected.map((candidate) => candidate.chunk_id), scores: state.oracleScores,
  });
  const queryVector = queryVectors.get(state.record.draft_id)!;
  const embeddingRaw = state.candidateIds.map((id) => cosine(queryVector, documentVectors.get(id)!));
  const embeddingNorm = normalize(embeddingRaw);
  const cross = crossScores.get(state.record.draft_id);
  for (const alpha of ALPHAS) {
    const embeddingCandidates = state.oracleScores.map((candidate, index) => ({
      ...candidate,
      embedding_score: round(embeddingNorm[index]),
      final_score: round((1 - alpha) * candidate.policy_score + alpha * embeddingNorm[index]),
    }));
    const embeddingSelected = selectWithPairCoverage(embeddingCandidates, state.activeEdges);
    raw.push({
      query_id: state.record.draft_id, stratum: state.record.stratum, system: `oracle_embedding_${alpha}`, alpha,
      shared_base_candidate_hash: state.baseHash, shared_base_candidate_ids: state.base.map((candidate) => candidate.chunkId),
      oracle_candidate_hash: oracleHash, oracle_candidate_ids: state.candidateIds, retrieved_chunk_ids: embeddingSelected.map((candidate) => candidate.chunk_id), scores: embeddingCandidates,
    });
    if (cross) {
      const crossCandidates = state.oracleScores.map((candidate) => ({
        ...candidate,
        cross_encoder_score: round(cross.get(candidate.chunk_id)!),
        final_score: round((1 - alpha) * candidate.policy_score + alpha * cross.get(candidate.chunk_id)!),
      }));
      const crossSelected = selectWithPairCoverage(crossCandidates, state.activeEdges);
      raw.push({
        query_id: state.record.draft_id, stratum: state.record.stratum, system: `oracle_cross_${alpha}`, alpha,
        shared_base_candidate_hash: state.baseHash, shared_base_candidate_ids: state.base.map((candidate) => candidate.chunkId),
        oracle_candidate_hash: oracleHash, oracle_candidate_ids: state.candidateIds, retrieved_chunk_ids: crossSelected.map((candidate) => candidate.chunk_id), scores: crossCandidates,
      });
    }
  }
}

const systems = [...new Set(raw.map((row) => row.system))];
const metrics: Record<string, any> = {};
for (const system of systems) {
  const rows = raw.filter((row) => row.system === system);
  metrics[system] = {
    all: metricBlock(rows, recordById),
    conditional_merge: metricBlock(rows.filter((row) => row.stratum === 'conditional_merge'), recordById),
    compatible_history: metricBlock(rows.filter((row) => row.stratum === 'compatible_history'), recordById),
  };
}
const candidateCoverage = queryState.map((state) => {
  const required = [...state.record.required_current_chunk_ids, ...state.record.required_retained_chunk_ids];
  const baseIds = new Set(state.base.map((candidate) => candidate.chunkId));
  const oracleIds = new Set(state.candidateIds);
  return {
    query_id: state.record.draft_id,
    stratum: state.record.stratum,
    required_count: required.length,
    base_candidate_recall_at_20: round(required.filter((id) => baseIds.has(id)).length / required.length),
    oracle_expanded_candidate_recall: round(required.filter((id) => oracleIds.has(id)).length / required.length),
    expansion_count: state.candidateIds.length - state.base.length,
  };
});
const recencyMetrics = metrics.recency;
const oracleSystems = systems.filter((system) => system !== 'recency');
const targetEligible = oracleSystems.filter((system) =>
  metrics[system].conditional_merge.required_micro_recall_at_3 >= recencyMetrics.conditional_merge.required_micro_recall_at_3 &&
  metrics[system].compatible_history.required_micro_recall_at_3 >= recencyMetrics.compatible_history.required_micro_recall_at_3 &&
  metrics[system].all.retained_required_micro_recall_at_3 > recencyMetrics.all.retained_required_micro_recall_at_3);
targetEligible.sort((left, right) =>
  metrics[right].all.required_micro_recall_at_3 - metrics[left].all.required_micro_recall_at_3 || left.localeCompare(right));
const selectedCandidate = targetEligible[0] || null;
const gate = {
  target_strata_noninferiority: selectedCandidate !== null,
  retained_history_strict_improvement: selectedCandidate !== null,
  stale_forbidden_nonincrease: null,
  stale_forbidden_status: 'blocked_missing_query_level_stale_and_forbidden_labels',
  full_promotion_gate_passed: false,
  development_selected_candidate: selectedCandidate,
  validation_execution_allowed: false,
};
const preregistration = {
  plan: 'V4 expanded development-only model selection',
  input_split: 'development.jsonl only',
  development_split_sha256: sha256(devText),
  validation_split_read_count: 0,
  fresh_test_read_count: 0,
  candidate_budget: CANDIDATE_BUDGET,
  top_k: TOP_K,
  recency_lambda: RECENCY_LAMBDA,
  oracle_relation_source: 'project-owner-approved development annotations; global relation edges only, no query-ID lookup during retrieval',
  relation_boost: RELATION_BOOST,
  propagation_factor: PROPAGATION_FACTOR,
  semantic_alpha_grid: ALPHAS,
  embedding_model: client.embeddingModel,
  cross_encoder_model: client.crossEncoderModel,
  cross_encoder_thinking_level: CROSS_THINKING_LEVEL,
  cross_encoder_output_schema: 'scores_only_v1',
  cross_encoder_batch_size: CROSS_BATCH_SIZE,
  cross_encoder_execution_status: SKIP_CROSS_ENCODER ? 'not_run_pending_explicit_external_data_export_approval' : 'complete',
  endpoints: ['conditional_merge_required_micro_recall_at_3', 'compatible_history_required_micro_recall_at_3', 'retained_required_micro_recall_at_3', 'stale_forbidden_hit_rate_at_3'],
  selection_rule: 'Both target strata must match/exceed Recency; retained recall must strictly improve; stale/forbidden must not increase.',
  safety_label_limitation_declared_before_scoring: 'Approved expanded labels contain required current/retained evidence but no query-level stale/forbidden labels. Full gate cannot pass until those labels are independently added.',
};
const summary = { preregistration, metrics, candidate_coverage: candidateCoverage, eligible_on_available_endpoints: targetEligible, gate };
await writeFile(path.join(OUT, 'preregistration.json'), `${JSON.stringify(preregistration, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, 'oracle_development_relation_edges.jsonl'), edges.map((edge) => JSON.stringify(edge)).join('\n') + '\n', 'utf8');
await writeFile(path.join(OUT, 'raw_retrieval_results.jsonl'), raw.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
await writeFile(path.join(OUT, 'development_metrics.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
const report = `# V4 Expanded Development-Only Model Selection\n\n` +
  `This run used only the 16-record development split (SHA-256 \`${sha256(devText)}\`). Validation and fresh-test read counts are zero.\n\n` +
  `Embedding model: \`${client.embeddingModel}\`. Cross-encoder model: \`${client.crossEncoderModel}\` with ${CROSS_THINKING_LEVEL} thinking and scores-only output.\n\n` +
  `## Available endpoint result\n\n` +
  `- Recency conditional-merge required micro Recall@3: ${recencyMetrics.conditional_merge.required_micro_recall_at_3}\n` +
  `- Recency compatible-history required micro Recall@3: ${recencyMetrics.compatible_history.required_micro_recall_at_3}\n` +
  `- Recency retained-history required micro Recall@3: ${recencyMetrics.all.retained_required_micro_recall_at_3}\n` +
  `- Oracle modes meeting both target-stratum gates and strict retained-history improvement: ${targetEligible.join(', ') || 'none'}\n` +
  `- Development-selected candidate on available endpoints: ${selectedCandidate || 'none'}\n\n` +
  `## Gate\n\n` +
  `Full promotion is **blocked**. The approved expanded labels do not yet contain query-level stale/forbidden chunk labels, so the preregistered safety non-increase endpoint is not evaluable. Validation remains sealed.\n`;
await writeFile(path.join(OUT, 'DEVELOPMENT_MODEL_SELECTION_REPORT.md'), report, 'utf8');
await writeFile(path.join(OUT, `preregistration.${CROSS_MODEL_SLUG}.json`), `${JSON.stringify(preregistration, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, `raw_retrieval_results.${CROSS_MODEL_SLUG}.jsonl`), raw.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
await writeFile(path.join(OUT, `development_metrics.${CROSS_MODEL_SLUG}.json`), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, `DEVELOPMENT_MODEL_SELECTION_REPORT.${CROSS_MODEL_SLUG}.md`), report, 'utf8');
const artifactFiles = [modelRegistryFile, 'preregistration.json', 'oracle_development_relation_edges.jsonl', 'raw_retrieval_results.jsonl', 'development_metrics.json', 'DEVELOPMENT_MODEL_SELECTION_REPORT.md'];
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), (await Promise.all(artifactFiles.map(async (file) => `${sha256(await readFile(path.join(OUT, file)))}  ${file}`))).join('\n') + '\n', 'utf8');
const modelSpecificFiles = [modelRegistryFile, `preregistration.${CROSS_MODEL_SLUG}.json`, `raw_retrieval_results.${CROSS_MODEL_SLUG}.jsonl`, `development_metrics.${CROSS_MODEL_SLUG}.json`, `DEVELOPMENT_MODEL_SELECTION_REPORT.${CROSS_MODEL_SLUG}.md`];
await writeFile(path.join(OUT, `ARTIFACT_CHECKSUMS.${CROSS_MODEL_SLUG}.sha256`), (await Promise.all(modelSpecificFiles.map(async (file) => `${sha256(await readFile(path.join(OUT, file)))}  ${file}`))).join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ status: 'development_run_complete', selected_candidate: selectedCandidate, eligible_modes: targetEligible, gate, metrics }, null, 2));
