import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const R214_CONFIG = path.join(
  EXP,
  "data/configs/v5_r2_14_frozen_confirmation",
);
const R214_OUT = path.join(EXP, "results/v5/r2_14_confirmation");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const [
  rawText,
  resultText,
  r214GuardText,
  queriesText,
  corpusText,
  judgmentsText,
  protocolText,
  runnerText,
] = await Promise.all([
  readFile(path.join(R214_OUT, "raw_retrieval_results.jsonl"), "utf8"),
  readFile(path.join(R214_OUT, "CONFIRMATION_RESULT.json"), "utf8"),
  readFile(path.join(R214_CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(R214_CONFIG, "runtime_queries.role_neutral.jsonl"), "utf8"),
  readFile(path.join(R214_CONFIG, "candidate_corpus.role_neutral.jsonl"), "utf8"),
  readFile(path.join(R214_CONFIG, "judgments.sealed.jsonl"), "utf8"),
  readFile(
    path.join(
      EXP,
      "R2_15_COMPATIBLE_HISTORY_SELECTIVITY_DIAGNOSTIC_PROTOCOL.md",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      EXP,
      "scripts/v5/run_r2_15_compatible_selectivity_diagnostic.ts",
    ),
    "utf8",
  ),
]);
const r214Guard = JSON.parse(r214GuardText);
const r214Result = JSON.parse(resultText);
if (
  r214Guard.status !== "confirmation_failed_locked" ||
  r214Guard.retrieval_execution_count !== 1 ||
  sha256(rawText) !== r214Guard.raw_retrieval_sha256 ||
  sha256(resultText) !== r214Guard.confirmation_result_sha256 ||
  r214Result.gate_passed !== false
) {
  throw new Error("R2.14 failed-and-locked source boundary is invalid.");
}
const repairedRows = parseJsonl(rawText).filter(
  (row) => row.variant === "pair_score_g2.0",
);
if (repairedRows.length !== 32) {
  throw new Error("Expected 32 frozen R2.14 repaired traces.");
}
const traces = repairedRows.map((row) => ({
  runtime_query_key: row.runtime_query_key,
  ordered_top20_ids: row.ordered_top20_ids,
  ordered_top20_sha256: row.ordered_top20_sha256,
  r2_14_control_top3: row.top3,
  candidates: row.full_scores.map((score: any) => ({
    runtime_item_id: score.runtime_item_id,
    base_norm: score.base_norm,
    recency_norm: score.recency_norm,
    original_pair_signal: score.pair_signal,
  })),
}));
if (
  traces.some(
    (trace) =>
      trace.ordered_top20_ids.length !== 20 ||
      trace.candidates.length !== 20 ||
      sha256(trace.ordered_top20_ids.join("\n")) !==
        trace.ordered_top20_sha256,
  )
) {
  throw new Error("R2.14 trace integrity failure.");
}
const traceText = jsonl(traces);
const variants = [
  "pair_score_g2.0",
  "pair_score_g2.0_base_gate_0.25",
  "pair_score_g2.0_base_gate_0.50",
  "pair_score_g2.0_top6_anchor",
  "pair_score_g2.0_top10_anchor",
];
const manifest = {
  schema_version: "v5-r2.15-compatible-selectivity-frozen-manifest-1",
  status: "diagnostic_frozen_unlocked",
  development_only: true,
  outcome_exposed_r2_14_data: true,
  trace_count: traces.length,
  variants,
  parameters: {
    recency_weight: 0.2,
    pair_signal_weight: 2.0,
    forced_pair_quota: false,
    base_gate_thresholds: [0.25, 0.5],
    anchor_ranks: [6, 10],
  },
  runtime_trace_sha256: sha256(traceText),
  r2_14_raw_results_sha256: sha256(rawText),
  r2_14_result_sha256: sha256(resultText),
  r2_14_guard_sha256: sha256(r214GuardText),
  r2_14_queries_sha256: sha256(queriesText),
  r2_14_corpus_sha256: sha256(corpusText),
  r2_14_judgments_sha256: sha256(judgmentsText),
  protocol_sha256: sha256(protocolText),
  runner_sha256: sha256(runnerText),
  retrieval_calls_allowed: false,
  r2_14_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.15-compatible-selectivity-guard-1",
  status: "diagnostic_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  execution_count: 0,
  judgments_read_only_after_all_variant_top3: true,
  retrieval_calls_allowed: false,
  r2_14_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "runtime_trace.role_neutral.jsonl"), traceText),
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(
    path.join(OUT, "EXECUTION_GUARD.json"),
    `${JSON.stringify(guard, null, 2)}\n`,
  ),
]);
console.log(
  JSON.stringify(
    {
      status: manifest.status,
      trace_count: traces.length,
      variant_count: variants.length,
      execution_count: 0,
      retrieval_calls_allowed: false,
    },
    null,
    2,
  ),
);
