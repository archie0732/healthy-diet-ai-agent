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
const CONFIG_DIR = path.join(EXP, 'data/configs/v4_fresh_test_frozen');
const TEST_DIR = path.join(EXP, 'data/annotations_v4/fresh_test_user_approved');
const OUT = path.join(EXP, 'results/v4/fresh_test_retrieval');
const CALLS = path.join(OUT, 'model_calls');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const round = (value: number) => Number(value.toFixed(6));
type Edge = { edge_id: string; relation_type: string; current_chunk_id: string; retained_chunk_id: string };
type Score = { chunk_id: string; base_bm25: number; base_norm: number; propagated_base_norm: number; relation_active: boolean; expansion_candidate: boolean; policy_score: number; cross_encoder_score?: number; final_score: number };
function normalize(values: number[]) { const min = Math.min(...values), max = Math.max(...values); return max <= min ? values.map(() => 0) : values.map((value) => (value - min) / (max - min)); }
function select(scores: Score[], edges: Edge[], topK: number) {
  const sorted = [...scores].sort((a, b) => b.final_score - a.final_score || a.chunk_id.localeCompare(b.chunk_id)); if (!sorted.length) return [];
  const chosen = [sorted[0]], ids = new Set([sorted[0].chunk_id]), counterparts = new Set<string>();
  for (const edge of edges) { if (edge.current_chunk_id === sorted[0].chunk_id) counterparts.add(edge.retained_chunk_id); if (edge.retained_chunk_id === sorted[0].chunk_id) counterparts.add(edge.current_chunk_id); }
  const paired = sorted.find((item) => counterparts.has(item.chunk_id) && !ids.has(item.chunk_id)); if (paired && chosen.length < topK) { chosen.push(paired); ids.add(paired.chunk_id); }
  for (const item of sorted) if (chosen.length < topK && !ids.has(item.chunk_id)) { chosen.push(item); ids.add(item.chunk_id); }
  return chosen;
}
function policyScores(base: SearchResult[], candidateIds: string[], edges: Edge[], boost: number, propagation: number): Score[] {
  const norms = normalize(base.map((item) => item.baseScore)), normById = new Map(base.map((item, index) => [item.chunkId, norms[index]])), baseById = new Map(base.map((item) => [item.chunkId, item])), edgeById = new Map<string, Edge[]>();
  for (const edge of edges) for (const id of [edge.current_chunk_id, edge.retained_chunk_id]) edgeById.set(id, [...(edgeById.get(id) || []), edge]);
  const raw = candidateIds.map((id) => { const related = edgeById.get(id) || []; const other = related.flatMap((edge) => [edge.current_chunk_id, edge.retained_chunk_id]).filter((x) => x !== id).map((x) => normById.get(x) || 0); const propagated = other.length ? Math.max(...other) * propagation : 0; return { chunk_id: id, base_bm25: baseById.get(id)?.baseScore || 0, base_norm: round(normById.get(id) || 0), propagated_base_norm: round(propagated), relation_active: related.length > 0, expansion_candidate: !baseById.has(id), policy_score: Math.max(normById.get(id) || 0, propagated) + (related.length ? boost : 0), final_score: 0 }; });
  const policyNorm = normalize(raw.map((item) => item.policy_score)); return raw.map((item, index) => ({ ...item, policy_score: round(policyNorm[index]), final_score: round(policyNorm[index]) }));
}
function metric(rows: any[], records: Map<string, any>, topK: number) {
  let required = 0, hits = 0, current = 0, currentHits = 0, retained = 0, retainedHits = 0, deprecated = 0, forbidden = 0;
  for (const row of rows) { const record = records.get(row.query_id); const retrieved = row.retrieved_chunk_ids; const judgment = record.judgment; required += judgment.required_chunk_ids.length; hits += judgment.required_chunk_ids.filter((id: string) => retrieved.includes(id)).length; current += record.required_current_chunk_ids.length; currentHits += record.required_current_chunk_ids.filter((id: string) => retrieved.includes(id)).length; retained += record.required_retained_chunk_ids.length; retainedHits += record.required_retained_chunk_ids.filter((id: string) => retrieved.includes(id)).length; deprecated += retrieved.filter((id: string) => judgment.deprecated_chunk_ids.includes(id)).length; forbidden += retrieved.filter((id: string) => judgment.forbidden_chunk_ids.includes(id)).length; }
  const denom = rows.length * topK; return { query_count: rows.length, required_micro_recall_at_3: required ? round(hits / required) : 0, current_required_micro_recall_at_3: current ? round(currentHits / current) : 0, retained_required_micro_recall_at_3: retained ? round(retainedHits / retained) : 0, deprecated_hit_rate_at_3: denom ? round(deprecated / denom) : 0, forbidden_hit_rate_at_3: denom ? round(forbidden / denom) : 0 };
}

const packagePath = path.join(CONFIG_DIR, 'FROZEN_FRESH_TEST_PACKAGE.json'), guardPath = path.join(CONFIG_DIR, 'FRESH_TEST_GUARD.json'), finalManifestPath = path.join(TEST_DIR, 'fresh_test_manifest.json'), testPath = path.join(TEST_DIR, 'fresh_test.sealed.jsonl'), corpusPath = path.join(EXP, 'data/corpus_v4_fresh_frozen/chunks.jsonl');
const [packageText, guardText, finalManifestText, testText, corpusText] = await Promise.all([readFile(packagePath, 'utf8'), readFile(guardPath, 'utf8'), readFile(finalManifestPath, 'utf8'), readFile(testPath, 'utf8'), readFile(corpusPath, 'utf8')]);
const frozen = JSON.parse(packageText), guard = JSON.parse(guardText), finalManifest = JSON.parse(finalManifestText);
if (sha256(packageText) !== guard.frozen_package_sha256 || sha256(finalManifestText) !== guard.final_test_manifest_sha256 || sha256(testText) !== finalManifest.sealed_test_sha256 || sha256(corpusText) !== finalManifest.source_corpus_sha256) throw new Error('Frozen fresh-test checksum guard failed.');
if (!['fresh_test_final_sealed_retrieval_unlocked', 'fresh_test_retrieval_in_progress'].includes(guard.status) || guard.test_retrieval_execution_count_completed !== 0 || frozen.retrieval.systems.join(',') !== 'recency,oracle_cross_0.5') throw new Error('Fresh-test execution is not allowed.');
const records = parseJsonl(testText), chunks = parseJsonl(corpusText) as CorpusChunk[]; if (records.length !== 40 || chunks.length !== 160) throw new Error('Unexpected test or corpus size.');
const recordById = new Map(records.map((row) => [row.query_id, row])), chunkById = new Map(chunks.map((row) => [row.chunk_id, row]));
const edges: Edge[] = records.map((row) => ({ edge_id: `${row.query_id}-oracle-edge`, relation_type: row.oracle_relation.relation_type, current_chunk_id: row.oracle_relation.current_chunk_id, retained_chunk_id: row.oracle_relation.retained_chunk_id }));
const bm25 = new BM25Retriever(chunks), client = new GeminiRerankClient({ crossEncoderModel: frozen.reranker.model_id });
await mkdir(CALLS, { recursive: true });
const started = { ...guard, status: 'fresh_test_retrieval_in_progress', test_retrieval_started_at: guard.test_retrieval_started_at || new Date().toISOString(), test_retrieval_execution_count_completed: 0, tuning_allowed: false };
await writeFile(guardPath, `${JSON.stringify(started, null, 2)}\n`, 'utf8');
const raw: any[] = [];
for (const [index, record] of records.entries()) {
  const context: RetrievalContext = { queryId: record.query_id, question: record.query_text, targetPopulation: record.target_population || [], conditions: record.conditions || [] };
  const base = await bm25.retrieve(context, frozen.retrieval.candidate_budget), baseIds = base.map((item) => item.chunkId), baseSet = new Set(baseIds);
  const activeEdges = edges.filter((edge) => baseSet.has(edge.current_chunk_id) || baseSet.has(edge.retained_chunk_id));
  const candidateIds = [...baseIds]; for (const edge of activeEdges) for (const id of [edge.current_chunk_id, edge.retained_chunk_id]) if (!candidateIds.includes(id)) candidateIds.push(id);
  const policy = policyScores(base, candidateIds, activeEdges, frozen.retrieval.relation_boost, frozen.retrieval.propagation_factor);
  const recency = new RecencyBoostRetriever(new FixedCandidatePoolRetriever(base), chunks, frozen.retrieval.recency_lambda), recencyTop = await recency.retrieve(context, frozen.retrieval.top_k);
  raw.push({ query_id: record.query_id, stratum: record.stratum, system: 'recency', shared_base_candidate_hash: sha256(baseIds.join('\n')), shared_base_candidate_ids: baseIds, oracle_candidate_hash: null, oracle_candidate_ids: null, retrieved_chunk_ids: recencyTop.map((item) => item.chunkId), scores: recencyTop });
  const callPath = path.join(CALLS, `${record.query_id}.gemma-4-31b-it.cross_encoder.json`); let cached: any = null; try { cached = JSON.parse(await readFile(callPath, 'utf8')); } catch {}
  let cross: Map<string, number>;
  if (cached?.sealed_test_sha256 === finalManifest.sealed_test_sha256 && cached?.candidate_hash === sha256(candidateIds.join('\n')) && Object.keys(cached.scores || {}).length === candidateIds.length) cross = new Map(Object.entries(cached.scores).map(([id, value]) => [id, Number(value)]));
  else { const passages: PassageForRerank[] = candidateIds.map((id) => { const chunk = chunkById.get(id)!; return { chunkId: id, documentId: chunk.document_id, publishedAt: chunk.published_at, text: chunk.text }; }); const response = await client.crossEncode(record.query_text, passages); cross = response.scores; await writeFile(callPath, `${JSON.stringify({ query_id: record.query_id, model_id: client.crossEncoderModel, sealed_test_sha256: finalManifest.sealed_test_sha256, candidate_hash: sha256(candidateIds.join('\n')), prompt: response.prompt, prompt_sha256: sha256(response.prompt), scores: Object.fromEntries(response.scores), trace: response.trace }, null, 2)}\n`, 'utf8'); }
  const scored = policy.map((item) => ({ ...item, cross_encoder_score: round(cross.get(item.chunk_id)!), final_score: round((1 - frozen.retrieval.semantic_alpha) * item.policy_score + frozen.retrieval.semantic_alpha * cross.get(item.chunk_id)!) }));
  const top = select(scored, activeEdges, frozen.retrieval.top_k); raw.push({ query_id: record.query_id, stratum: record.stratum, system: 'oracle_cross_0.5', alpha: frozen.retrieval.semantic_alpha, shared_base_candidate_hash: sha256(baseIds.join('\n')), shared_base_candidate_ids: baseIds, oracle_candidate_hash: sha256(candidateIds.join('\n')), oracle_candidate_ids: candidateIds, retrieved_chunk_ids: top.map((item) => item.chunk_id), scores: scored });
  console.log(`completed ${index + 1}/40 ${record.query_id}`);
}
const metrics: any = {}; for (const system of frozen.retrieval.systems) { const rows = raw.filter((row) => row.system === system); metrics[system] = { all: metric(rows, recordById, 3) }; for (const stratum of frozen.test_construction.strata) metrics[system][stratum] = metric(rows.filter((row) => row.stratum === stratum), recordById, 3); }
const rec = metrics.recency, oracle = metrics['oracle_cross_0.5'];
const gate = { conditional_merge_noninferiority: oracle.conditional_merge.required_micro_recall_at_3 >= rec.conditional_merge.required_micro_recall_at_3, compatible_history_noninferiority: oracle.compatible_history.required_micro_recall_at_3 >= rec.compatible_history.required_micro_recall_at_3, retained_history_strict_improvement: oracle.all.retained_required_micro_recall_at_3 > rec.all.retained_required_micro_recall_at_3, current_only_deprecated_nonincrease: oracle.current_only.deprecated_hit_rate_at_3 <= rec.current_only.deprecated_hit_rate_at_3, hard_negative_forbidden_nonincrease: oracle.hard_negative.forbidden_hit_rate_at_3 <= rec.hard_negative.forbidden_hit_rate_at_3 };
const result = { status: 'fresh_test_retrieval_complete', execution_count: 1, tuning_after_test: false, sealed_test_sha256: finalManifest.sealed_test_sha256, frozen_package_sha256: guard.frozen_package_sha256, source_corpus_sha256: finalManifest.source_corpus_sha256, metrics, gate, full_fresh_retrieval_gate_passed: Object.values(gate).every(Boolean), claim_boundary: frozen.claim_boundary };
await writeFile(path.join(OUT, 'raw_retrieval_results.jsonl'), raw.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8'); await writeFile(path.join(OUT, 'FRESH_TEST_RETRIEVAL_RESULT.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8'); await writeFile(path.join(OUT, 'oracle_relation_edges.jsonl'), edges.map((edge) => JSON.stringify(edge)).join('\n') + '\n', 'utf8');
const report = `# V4 Fresh Held-Out Retrieval Result\n\nThe frozen test executed once with no tuning.\n\n| Endpoint | Recency | Version-Aware Oracle |\n|---|---:|---:|\n| Conditional merge required micro Recall@3 | ${rec.conditional_merge.required_micro_recall_at_3} | ${oracle.conditional_merge.required_micro_recall_at_3} |\n| Compatible history required micro Recall@3 | ${rec.compatible_history.required_micro_recall_at_3} | ${oracle.compatible_history.required_micro_recall_at_3} |\n| Retained required micro Recall@3 | ${rec.all.retained_required_micro_recall_at_3} | ${oracle.all.retained_required_micro_recall_at_3} |\n| Current-only deprecated hit rate@3 | ${rec.current_only.deprecated_hit_rate_at_3} | ${oracle.current_only.deprecated_hit_rate_at_3} |\n| Hard-negative forbidden hit rate@3 | ${rec.hard_negative.forbidden_hit_rate_at_3} | ${oracle.hard_negative.forbidden_hit_rate_at_3} |\n\nFull preregistered retrieval gate: **${result.full_fresh_retrieval_gate_passed ? 'PASS' : 'FAIL'}**.\n\n${frozen.claim_boundary}\n`;
await writeFile(path.join(OUT, 'FRESH_TEST_RETRIEVAL_RESULT.md'), report, 'utf8');
const files = ['raw_retrieval_results.jsonl','FRESH_TEST_RETRIEVAL_RESULT.json','FRESH_TEST_RETRIEVAL_RESULT.md','oracle_relation_edges.jsonl']; await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), (await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(OUT, file)))}  ${file}`))).join('\n') + '\n', 'utf8');
await writeFile(guardPath, `${JSON.stringify({ ...started, status: 'fresh_test_retrieval_completed_rerun_locked', test_retrieval_execution_count_completed: 1, test_retrieval_completed_at: new Date().toISOString(), fresh_retrieval_result_sha256: sha256(await readFile(path.join(OUT, 'FRESH_TEST_RETRIEVAL_RESULT.json'))), tuning_allowed: false }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
