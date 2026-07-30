import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(
  EXP,
  "data/configs/v5_r2_12_candidate_recall_diagnostic",
);
const OUT = path.join(
  EXP,
  "results/v5/r2_12_candidate_recall_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const [manifestText, guardText, rawText, resultText, r211GuardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "FROZEN_DIAGNOSTIC_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "DIAGNOSTIC_GUARD.json"), "utf8"),
    readFile(path.join(OUT, "raw_candidate_pools.jsonl"), "utf8"),
    readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_11_frozen_development/EXECUTION_GUARD.json",
      ),
      "utf8",
    ),
  ]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const r211Guard = JSON.parse(r211GuardText);
const rows = parseJsonl(rawText);
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

check(
  guard.status === "diagnostic_complete_locked" &&
    guard.diagnostic_execution_count === 1,
  "R2.12 diagnostic is not locked at count 1",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_candidate_pools_sha256, "raw hash mismatch");
check(
  sha256(resultText) === guard.diagnostic_result_sha256,
  "result hash mismatch",
);
check(
  r211Guard.status === "development_gate_failed_locked" &&
    r211Guard.retrieval_execution_count === 1,
  "R2.11 execution guard changed",
);
check(
  sha256(r211GuardText) === manifest.inputs.r211_guard.sha256,
  "R2.11 guard bytes changed after diagnostic freeze",
);
check(
  rows.length === result.query_count * result.variant_count,
  "raw candidate pool row count mismatch",
);
check(
  new Set(rows.map((row) => `${row.runtime_query_key}\t${row.variant}`)).size ===
    rows.length,
  "duplicate query-variant rows",
);
check(
  rows.every(
    (row) =>
      row.ordered_top20_ids.length === manifest.parameters.pool_size &&
      new Set(row.ordered_top20_ids).size === manifest.parameters.pool_size &&
      sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256,
  ),
  "ordered Top-20 integrity failure",
);

const selected = result.summaries.find(
  (summary: any) =>
    summary.variant === result.selected_diagnostic_variant,
);
const baseline = result.summaries.find(
  (summary: any) => summary.variant === "whole_query_bm25",
);
check(
  result.selected_diagnostic_variant === "bm25_group_expand_seed14",
  "unexpected diagnostic selection",
);
check(
  baseline.required_candidate_recall_failure_count === 10 &&
    selected.required_candidate_recall_failure_count === 3,
  "failure-count reduction does not reproduce",
);
check(
  baseline.required_micro_recall_at_20 === 78 / 88 &&
    selected.required_micro_recall_at_20 === 85 / 88,
  "required Recall@20 does not reproduce",
);
check(
  result.outcome_exposed_r2_11_data === true &&
    result.promotion_evidence === false &&
    result.confirmation_required === true,
  "diagnostic claim boundary is missing",
);

const audit = {
  schema_version: "v5-r2.12-candidate-diagnostic-audit-1",
  status: failures.length === 0 ? "audit_pass" : "audit_fail",
  audited_at: "2026-07-26T00:00:00.000+08:00",
  development_only: true,
  outcome_exposed_r2_11_data: true,
  promotion_evidence: false,
  diagnostic_execution_count: guard.diagnostic_execution_count,
  r2_11_retrieval_execution_count_preserved:
    r211Guard.retrieval_execution_count,
  raw_pool_row_count: rows.length,
  selected_diagnostic_variant: result.selected_diagnostic_variant,
  baseline_required_recall_at_20: baseline.required_micro_recall_at_20,
  selected_required_recall_at_20: selected.required_micro_recall_at_20,
  failures_before: baseline.required_candidate_recall_failure_count,
  failures_after: selected.required_candidate_recall_failure_count,
  confirmation_required: true,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    diagnostic_guard: sha256(guardText),
    raw_candidate_pools: sha256(rawText),
    diagnostic_result: sha256(resultText),
  },
  failures,
};
await writeFile(
  path.join(OUT, "AUDIT.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
