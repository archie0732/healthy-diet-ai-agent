import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_11_frozen_development");
const OUT = path.join(EXP, "results/v5/r2_11_development");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

type Item = {
  runtime_item_id: string;
  text: string;
  publication_year: number;
  source_locator: Record<string, unknown>;
  candidate_group_ids: string[];
};
type Query = { runtime_query_key: string; text: string };
type PoolItem = Item & {
  bm25: number;
  base_norm: number;
  recency_norm: number;
};

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
const unique = (values: string[]) => [...new Set(values)];
const historyPatterns = [
  /\b(?:19|20)\d{2}\b/i,
  /\bhistorical(?:ly)?\b/i,
  /\bprevious(?:ly)?\b/i,
  /\bearlier\b/i,
  /\bformerly\b/i,
  /\bprior\b/i,
  /\bhow did\b.{0,100}\bchange\b/i,
];
const isExplicitHistory = (query: string) =>
  historyPatterns.some((pattern) => pattern.test(query));

function bm25(query: string, corpus: Item[], k1: number, b: number) {
  const docs = corpus.map((item) => words(item.text));
  const lengths = docs.map((tokens) => tokens.length);
  const averageLength =
    lengths.reduce((sum, length) => sum + length, 0) /
    Math.max(1, lengths.length);
  const frequencies = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
  }
  const queryTerms = words(query);
  return corpus
    .map((item, index) => {
      const tf = new Map<string, number>();
      for (const term of docs[index]) tf.set(term, (tf.get(term) ?? 0) + 1);
      let score = 0;
      for (const term of queryTerms) {
        const count = tf.get(term) ?? 0;
        if (!count) continue;
        const df = frequencies.get(term) ?? 0;
        const idf = Math.log(
          (corpus.length - df + 0.5) / (df + 0.5) + 1,
        );
        score +=
          idf *
          ((count * (k1 + 1)) /
            (count + k1 * (1 - b + (b * lengths[index]) / averageLength)));
      }
      return { item, score };
    })
    .sort(
      (a, bScore) =>
        bScore.score - a.score ||
        a.item.runtime_item_id.localeCompare(bScore.item.runtime_item_id),
    );
}

function hashIndex(feature: string, dimensions: number) {
  return Number.parseInt(sha256(feature).slice(0, 8), 16) % dimensions;
}
function embedding(text: string, dimensions: number) {
  const tokens = words(text);
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const features = [
    ...tokens.map((token) => `w:${token}`),
    ...tokens.slice(1).map((token, index) => `b:${tokens[index]}_${token}`),
    ...Array.from(
      { length: Math.max(0, normalized.length - 2) },
      (_, index) => `c:${normalized.slice(index, index + 3)}`,
    ),
  ];
  const vector = new Float64Array(dimensions);
  for (const feature of features) vector[hashIndex(feature, dimensions)] += 1;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm > 0) {
    for (let index = 0; index < vector.length; index++) vector[index] /= norm;
  }
  return vector;
}
function cosine(left: Float64Array, right: Float64Array) {
  let value = 0;
  for (let index = 0; index < left.length; index++) {
    value += left[index] * right[index];
  }
  return value;
}
function coverage(queryTerms: string[], texts: string[]) {
  const terms = new Set(texts.flatMap((text) => words(text)));
  if (queryTerms.length === 0) return 0;
  return queryTerms.filter((term) => terms.has(term)).length / queryTerms.length;
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
  guard.status !== "frozen_development_retrieval_unlocked" ||
  guard.retrieval_execution_count !== 0 ||
  !guard.judgments_may_be_read_only_after_all_retrieval_calls ||
  guard.external_model_api_allowed ||
  sha256(queriesText) !== manifest.role_neutral_runtime_queries_sha256 ||
  sha256(corpusText) !== manifest.role_neutral_corpus_sha256 ||
  sha256(manifestText) !== guard.manifest_sha256
) {
  throw new Error("R2.11 frozen Development execution guard failed.");
}

const queries = parseJsonl(queriesText) as Query[];
const corpus = parseJsonl(corpusText) as Item[];
const retrievalRows: any[] = [];
const systemNames = [
  "recency_lambda_0.75",
  "r2_10_explicit_history_router",
  ...manifest.retrieval.implicit_merge_grid.map(
    (config: any) =>
      `implicit_merge_r${config.recency_weight}_g${config.group_boost}`,
  ),
  "local_hash_embedding_v1",
];

for (const query of queries) {
  const bm25StartedAt = performance.now();
  const ranked = bm25(
    query.text,
    corpus,
    manifest.retrieval.bm25_k1,
    manifest.retrieval.bm25_b,
  );
  const bm25LatencyMs = performance.now() - bm25StartedAt;
  const pool = ranked.slice(0, manifest.retrieval.candidate_pool_size);
  const poolIds = pool.map((entry) => entry.item.runtime_item_id);
  const poolHash = sha256(
    pool.map((entry) => `${entry.item.runtime_item_id}\t${entry.score}`).join("\n"),
  );
  const values = pool.map((entry) => entry.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const normalized: PoolItem[] = pool.map((entry) => ({
    ...entry.item,
    bm25: entry.score,
    base_norm: max > min ? (entry.score - min) / (max - min) : 0,
    recency_norm: (entry.item.publication_year - 2015) / (2026 - 2015),
  }));
  const byGroup = new Map<string, PoolItem[]>();
  for (const item of normalized) {
    for (const group of item.candidate_group_ids) {
      const members = byGroup.get(group) ?? [];
      members.push(item);
      byGroup.set(group, members);
    }
  }
  const queryTerms = unique(words(query.text));
  const multiClauseFactor =
    1 +
    Math.min(
      3,
      (query.text.match(/\band\b|,|;|\bwhile\b|\bwhich\b/gi) ?? []).length,
    ) *
      0.2;
  const pairSignal = new Map<string, number>();
  for (const item of normalized) {
    let best = 0;
    for (const group of item.candidate_group_ids) {
      const members = byGroup.get(group) ?? [];
      if (members.length < 2) continue;
      const joint = coverage(
        queryTerms,
        members.map((member) => member.text),
      );
      const strongest = Math.max(
        ...members.map((member) => coverage(queryTerms, [member.text])),
      );
      best = Math.max(best, Math.max(0, joint - strongest) * multiClauseFactor);
    }
    pairSignal.set(item.runtime_item_id, best);
  }
  const explicit = isExplicitHistory(query.text);
  const seed = normalized[0];
  const queryEmbedding = embedding(
    query.text,
    manifest.retrieval.local_embedding.dimensions,
  );

  const scoreMaps = new Map<string, Map<string, number>>();
  scoreMaps.set(
    "recency_lambda_0.75",
    new Map(
      normalized.map((item) => [
        item.runtime_item_id,
        item.base_norm +
          manifest.retrieval.recency_lambda * item.recency_norm,
      ]),
    ),
  );
  scoreMaps.set(
    "r2_10_explicit_history_router",
    new Map(
      normalized.map((item) => {
        const relatedToSeed = item.candidate_group_ids.some((group) =>
          seed.candidate_group_ids.includes(group),
        );
        return [
          item.runtime_item_id,
          explicit
            ? item.base_norm +
              (relatedToSeed
                ? manifest.retrieval.explicit_history_pair_boost
                : 0)
            : item.base_norm +
              manifest.retrieval.recency_lambda * item.recency_norm,
        ];
      }),
    ),
  );
  for (const config of manifest.retrieval.implicit_merge_grid) {
    const name = `implicit_merge_r${config.recency_weight}_g${config.group_boost}`;
    scoreMaps.set(
      name,
      new Map(
        normalized.map((item) => [
          item.runtime_item_id,
          item.base_norm +
            config.recency_weight * item.recency_norm +
            config.group_boost * (pairSignal.get(item.runtime_item_id) ?? 0),
        ]),
      ),
    );
  }
  scoreMaps.set(
    "local_hash_embedding_v1",
    new Map(
      normalized.map((item) => [
        item.runtime_item_id,
        0.3 * item.base_norm +
          0.55 *
            cosine(
              queryEmbedding,
              embedding(
                item.text,
                manifest.retrieval.local_embedding.dimensions,
              ),
            ) +
          0.15 * item.recency_norm,
      ]),
    ),
  );

  for (const system of systemNames) {
    const rerankStartedAt = performance.now();
    const systemScores = scoreMaps.get(system);
    if (!systemScores) throw new Error(`Missing score map for ${system}`);
    const sorted = [...normalized].sort(
      (left, right) =>
        (systemScores.get(right.runtime_item_id) ?? 0) -
          (systemScores.get(left.runtime_item_id) ?? 0) ||
        left.runtime_item_id.localeCompare(right.runtime_item_id),
    );
    const rerankLatencyMs = performance.now() - rerankStartedAt;
    retrievalRows.push({
      runtime_query_key: query.runtime_query_key,
      system,
      shared_candidate_pool_ids: poolIds,
      shared_candidate_pool_scores: pool.map((entry) => entry.score),
      shared_candidate_pool_hash: poolHash,
      top3: sorted.slice(0, manifest.retrieval.top_k).map((item) => item.runtime_item_id),
      latency_ms: {
        shared_bm25_pool: bm25LatencyMs,
        system_rerank: rerankLatencyMs,
        total: bm25LatencyMs + rerankLatencyMs,
      },
      full_scores: sorted.map((item) => ({
        runtime_item_id: item.runtime_item_id,
        score: systemScores.get(item.runtime_item_id),
        bm25: item.bm25,
        base_norm: item.base_norm,
        recency_norm: item.recency_norm,
        pair_signal: pairSignal.get(item.runtime_item_id) ?? 0,
      })),
    });
  }
}

const allRetrievalCallsComplete =
  retrievalRows.length === queries.length * systemNames.length;
if (!allRetrievalCallsComplete) {
  throw new Error("Judgments cannot be read before every retrieval call completes.");
}

let judgmentFileReadCount = 0;
const judgmentsText = await readFile(
  path.join(CONFIG, "judgments.sealed.jsonl"),
  "utf8",
);
judgmentFileReadCount++;
if (sha256(judgmentsText) !== manifest.sealed_judgments_sha256) {
  throw new Error("R2.11 sealed-judgment checksum mismatch.");
}
const judgmentMap = new Map(
  parseJsonl(judgmentsText).map((row) => [row.runtime_query_key, row]),
);
const evaluated = retrievalRows.map((row) => {
  const judgment: any = judgmentMap.get(row.runtime_query_key);
  if (!judgment) throw new Error(`Missing judgment ${row.runtime_query_key}`);
  const required = new Set<string>(judgment.required_item_ids);
  const unsafe = new Set<string>([
    ...judgment.deprecated_item_ids,
    ...judgment.forbidden_item_ids,
  ]);
  const requiredHits = row.top3.filter((id: string) => required.has(id)).length;
  const candidateHits = row.shared_candidate_pool_ids.filter((id: string) =>
    required.has(id),
  ).length;
  const required_item_stage_attribution = judgment.required_item_ids.map(
    (id: string) => ({
      runtime_item_id: id,
      stage: !row.shared_candidate_pool_ids.includes(id)
        ? "candidate_recall_failure"
        : !row.top3.includes(id)
          ? "reranking_or_policy_failure"
          : "retrieval_success",
    }),
  );
  const unsafe_top3_item_ids = row.top3.filter((id: string) => unsafe.has(id));
  return {
    ...row,
    query_id: judgment.query_id,
    stratum: judgment.stratum,
    required_item_ids: judgment.required_item_ids,
    deprecated_item_ids: judgment.deprecated_item_ids,
    forbidden_item_ids: judgment.forbidden_item_ids,
    required_hits_at_3: requiredHits,
    required_count: required.size,
    required_recall_at_3: requiredHits / required.size,
    both_evidence_coverage:
      required.size === 2 ? Number(requiredHits === 2) : null,
    unsafe_top3_hit: Number(row.top3.some((id: string) => unsafe.has(id))),
    candidate_required_hits_at_20: candidateHits,
    candidate_required_count: required.size,
    required_item_stage_attribution,
    safety_failure:
      unsafe_top3_item_ids.length > 0
        ? {
            stage: "safety_failure",
            unsafe_top3_item_ids,
          }
        : null,
  };
});

function summarize(system: string) {
  const rows = evaluated.filter((row) => row.system === system);
  const strata: Record<string, any> = {};
  for (const stratum of [
    "conditional_merge",
    "compatible_history",
    "current_only",
    "hard_negative_current",
  ]) {
    const selected = rows.filter((row) => row.stratum === stratum);
    const requiredHits = selected.reduce(
      (sum, row) => sum + row.required_hits_at_3,
      0,
    );
    const requiredCount = selected.reduce(
      (sum, row) => sum + row.required_count,
      0,
    );
    const both = selected.filter((row) => row.both_evidence_coverage !== null);
    strata[stratum] = {
      query_count: selected.length,
      required_micro_recall_at_3: requiredHits / requiredCount,
      mean_query_recall_at_3:
        selected.reduce((sum, row) => sum + row.required_recall_at_3, 0) /
        selected.length,
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
    system,
    required_candidate_micro_recall_at_20:
      rows.reduce((sum, row) => sum + row.candidate_required_hits_at_20, 0) /
      rows.reduce((sum, row) => sum + row.candidate_required_count, 0),
    strata,
  };
}
const summaries = systemNames.map(summarize);
const recency = summaries.find(
  (summary) => summary.system === "recency_lambda_0.75",
)!;
const candidates = summaries.filter(
  (summary) => summary.system !== "recency_lambda_0.75",
);
const selectionScore = (summary: any) =>
  summary.strata.conditional_merge.required_micro_recall_at_3 +
  summary.strata.compatible_history.required_micro_recall_at_3 +
  0.5 *
    (summary.strata.conditional_merge.both_evidence_coverage +
      summary.strata.compatible_history.both_evidence_coverage) +
  0.25 * summary.strata.current_only.required_micro_recall_at_3 +
  0.25 * summary.strata.hard_negative_current.required_micro_recall_at_3 -
  0.5 *
    (summary.strata.conditional_merge.unsafe_top3_hit_rate +
      summary.strata.compatible_history.unsafe_top3_hit_rate +
      summary.strata.current_only.unsafe_top3_hit_rate +
      summary.strata.hard_negative_current.unsafe_top3_hit_rate);
const selected = [...candidates].sort(
  (left, right) =>
    selectionScore(right) - selectionScore(left) ||
    left.system.localeCompare(right.system),
)[0];

const sharedPoolIdentity = queries.every((query) => {
  const rows = evaluated.filter(
    (row) => row.runtime_query_key === query.runtime_query_key,
  );
  return (
    rows.length === systemNames.length &&
    rows.every(
      (row) =>
        row.shared_candidate_pool_hash === rows[0].shared_candidate_pool_hash &&
        JSON.stringify(row.shared_candidate_pool_ids) ===
          JSON.stringify(rows[0].shared_candidate_pool_ids) &&
        JSON.stringify(row.shared_candidate_pool_scores) ===
          JSON.stringify(rows[0].shared_candidate_pool_scores),
    )
  );
});
const selectedRows = evaluated.filter((row) => row.system === selected.system);
const recencyRows = evaluated.filter(
  (row) => row.system === "recency_lambda_0.75",
);
const recencyByQuery = new Map(
  recencyRows.map((row) => [row.runtime_query_key, row]),
);
const pairedDifferences = selectedRows.map(
  (row) =>
    row.required_recall_at_3 -
    recencyByQuery.get(row.runtime_query_key)!.required_recall_at_3,
);

function bootstrapMeanDifference(values: number[], samples: number, seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const estimates: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    let sum = 0;
    for (let index = 0; index < values.length; index++) {
      sum += values[Math.floor(random() * values.length)];
    }
    estimates.push(sum / values.length);
  }
  estimates.sort((a, b) => a - b);
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    lower_95:
      estimates[Math.floor(0.025 * (estimates.length - 1))],
    upper_95:
      estimates[Math.floor(0.975 * (estimates.length - 1))],
    samples,
    seed,
  };
}
function binomialCoefficient(n: number, k: number) {
  let result = 1;
  for (let index = 1; index <= k; index++) {
    result = (result * (n - index + 1)) / index;
  }
  return result;
}
function exactSignTest(values: number[]) {
  const wins = values.filter((value) => value > 0).length;
  const losses = values.filter((value) => value < 0).length;
  const n = wins + losses;
  if (n === 0) return { wins, losses, ties: values.length, two_sided_p: 1 };
  const extreme = Math.min(wins, losses);
  let tail = 0;
  for (let index = 0; index <= extreme; index++) {
    tail += binomialCoefficient(n, index) * 0.5 ** n;
  }
  return {
    wins,
    losses,
    ties: values.length - n,
    two_sided_p: Math.min(1, 2 * tail),
  };
}

const mergeBothSelected =
  (selected.strata.conditional_merge.both_evidence_coverage * 16 +
    selected.strata.compatible_history.both_evidence_coverage * 16) /
  32;
const mergeBothRecency =
  (recency.strata.conditional_merge.both_evidence_coverage * 16 +
    recency.strata.compatible_history.both_evidence_coverage * 16) /
  32;
const selectedUnsafe =
  selectedRows.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
  selectedRows.length;
const recencyUnsafe =
  recencyRows.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
  recencyRows.length;
const gateChecks = {
  conditional_merge_required_micro_recall_strictly_improves:
    selected.strata.conditional_merge.required_micro_recall_at_3 >
    recency.strata.conditional_merge.required_micro_recall_at_3,
  compatible_history_required_micro_recall_strictly_improves:
    selected.strata.compatible_history.required_micro_recall_at_3 >
    recency.strata.compatible_history.required_micro_recall_at_3,
  implicit_two_sided_both_evidence_coverage_strictly_improves:
    mergeBothSelected > mergeBothRecency,
  current_only_required_micro_recall_noninferior:
    selected.strata.current_only.required_micro_recall_at_3 >=
    recency.strata.current_only.required_micro_recall_at_3,
  hard_negative_current_required_micro_recall_noninferior:
    selected.strata.hard_negative_current.required_micro_recall_at_3 >=
    recency.strata.hard_negative_current.required_micro_recall_at_3,
  deprecated_or_forbidden_top3_hit_rate_not_increased:
    selectedUnsafe <= recencyUnsafe,
  required_candidate_micro_recall_at_20_at_least_0_90:
    selected.required_candidate_micro_recall_at_20 >= 0.9,
  shared_pool_ordered_id_score_hash_identity_100_percent: sharedPoolIdentity,
};
const passed = Object.values(gateChecks).every(Boolean);
const result = {
  schema_version: "v5-r2.11-development-result-1",
  status: passed
    ? "development_gate_passed_scope_limited"
    : "development_gate_failed_remains_development",
  development_only: true,
  selected_system: selected.system,
  selection_score: selectionScore(selected),
  systems_executed: systemNames,
  cross_encoder_status: manifest.retrieval.local_cross_encoder,
  external_model_api_used: false,
  all_retrieval_calls_completed_before_judgment_read: allRetrievalCallsComplete,
  judgment_file_read_count: judgmentFileReadCount,
  shared_candidate_pool_identity: sharedPoolIdentity,
  summaries,
  selected_vs_recency: {
    selected_system: selected.system,
    paired_bootstrap_required_recall_at_3: bootstrapMeanDifference(
      pairedDifferences,
      manifest.retrieval.bootstrap_samples,
      manifest.retrieval.bootstrap_seed,
    ),
    paired_exact_sign_test: exactSignTest(pairedDifferences),
    combined_merge_both_evidence_coverage: {
      recency: mergeBothRecency,
      selected: mergeBothSelected,
    },
    overall_unsafe_top3_hit_rate: {
      recency: recencyUnsafe,
      selected: selectedUnsafe,
    },
  },
  gate_checks: gateChecks,
  gate_passed: passed,
  claim_boundary: passed
    ? "Development-only evidence for implicit merge retrieval under the frozen R2.11 construction."
    : "No retrieval promotion; the cycle remains Development-only.",
  prohibited_claims: [
    "Validation evidence",
    "fresh held-out test evidence",
    "clinical effectiveness",
    "overall Version-Aware superiority",
  ],
};

await mkdir(OUT, { recursive: true });
const rawText = `${evaluated.map((row) => JSON.stringify(row)).join("\n")}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await Promise.all([
  writeFile(path.join(OUT, "raw_retrieval_results.jsonl"), rawText, "utf8"),
  writeFile(path.join(OUT, "DEVELOPMENT_RESULT.json"), resultText, "utf8"),
]);
await writeFile(
  path.join(CONFIG, "EXECUTION_GUARD.json"),
  `${JSON.stringify(
    {
      ...guard,
      status: passed
        ? "development_gate_passed_locked"
        : "development_gate_failed_locked",
      retrieval_execution_count: 1,
      raw_retrieval_sha256: sha256(rawText),
      development_result_sha256: sha256(resultText),
      validation_allowed: false,
      fresh_test_allowed: false,
      r2_10_rerun_allowed: false,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(JSON.stringify(result, null, 2));
