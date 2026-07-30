import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_21_lexical_weighted_rrf");
const OUT = path.join(EXP, "results/v5/r2_21_lexical_weighted_rrf");
const MODEL_ROOT = path.join(EXP, "data/models/v5_r2_19_minilm");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
type Item = {
  runtime_item_id: string;
  text: string;
  publication_year: number;
  candidate_group_ids: string[];
};
const STOP = new Set(
  "what which when where why how should does apply applied and the for with from into about while that this are was were have has can may who whose without within current guidance recommendation evidence intake activity adults children population health".split(" "),
);
const words = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
const unique = <T>(values: T[]) => [...new Set(values)];
function bm25(query: string, corpus: Item[], k1: number, b: number) {
  const docs = corpus.map((item) => words(item.text));
  const lengths = docs.map((doc) => doc.length);
  const average = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  return corpus.map((item, index) => {
    const tf = new Map<string, number>();
    for (const term of docs[index]) tf.set(term, (tf.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of words(query)) {
      const count = tf.get(term) ?? 0;
      if (!count) continue;
      const frequency = df.get(term) ?? 0;
      const idf = Math.log((corpus.length - frequency + 0.5) / (frequency + 0.5) + 1);
      score += idf * ((count * (k1 + 1)) /
        (count + k1 * (1 - b + (b * lengths[index]) / average)));
    }
    return { item, score };
  }).sort((a, b) => b.score - a.score ||
    a.item.runtime_item_id.localeCompare(b.item.runtime_item_id));
}
const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + value * b[index], 0);
function weightedRrf(lexical: Item[], dense: Item[], k: number, lexicalWeight: number) {
  const scores = new Map<string, number>();
  lexical.forEach((item, index) => scores.set(
    item.runtime_item_id,
    (scores.get(item.runtime_item_id) ?? 0) + lexicalWeight / (k + index + 1),
  ));
  dense.forEach((item, index) => scores.set(
    item.runtime_item_id,
    (scores.get(item.runtime_item_id) ?? 0) + 1 / (k + index + 1),
  ));
  return {
    scores,
    ranked: [...lexical].sort((a, b) =>
      (scores.get(b.runtime_item_id) ?? 0) - (scores.get(a.runtime_item_id) ?? 0) ||
      a.runtime_item_id.localeCompare(b.runtime_item_id)),
  };
}
function coverage(queryTerms: string[], texts: string[]) {
  const terms = new Set(texts.flatMap(words));
  return queryTerms.length
    ? queryTerms.filter((term) => terms.has(term)).length / queryTerms.length
    : 0;
}
function rerank(query: string, pool: Item[], scoreById: Map<string, number>) {
  const values = pool.map((item) => scoreById.get(item.runtime_item_id) ?? 0);
  const min = Math.min(...values), max = Math.max(...values);
  const normalized = pool.map((item) => ({
    item,
    base: max > min ? ((scoreById.get(item.runtime_item_id) ?? 0) - min) / (max - min) : 0,
    recency: (item.publication_year - 2003) / (2026 - 2003),
  }));
  const byGroup = new Map<string, Item[]>();
  for (const item of pool) for (const group of item.candidate_group_ids) {
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }
  const anchorIds = new Set([...normalized]
    .sort((a, b) => b.base - a.base ||
      a.item.runtime_item_id.localeCompare(b.item.runtime_item_id))
    .slice(0, 6).map((entry) => entry.item.runtime_item_id));
  const queryTerms = unique(words(query));
  const clauseFactor = 1 + Math.min(3,
    (query.match(/\band\b|,|;|\bwhile\b|\bwhich\b/gi) ?? []).length) * 0.2;
  return normalized.map((entry) => {
    let pairSignal = 0;
    for (const group of entry.item.candidate_group_ids) {
      const members = byGroup.get(group) ?? [];
      if (members.length < 2 ||
        !members.some((member) => anchorIds.has(member.runtime_item_id))) continue;
      const joint = coverage(queryTerms, members.map((item) => item.text));
      const strongest = Math.max(...members.map((item) => coverage(queryTerms, [item.text])));
      pairSignal = Math.max(pairSignal, Math.max(0, joint - strongest) * clauseFactor);
    }
    return {
      runtime_item_id: entry.item.runtime_item_id,
      score: entry.base + 0.2 * entry.recency + 2.0 * pairSignal,
      base_norm: entry.base,
      recency_norm: entry.recency,
      pair_signal: pairSignal,
    };
  }).sort((a, b) => b.score - a.score ||
    a.runtime_item_id.localeCompare(b.runtime_item_id));
}

const [manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
]);
const manifest = JSON.parse(manifestText), guard = JSON.parse(guardText);
if (guard.status !== "diagnostic_frozen_unlocked" || guard.execution_count !== 0 ||
  sha256(manifestText) !== guard.manifest_sha256) throw new Error("R2.21 guard failed.");
for (const input of Object.values(manifest.inputs) as any[]) {
  if (sha256(await readFile(path.join(EXP, input.path))) !== input.sha256) {
    throw new Error(`Frozen input mismatch: ${input.path}`);
  }
}
const model = JSON.parse(await readFile(path.join(EXP, manifest.inputs.model_manifest.path), "utf8"));
for (const artifact of model.cache_artifacts) {
  if (sha256(await readFile(path.join(MODEL_ROOT, artifact.path))) !== artifact.sha256) {
    throw new Error(`Model cache mismatch: ${artifact.path}`);
  }
}
const queries = parseJsonl(await readFile(path.join(EXP, manifest.inputs.queries.path), "utf8"));
const corpus = parseJsonl(await readFile(path.join(EXP, manifest.inputs.corpus.path), "utf8")) as Item[];
env.cacheDir = path.join(EXP, manifest.model.cache_root);
env.allowRemoteModels = false; env.allowLocalModels = true;
env.useFSCache = true; env.useBrowserCache = false;
const extractor = await pipeline(
  "feature-extraction",
  path.join(EXP, manifest.model.local_model_directory),
  { dtype: "q8", device: "cpu", local_files_only: true },
);
const documentVectors = (await extractor(corpus.map((item) => item.text),
  { pooling: "mean", normalize: true })).tolist() as number[][];
const queryVectors = (await extractor(queries.map((query) => query.text),
  { pooling: "mean", normalize: true })).tolist() as number[][];
await extractor.dispose();
const vectors = [...documentVectors, ...queryVectors];
const norms = vectors.map((vector) =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)));
const embeddingIntegrity = {
  schema_version: "v5-r2.21-embedding-integrity-1",
  document_embedding_count: documentVectors.length,
  query_embedding_count: queryVectors.length,
  dimensions: [...new Set(vectors.map((vector) => vector.length))],
  all_finite: vectors.every((vector) => vector.every(Number.isFinite)),
  all_l2_normalized: norms.every((norm) => Math.abs(norm - 1) <= 1e-5),
  all_embeddings_completed_before_judgment_read: true,
};
if (documentVectors.length !== 148 || queryVectors.length !== 32 ||
  embeddingIntegrity.dimensions[0] !== 384 || !embeddingIntegrity.all_finite ||
  !embeddingIntegrity.all_l2_normalized) throw new Error("R2.21 embedding integrity failed.");

const itemById = new Map(corpus.map((item) => [item.runtime_item_id, item]));
const rows: any[] = [];
for (const [queryIndex, query] of queries.entries()) {
  const lexical = bm25(query.text, corpus, 1.2, 0.75).map((entry) => entry.item);
  const dense = corpus.map((item, index) => ({
    item, score: cosine(queryVectors[queryIndex], documentVectors[index]),
  })).sort((a, b) => b.score - a.score ||
    a.item.runtime_item_id.localeCompare(b.item.runtime_item_id)).map((x) => x.item);
  for (const [variantIndex, variant] of manifest.variants.entries()) {
    const fusion = weightedRrf(lexical, dense, 60, manifest.parameters.lexical_weights[variantIndex]);
    const poolIds = fusion.ranked.slice(0, 20).map((item) => item.runtime_item_id);
    const top3 = rerank(query.text, poolIds.map((id) => itemById.get(id)!), fusion.scores)
      .slice(0, 3).map((entry) => entry.runtime_item_id);
    rows.push({
      runtime_query_key: query.runtime_query_key,
      variant,
      ordered_top20_ids: poolIds,
      ordered_top20_sha256: sha256(poolIds.join("\n")),
      top3,
    });
  }
}
if (rows.length !== 96 || rows.some((row) =>
  row.ordered_top20_ids.length !== 20 ||
  new Set(row.ordered_top20_ids).size !== 20 || row.top3.length !== 3)) {
  throw new Error("Judgments blocked until all R2.21 outputs pass integrity.");
}
const r220Rows = parseJsonl(await readFile(path.join(EXP, manifest.inputs.r220_raw.path), "utf8"));
const r220Repaired = new Map(r220Rows
  .filter((row) => row.variant === "bm25_minilm_rrf_k60_pair_score_g2.0_top6_anchor")
  .map((row) => [row.runtime_query_key, row]));
const controlReproduced = rows
  .filter((row) => row.variant === manifest.variants[0])
  .every((row) => {
    const prior: any = r220Repaired.get(row.runtime_query_key);
    return prior?.ordered_top20_sha256 === row.ordered_top20_sha256 &&
      JSON.stringify(prior.top3) === JSON.stringify(row.top3);
  });
if (!controlReproduced) throw new Error("R2.21 control did not reproduce R2.20.");

const judgments = new Map(parseJsonl(
  await readFile(path.join(EXP, manifest.inputs.judgments.path), "utf8"),
).map((row) => [row.runtime_query_key, row]));
const evaluated = rows.map((row) => {
  const judgment: any = judgments.get(row.runtime_query_key);
  const required = new Set<string>(judgment.required_item_ids);
  const unsafe = new Set<string>(judgment.unsafe_item_ids);
  const hits20 = row.ordered_top20_ids.filter((id: string) => required.has(id)).length;
  const hits3 = row.top3.filter((id: string) => required.has(id)).length;
  return {
    ...row, query_id: judgment.query_id, stratum: judgment.stratum,
    required_count: required.size, required_hits_at_20: hits20,
    required_hits_at_3: hits3,
    both_evidence_coverage: required.size === 2 ? Number(hits3 === 2) : null,
    unsafe_top3_hit: Number(row.top3.some((id: string) => unsafe.has(id))),
  };
});
const strata = ["conditional_merge", "compatible_history", "current_only", "hard_negative_current"];
const summaries = manifest.variants.map((variant: string) => {
  const selected = evaluated.filter((row) => row.variant === variant);
  const strataSummary = Object.fromEntries(strata.map((stratum) => {
    const subset = selected.filter((row) => row.stratum === stratum);
    const hits = subset.reduce((sum, row) => sum + row.required_hits_at_3, 0);
    const count = subset.reduce((sum, row) => sum + row.required_count, 0);
    const both = subset.filter((row) => row.both_evidence_coverage !== null);
    return [stratum, {
      required_micro_recall_at_3: hits / count,
      both_evidence_coverage: both.length
        ? both.reduce((sum, row) => sum + row.both_evidence_coverage, 0) / both.length
        : null,
      unsafe_top3_hit_rate:
        subset.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) / subset.length,
    }];
  }));
  return {
    variant,
    required_micro_recall_at_20:
      selected.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
      selected.reduce((sum, row) => sum + row.required_count, 0),
    strata: strataSummary,
    overall_unsafe_top3_hit_rate:
      selected.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) / selected.length,
    combined_implicit_both_evidence_coverage:
      (strataSummary.conditional_merge.both_evidence_coverage +
       strataSummary.compatible_history.both_evidence_coverage) / 2,
  };
});
const eligible = summaries.filter((summary: any) =>
  summary.required_micro_recall_at_20 >= 0.9 &&
  summary.strata.current_only.required_micro_recall_at_3 >= 1 &&
  summary.strata.hard_negative_current.required_micro_recall_at_3 >= 0.5 &&
  summary.overall_unsafe_top3_hit_rate <= 0.03125 &&
  summary.strata.conditional_merge.required_micro_recall_at_3 > 0.65 &&
  summary.strata.compatible_history.required_micro_recall_at_3 > 0.4 &&
  summary.combined_implicit_both_evidence_coverage > 0.25);
const selected = [...eligible].sort((a: any, b: any) =>
  b.strata.current_only.required_micro_recall_at_3 -
    a.strata.current_only.required_micro_recall_at_3 ||
  b.required_micro_recall_at_20 - a.required_micro_recall_at_20 ||
  b.combined_implicit_both_evidence_coverage -
    a.combined_implicit_both_evidence_coverage ||
  Math.min(b.strata.conditional_merge.required_micro_recall_at_3,
    b.strata.compatible_history.required_micro_recall_at_3) -
  Math.min(a.strata.conditional_merge.required_micro_recall_at_3,
    a.strata.compatible_history.required_micro_recall_at_3) ||
  manifest.variants.indexOf(a.variant) - manifest.variants.indexOf(b.variant))[0] ?? null;
const result = {
  schema_version: "v5-r2.21-lexical-weighted-rrf-result-1",
  status: selected ? "diagnostic_complete_repair_selected" : "diagnostic_complete_no_eligible_repair",
  outcome_exposed_r2_20_data: true,
  r2_20_rerun_performed: false,
  control_reproduced_exactly: controlReproduced,
  all_embeddings_pools_and_top3_completed_before_judgment_read: true,
  judgment_read_count: 1,
  summaries,
  eligible_variants: eligible.map((summary: any) => summary.variant),
  selected_diagnostic_variant: selected?.variant ?? null,
  new_lineage_disjoint_confirmation_required: selected !== null,
  promotion_evidence: false,
};
const rawText = `${evaluated.map((row) => JSON.stringify(row)).join("\n")}\n`;
const embeddingText = `${JSON.stringify(embeddingIntegrity, null, 2)}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "raw_results.jsonl"), rawText),
  writeFile(path.join(OUT, "EMBEDDING_INTEGRITY.json"), embeddingText),
  writeFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), resultText),
]);
await writeFile(path.join(CONFIG, "EXECUTION_GUARD.json"), `${JSON.stringify({
  ...guard, status: "diagnostic_complete_locked", execution_count: 1,
  raw_results_sha256: sha256(rawText),
  embedding_integrity_sha256: sha256(embeddingText),
  diagnostic_result_sha256: sha256(resultText),
  selected_diagnostic_variant: selected?.variant ?? null,
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
