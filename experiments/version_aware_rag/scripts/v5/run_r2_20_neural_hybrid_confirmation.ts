import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { generateR212CandidatePool } from "../../src/retrieval/r2_12_candidate_generator";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_20_frozen_confirmation");
const OUT = path.join(EXP, "results/v5/r2_20_confirmation");
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
type Query = { runtime_query_key: string; text: string };
const STOP = new Set(
  "what which when where why how should does apply applied and the for with from into about while that this are was were have has can may who whose without within current guidance recommendation evidence intake activity adults children population health".split(
    " ",
  ),
);
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
const unique = <T>(values: T[]) => [...new Set(values)];

function bm25(query: string, corpus: Item[], k1: number, b: number) {
  const docs = corpus.map((item) => words(item.text));
  const lengths = docs.map((doc) => doc.length);
  const average =
    lengths.reduce((sum, length) => sum + length, 0) /
    Math.max(1, lengths.length);
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return corpus
    .map((item, index) => {
      const tf = new Map<string, number>();
      for (const term of docs[index]) {
        tf.set(term, (tf.get(term) ?? 0) + 1);
      }
      let score = 0;
      for (const term of words(query)) {
        const count = tf.get(term) ?? 0;
        if (!count) continue;
        const frequency = df.get(term) ?? 0;
        const idf = Math.log(
          (corpus.length - frequency + 0.5) / (frequency + 0.5) + 1,
        );
        score +=
          idf *
          ((count * (k1 + 1)) /
            (count + k1 * (1 - b + (b * lengths[index]) / average)));
      }
      return { item, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.runtime_item_id.localeCompare(right.item.runtime_item_id),
    );
}
const cosine = (left: number[], right: number[]) =>
  left.reduce((sum, value, index) => sum + value * right[index], 0);
function rrf(rankings: Item[][], k: number) {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((item, index) =>
      scores.set(
        item.runtime_item_id,
        (scores.get(item.runtime_item_id) ?? 0) + 1 / (k + index + 1),
      ),
    );
  }
  const ranked = [...rankings[0]].sort(
    (left, right) =>
      (scores.get(right.runtime_item_id) ?? 0) -
        (scores.get(left.runtime_item_id) ?? 0) ||
      left.runtime_item_id.localeCompare(right.runtime_item_id),
  );
  return { ranked, scores };
}
function coverage(queryTerms: string[], texts: string[]) {
  const terms = new Set(texts.flatMap(words));
  return queryTerms.length === 0
    ? 0
    : queryTerms.filter((term) => terms.has(term)).length / queryTerms.length;
}
function rerank(
  query: string,
  pool: Item[],
  scoreById: Map<string, number>,
  recencyWeight: number,
  pairWeight: number,
  anchorRank: number | null,
) {
  const values = pool.map((item) => scoreById.get(item.runtime_item_id) ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const normalized = pool.map((item) => ({
    item,
    base:
      max > min
        ? ((scoreById.get(item.runtime_item_id) ?? 0) - min) / (max - min)
        : 0,
    recency: (item.publication_year - 2003) / (2026 - 2003),
  }));
  const byGroup = new Map<string, Item[]>();
  for (const item of pool) {
    for (const group of item.candidate_group_ids) {
      byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
    }
  }
  const anchorIds =
    anchorRank === null
      ? null
      : new Set(
          [...normalized]
            .sort(
              (left, right) =>
                right.base - left.base ||
                left.item.runtime_item_id.localeCompare(
                  right.item.runtime_item_id,
                ),
            )
            .slice(0, anchorRank)
            .map((entry) => entry.item.runtime_item_id),
        );
  const queryTerms = unique(words(query));
  const clauseFactor =
    1 +
    Math.min(
      3,
      (query.match(/\band\b|,|;|\bwhile\b|\bwhich\b/gi) ?? []).length,
    ) *
      0.2;
  return normalized
    .map((entry) => {
      let pairSignal = 0;
      for (const group of entry.item.candidate_group_ids) {
        const members = byGroup.get(group) ?? [];
        if (members.length < 2) continue;
        if (
          anchorIds &&
          !members.some((member) => anchorIds.has(member.runtime_item_id))
        ) {
          continue;
        }
        const joint = coverage(
          queryTerms,
          members.map((item) => item.text),
        );
        const strongest = Math.max(
          ...members.map((item) => coverage(queryTerms, [item.text])),
        );
        pairSignal = Math.max(
          pairSignal,
          Math.max(0, joint - strongest) * clauseFactor,
        );
      }
      return {
        runtime_item_id: entry.item.runtime_item_id,
        score:
          entry.base +
          recencyWeight * entry.recency +
          pairWeight * pairSignal,
        base_norm: entry.base,
        recency_norm: entry.recency,
        pair_signal: pairSignal,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.runtime_item_id.localeCompare(right.runtime_item_id),
    );
}

const [queriesText, corpusText, manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, "runtime_queries.role_neutral.jsonl"), "utf8"),
  readFile(path.join(CONFIG, "candidate_corpus.role_neutral.jsonl"), "utf8"),
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
if (
  guard.status !== "confirmation_frozen_unlocked" ||
  guard.retrieval_execution_count !== 0 ||
  sha256(manifestText) !== guard.manifest_sha256 ||
  sha256(queriesText) !== manifest.runtime_queries_sha256 ||
  sha256(corpusText) !== manifest.candidate_corpus_sha256
) {
  throw new Error("R2.20 confirmation guard failed.");
}
if (
  sha256(await readFile(path.join(process.cwd(), "bun.lock"))) !==
  manifest.bun_lock_sha256
) {
  throw new Error("bun.lock changed after R2.20 freeze.");
}
const modelManifest = JSON.parse(
  await readFile(
    path.join(EXP, "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json"),
    "utf8",
  ),
);
if (
  sha256(
    await readFile(
      path.join(EXP, "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json"),
    ),
  ) !== manifest.model_manifest_sha256
) {
  throw new Error("Model manifest changed after R2.20 freeze.");
}
for (const artifact of modelManifest.cache_artifacts) {
  const absolute = path.join(MODEL_ROOT, artifact.path);
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Model cache mismatch: ${artifact.path}`);
  }
}
for (const artifact of modelManifest.native_runtime) {
  const absolute = path.join(process.cwd(), artifact.path);
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Native runtime mismatch: ${artifact.path}`);
  }
}
const queries = parseJsonl(queriesText) as Query[];
const corpus = parseJsonl(corpusText) as Item[];

env.cacheDir = path.join(EXP, manifest.model.cache_root);
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = true;
env.useBrowserCache = false;
const extractor = await pipeline(
  "feature-extraction",
  path.join(EXP, manifest.model.local_model_directory),
  {
    dtype: manifest.model.dtype,
    device: "cpu",
    local_files_only: true,
  },
);
const documentOutput = await extractor(
  corpus.map((item) => item.text),
  { pooling: "mean", normalize: true },
);
const queryOutput = await extractor(
  queries.map((query) => query.text),
  { pooling: "mean", normalize: true },
);
const documentVectors = documentOutput.tolist() as number[][];
const queryVectors = queryOutput.tolist() as number[][];
await extractor.dispose();
const vectors = [...documentVectors, ...queryVectors];
const norms = vectors.map((vector) =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)),
);
const embeddingIntegrity = {
  schema_version: "v5-r2.20-embedding-integrity-1",
  all_embeddings_completed_before_judgment_read: true,
  document_embedding_count: documentVectors.length,
  query_embedding_count: queryVectors.length,
  dimensions: [...new Set(vectors.map((vector) => vector.length))],
  all_finite: vectors.every((vector) =>
    vector.every((value) => Number.isFinite(value)),
  ),
  minimum_norm: Math.min(...norms),
  maximum_norm: Math.max(...norms),
  all_l2_normalized: norms.every((norm) => Math.abs(norm - 1) <= 1e-5),
  document_vectors_sha256: sha256(JSON.stringify(documentVectors)),
  query_vectors_sha256: sha256(JSON.stringify(queryVectors)),
};
if (
  documentVectors.length !== corpus.length ||
  queryVectors.length !== queries.length ||
  embeddingIntegrity.dimensions.length !== 1 ||
  embeddingIntegrity.dimensions[0] !== 384 ||
  !embeddingIntegrity.all_finite ||
  !embeddingIntegrity.all_l2_normalized
) {
  throw new Error("R2.20 embedding integrity failed.");
}

const itemById = new Map(
  corpus.map((item) => [item.runtime_item_id, item]),
);
const variants = [
  "bm25_seed12_pair_score_g0.5",
  "bm25_minilm_rrf_k60_pair_score_g2.0_top6_anchor",
] as const;
const raw: any[] = [];
for (const [queryIndex, query] of queries.entries()) {
  const lexical = bm25(
    query.text,
    corpus,
    manifest.parameters.bm25_k1,
    manifest.parameters.bm25_b,
  );
  const lexicalScores = new Map(
    lexical.map((entry) => [entry.item.runtime_item_id, entry.score]),
  );
  const dense = corpus
    .map((item, index) => ({
      item,
      score: cosine(queryVectors[queryIndex], documentVectors[index]),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.runtime_item_id.localeCompare(right.item.runtime_item_id),
    )
    .map((entry) => entry.item);
  const fused = rrf(
    [lexical.map((entry) => entry.item), dense],
    manifest.parameters.rrf_k,
  );
  const baselinePoolIds = generateR212CandidatePool(
    query.text,
    corpus.map((item) => ({
      runtimeItemId: item.runtime_item_id,
      text: item.text,
      candidateGroupIds: item.candidate_group_ids,
    })),
    {
      bm25K1: manifest.parameters.bm25_k1,
      bm25B: manifest.parameters.bm25_b,
      seedCount: manifest.parameters.seed_count,
      poolSize: manifest.parameters.pool_size,
    },
  ).map((entry) => entry.runtimeItemId);
  const repairedPoolIds = fused.ranked
    .slice(0, manifest.parameters.pool_size)
    .map((item) => item.runtime_item_id);
  const variantInputs = {
    "bm25_seed12_pair_score_g0.5": {
      poolIds: baselinePoolIds,
      scores: lexicalScores,
      pairWeight: manifest.parameters.baseline_pair_signal_weight,
      anchorRank: null,
    },
    "bm25_minilm_rrf_k60_pair_score_g2.0_top6_anchor": {
      poolIds: repairedPoolIds,
      scores: fused.scores,
      pairWeight: manifest.parameters.repaired_pair_signal_weight,
      anchorRank: manifest.parameters.repaired_anchor_rank,
    },
  };
  for (const variant of variants) {
    const input = variantInputs[variant];
    const pool = input.poolIds.map((id) => itemById.get(id)!);
    const reranked = rerank(
      query.text,
      pool,
      input.scores,
      manifest.parameters.recency_weight,
      input.pairWeight,
      input.anchorRank,
    );
    raw.push({
      runtime_query_key: query.runtime_query_key,
      variant,
      ordered_top20_ids: input.poolIds,
      ordered_top20_sha256: sha256(input.poolIds.join("\n")),
      top3: reranked.slice(0, 3).map((entry) => entry.runtime_item_id),
      full_scores: reranked,
      query_embedding_sha256: sha256(JSON.stringify(queryVectors[queryIndex])),
    });
  }
}
if (
  raw.length !== queries.length * variants.length ||
  raw.some(
    (row) =>
      row.ordered_top20_ids.length !== 20 ||
      new Set(row.ordered_top20_ids).size !== 20 ||
      row.top3.length !== 3,
  )
) {
  throw new Error("Judgments blocked until all R2.20 retrieval calls pass integrity.");
}

const judgmentsText = await readFile(
  path.join(CONFIG, "judgments.sealed.jsonl"),
  "utf8",
);
if (sha256(judgmentsText) !== manifest.judgments_sha256) {
  throw new Error("Sealed judgment checksum mismatch.");
}
const judgments = new Map(
  parseJsonl(judgmentsText).map((row) => [row.runtime_query_key, row]),
);
const evaluated = raw.map((row) => {
  const judgment: any = judgments.get(row.runtime_query_key);
  const required = new Set<string>(judgment.required_item_ids);
  const unsafe = new Set<string>(judgment.unsafe_item_ids);
  const poolHits = row.ordered_top20_ids.filter((id: string) =>
    required.has(id),
  ).length;
  const topHits = row.top3.filter((id: string) => required.has(id)).length;
  return {
    ...row,
    query_id: judgment.query_id,
    stratum: judgment.stratum,
    required_count: required.size,
    required_hits_at_20: poolHits,
    required_hits_at_3: topHits,
    required_recall_at_3: topHits / required.size,
    both_evidence_coverage:
      required.size === 2 ? Number(topHits === 2) : null,
    unsafe_top3_hit: Number(
      row.top3.some((id: string) => unsafe.has(id)),
    ),
  };
});
function summarize(variant: string) {
  const rows = evaluated.filter((row) => row.variant === variant);
  const strata: Record<string, any> = {};
  for (const stratum of [
    "conditional_merge",
    "compatible_history",
    "current_only",
    "hard_negative_current",
  ]) {
    const selected = rows.filter((row) => row.stratum === stratum);
    const hits = selected.reduce((sum, row) => sum + row.required_hits_at_3, 0);
    const count = selected.reduce((sum, row) => sum + row.required_count, 0);
    const both = selected.filter((row) => row.both_evidence_coverage !== null);
    strata[stratum] = {
      query_count: selected.length,
      required_micro_recall_at_3: hits / count,
      both_evidence_coverage:
        both.length > 0
          ? both.reduce((sum, row) => sum + row.both_evidence_coverage, 0) /
            both.length
          : null,
      unsafe_top3_hit_rate:
        selected.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
        selected.length,
    };
  }
  return {
    variant,
    required_micro_recall_at_20:
      rows.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
      rows.reduce((sum, row) => sum + row.required_count, 0),
    strata,
  };
}
const summaries = variants.map(summarize);
const baseline = summaries[0];
const repaired = summaries[1];
const combinedBoth = (summary: any) =>
  (summary.strata.conditional_merge.both_evidence_coverage * 10 +
    summary.strata.compatible_history.both_evidence_coverage * 10) /
  20;
const unsafeRate = (variant: string) => {
  const rows = evaluated.filter((row) => row.variant === variant);
  return rows.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) / rows.length;
};
const hardConstraints = {
  required_candidate_micro_recall_at_20_at_least_0_90:
    repaired.required_micro_recall_at_20 >= 0.9,
  current_only_required_micro_recall_at_3_noninferior:
    repaired.strata.current_only.required_micro_recall_at_3 >=
    baseline.strata.current_only.required_micro_recall_at_3,
  hard_negative_required_micro_recall_at_3_noninferior:
    repaired.strata.hard_negative_current.required_micro_recall_at_3 >=
    baseline.strata.hard_negative_current.required_micro_recall_at_3,
  unsafe_top3_hit_rate_not_increased:
    unsafeRate(variants[1]) <= unsafeRate(variants[0]),
  ordered_pool_embedding_and_execution_integrity:
    embeddingIntegrity.all_finite &&
    embeddingIntegrity.all_l2_normalized &&
    evaluated.every(
      (row) =>
        row.ordered_top20_ids.length === 20 &&
        new Set(row.ordered_top20_ids).size === 20 &&
        row.top3.length === 3 &&
        sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256,
    ),
};
const strictImprovements = {
  conditional_merge_required_micro_recall_at_3_strictly_improves:
    repaired.strata.conditional_merge.required_micro_recall_at_3 >
    baseline.strata.conditional_merge.required_micro_recall_at_3,
  compatible_history_required_micro_recall_at_3_strictly_improves:
    repaired.strata.compatible_history.required_micro_recall_at_3 >
    baseline.strata.compatible_history.required_micro_recall_at_3,
  implicit_both_evidence_coverage_strictly_improves:
    combinedBoth(repaired) > combinedBoth(baseline),
};
const hardEligible = Object.values(hardConstraints).every(Boolean);
const passed = hardEligible && Object.values(strictImprovements).every(Boolean);
const result = {
  schema_version: "v5-r2.20-confirmation-result-1",
  status: passed
    ? "development_confirmation_gate_passed_scope_limited"
    : "development_confirmation_gate_failed",
  development_only: true,
  tested_variant: variants[1],
  baseline_variant: variants[0],
  no_forced_pair_quota: true,
  retrieval_execution_count: 1,
  all_embeddings_and_retrieval_calls_completed_before_judgment_read: true,
  judgment_file_read_count: 1,
  summaries,
  combined_implicit_both_evidence_coverage: {
    baseline: combinedBoth(baseline),
    repaired: combinedBoth(repaired),
  },
  overall_unsafe_top3_hit_rate: {
    baseline: unsafeRate(variants[0]),
    repaired: unsafeRate(variants[1]),
  },
  hard_constraints: hardConstraints,
  hard_eligible: hardEligible,
  strict_improvement_checks: strictImprovements,
  gate_passed: passed,
  claim_boundary: passed
    ? "Scope-limited Development confirmation only; Validation requires a separate preregistration."
    : "No promotion; R2.20 remains Development-only.",
};
const rawText = `${evaluated.map((row) => JSON.stringify(row)).join("\n")}\n`;
const embeddingText = `${JSON.stringify(embeddingIntegrity, null, 2)}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "raw_retrieval_results.jsonl"), rawText),
  writeFile(path.join(OUT, "EMBEDDING_INTEGRITY.json"), embeddingText),
  writeFile(path.join(OUT, "CONFIRMATION_RESULT.json"), resultText),
]);
await writeFile(
  path.join(CONFIG, "EXECUTION_GUARD.json"),
  `${JSON.stringify(
    {
      ...guard,
      status: passed
        ? "confirmation_passed_locked"
        : "confirmation_failed_locked",
      retrieval_execution_count: 1,
      raw_retrieval_sha256: sha256(rawText),
      embedding_integrity_sha256: sha256(embeddingText),
      confirmation_result_sha256: sha256(resultText),
      validation_allowed: false,
      fresh_test_allowed: false,
      promotion_allowed: false,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(result, null, 2));
