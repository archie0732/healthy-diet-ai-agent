import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateR212CandidatePool } from "../../src/retrieval/r2_12_candidate_generator";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_16_frozen_confirmation");
const OUT = path.join(EXP, "results/v5/r2_16_confirmation");
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
  const lengths = docs.map((tokens) => tokens.length);
  const averageLength =
    lengths.reduce((sum, length) => sum + length, 0) /
    Math.max(1, lengths.length);
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  return corpus
    .map((item, index) => {
      const tf = new Map<string, number>();
      for (const term of docs[index]) tf.set(term, (tf.get(term) ?? 0) + 1);
      let score = 0;
      for (const term of words(query)) {
        const count = tf.get(term) ?? 0;
        if (!count) continue;
        const idf = Math.log(
          (corpus.length - (df.get(term) ?? 0) + 0.5) /
            ((df.get(term) ?? 0) + 0.5) +
            1,
        );
        score +=
          idf *
          ((count * (k1 + 1)) /
            (count + k1 * (1 - b + (b * lengths[index]) / averageLength)));
      }
      return { item, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.runtime_item_id.localeCompare(right.item.runtime_item_id),
    );
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
  throw new Error("R2.16 confirmation guard failed.");
}
const queries = parseJsonl(queriesText) as Query[];
const corpus = parseJsonl(corpusText) as Item[];
const variants = [
  "pair_score_g0.5",
  "pair_score_g2.0_top6_anchor",
] as const;
const raw: any[] = [];
for (const query of queries) {
  const ranked = bm25(
    query.text,
    corpus,
    manifest.parameters.bm25_k1,
    manifest.parameters.bm25_b,
  );
  const scoreById = new Map(
    ranked.map((entry) => [entry.item.runtime_item_id, entry.score]),
  );
  const poolIds = generateR212CandidatePool(
    query.text,
    corpus.map((item) => ({
      runtimeItemId: item.runtime_item_id,
      text: item.text,
      candidateGroupIds: item.candidate_group_ids,
    })),
    {
      bm25K1: manifest.parameters.bm25_k1,
      bm25B: manifest.parameters.bm25_b,
      seedCount: manifest.parameters.group_seed_count,
      poolSize: manifest.parameters.pool_size,
    },
  ).map((entry) => entry.runtimeItemId);
  const itemById = new Map(
    corpus.map((item) => [item.runtime_item_id, item]),
  );
  const pool = poolIds.map((id) => itemById.get(id)!);
  for (const variant of variants) {
    const pairWeight =
      variant === "pair_score_g2.0_top6_anchor"
        ? manifest.parameters.repaired_pair_signal_weight
        : manifest.parameters.baseline_pair_signal_weight;
    const reranked = rerank(
      query.text,
      pool,
      scoreById,
      manifest.parameters.recency_weight,
      pairWeight,
      variant === "pair_score_g2.0_top6_anchor"
        ? manifest.parameters.repaired_anchor_rank
        : null,
    );
    raw.push({
      runtime_query_key: query.runtime_query_key,
      variant,
      ordered_top20_ids: poolIds,
      ordered_top20_sha256: sha256(poolIds.join("\n")),
      top3: reranked.slice(0, 3).map((entry) => entry.runtime_item_id),
      full_scores: reranked,
    });
  }
}
if (raw.length !== queries.length * variants.length) {
  throw new Error("Judgments cannot be read before all retrieval calls complete.");
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
  const judgment = judgments.get(row.runtime_query_key);
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
    const hits = selected.reduce(
      (sum, row) => sum + row.required_hits_at_3,
      0,
    );
    const count = selected.reduce(
      (sum, row) => sum + row.required_count,
      0,
    );
    const both = selected.filter(
      (row) => row.both_evidence_coverage !== null,
    );
    strata[stratum] = {
      query_count: selected.length,
      required_micro_recall_at_3: hits / count,
      both_evidence_coverage:
        both.length > 0
          ? both.reduce(
              (sum, row) => sum + row.both_evidence_coverage,
              0,
            ) / both.length
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
  return (
    rows.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) / rows.length
  );
};
const identicalPools = queries.every((query) => {
  const rows = evaluated.filter(
    (row) => row.runtime_query_key === query.runtime_query_key,
  );
  return (
    rows.length === 2 &&
    rows[0].ordered_top20_sha256 === rows[1].ordered_top20_sha256
  );
});
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
    unsafeRate("pair_score_g2.0_top6_anchor") <=
    unsafeRate("pair_score_g0.5"),
  ordered_pool_and_execution_integrity:
    identicalPools &&
    evaluated.every(
      (row) =>
        row.ordered_top20_ids.length === 20 &&
        row.top3.length === 3 &&
        sha256(row.ordered_top20_ids.join("\n")) ===
          row.ordered_top20_sha256,
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
const passed =
  hardEligible && Object.values(strictImprovements).every(Boolean);
const result = {
  schema_version: "v5-r2.16-confirmation-result-1",
  status: passed
    ? "development_confirmation_gate_passed_scope_limited"
    : "development_confirmation_gate_failed",
  development_only: true,
  tested_variant: "pair_score_g2.0_top6_anchor",
  baseline_variant: "pair_score_g0.5",
  no_forced_pair_quota: true,
  retrieval_execution_count: 1,
  all_retrieval_calls_completed_before_judgment_read: true,
  judgment_file_read_count: 1,
  summaries,
  combined_implicit_both_evidence_coverage: {
    baseline: combinedBoth(baseline),
    repaired: combinedBoth(repaired),
  },
  overall_unsafe_top3_hit_rate: {
    baseline: unsafeRate("pair_score_g0.5"),
    repaired: unsafeRate("pair_score_g2.0_top6_anchor"),
  },
  hard_constraints: hardConstraints,
  hard_eligible: hardEligible,
  strict_improvement_checks: strictImprovements,
  gate_passed: passed,
  claim_boundary: passed
    ? "Scope-limited Development confirmation only; Validation requires a separate preregistration."
    : "No promotion; R2.16 remains Development-only.",
};
const rawText = `${evaluated
  .map((row) => JSON.stringify(row))
  .join("\n")}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "raw_retrieval_results.jsonl"), rawText),
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
      confirmation_result_sha256: sha256(resultText),
      validation_allowed: false,
      fresh_test_allowed: false,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(result, null, 2));

