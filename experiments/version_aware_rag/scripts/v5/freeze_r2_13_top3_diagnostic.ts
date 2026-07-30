import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(EXP, "data/configs/v5_r2_13_top3_diagnostic");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const [
  r212RawText,
  r212GuardText,
  protocolText,
  runnerText,
  queryText,
  corpusText,
] = await Promise.all([
  readFile(
    path.join(EXP, "results/v5/r2_12_confirmation/raw_retrieval_results.jsonl"),
    "utf8",
  ),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_12_frozen_confirmation/EXECUTION_GUARD.json",
    ),
    "utf8",
  ),
  readFile(path.join(EXP, "R2_13_TOP3_RERANKING_REPAIR_PROTOCOL.md"), "utf8"),
  readFile(path.join(EXP, "scripts/v5/run_r2_13_top3_diagnostic.ts"), "utf8"),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_12_frozen_confirmation/runtime_queries.role_neutral.jsonl",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_12_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
    ),
    "utf8",
  ),
]);
const r212Guard = JSON.parse(r212GuardText);
if (
  r212Guard.status !== "confirmation_failed_locked" ||
  r212Guard.retrieval_execution_count !== 1
) throw new Error("R2.12 confirmation must remain failed-and-locked.");
const trace = parseJsonl(r212RawText)
  .filter((row) => row.variant === "bm25_group_expand_seed14")
  .map((row) => ({
    runtime_query_key: row.runtime_query_key,
    candidates: row.full_scores.map((score: any) => ({
      runtime_item_id: score.runtime_item_id,
      base_norm: score.base_norm,
      recency_norm: score.recency_norm,
      pair_signal: score.pair_signal,
    })),
  }));
if (trace.length !== 32) throw new Error("Expected 32 sanitized traces.");
const traceText = jsonl(trace);
const forbiddenKeys = [
  "query_id",
  "stratum",
  "required_item_ids",
  "unsafe_item_ids",
  "required_hits_at_3",
  "required_recall_at_3",
];
if (forbiddenKeys.some((key) => traceText.includes(`"${key}"`))) {
  throw new Error("Sanitized trace contains forbidden outcome fields.");
}
const manifest = {
  schema_version: "v5-r2.13-top3-diagnostic-manifest-1",
  status: "top3_diagnostic_frozen_unlocked",
  development_only: true,
  outcome_exposed_r2_12_data: true,
  promotion_evidence_allowed: false,
  variants: [
    "pair_score_g0.5",
    "pair_score_g1.0",
    "pair_score_g2.0",
    "pair_quota_g0.5",
    "pair_quota_g1.0",
  ],
  runtime_trace_sha256: sha256(traceText),
  runtime_queries_sha256: sha256(queryText),
  candidate_corpus_sha256: sha256(corpusText),
  protocol_sha256: sha256(protocolText),
  runner_sha256: sha256(runnerText),
  r2_12_guard_sha256: sha256(r212GuardText),
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_12_rerun_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.13-top3-diagnostic-guard-1",
  status: "top3_diagnostic_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  execution_count: 0,
  judgments_after_all_top3_only: true,
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_12_rerun_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "runtime_trace.role_neutral.jsonl"), traceText),
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(path.join(OUT, "EXECUTION_GUARD.json"), `${JSON.stringify(guard, null, 2)}\n`),
]);
console.log(JSON.stringify({ status: manifest.status, trace_count: trace.length, variant_count: manifest.variants.length }, null, 2));
