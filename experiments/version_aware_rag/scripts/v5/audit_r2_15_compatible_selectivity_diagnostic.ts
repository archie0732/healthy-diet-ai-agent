import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(
  EXP,
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic",
);
const OUT = path.join(
  EXP,
  "results/v5/r2_15_compatible_selectivity_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [manifestText, guardText, rawText, resultText, r214GuardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
    readFile(path.join(OUT, "raw_top3_results.jsonl"), "utf8"),
    readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_14_frozen_confirmation/EXECUTION_GUARD.json",
      ),
      "utf8",
    ),
  ]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const r214Guard = JSON.parse(r214GuardText);
const rows = parseJsonl(rawText);
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};
check(
  guard.status === "diagnostic_complete_locked" &&
    guard.execution_count === 1,
  "R2.15 guard is not complete-and-locked at count 1",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_results_sha256, "raw hash mismatch");
check(
  sha256(resultText) === guard.diagnostic_result_sha256,
  "result hash mismatch",
);
check(rows.length === 160, "expected 160 query-variant rows");
check(
  new Set(
    rows.map((row) => `${row.runtime_query_key}\t${row.variant}`),
  ).size === 160,
  "duplicate query-variant rows",
);
check(
  rows.every(
    (row) =>
      row.top3.length === 3 &&
      sha256(row.top3.join("\n")) === row.top3_sha256,
  ),
  "Top-3 hash integrity failure",
);
check(
  new Set(rows.map((row) => row.ordered_top20_sha256)).size > 1 &&
    [...new Set(rows.map((row) => row.runtime_query_key))].every((key) => {
      const selected = rows.filter((row) => row.runtime_query_key === key);
      return (
        selected.length === 5 &&
        new Set(selected.map((row) => row.ordered_top20_sha256)).size === 1
      );
    }),
  "variant ordered-pool identity failure",
);
const variants = manifest.variants as string[];
const summarize = (variant: string) => {
  const selected = rows.filter((row) => row.variant === variant);
  const strata = Object.fromEntries(
    [
      "conditional_merge",
      "compatible_history",
      "current_only",
      "hard_negative_current",
    ].map((stratum) => {
      const subset = selected.filter((row) => row.stratum === stratum);
      const implicit = subset.filter(
        (row) => row.both_evidence_coverage !== null,
      );
      return [
        stratum,
        {
          required_micro_recall_at_3:
            subset.reduce(
              (sum, row) => sum + row.required_hits_at_3,
              0,
            ) /
            subset.reduce((sum, row) => sum + row.required_count, 0),
          both_evidence_coverage:
            implicit.length > 0
              ? implicit.reduce(
                  (sum, row) => sum + row.both_evidence_coverage,
                  0,
                ) / implicit.length
              : null,
          unsafe_top3_hit_rate:
            subset.reduce(
              (sum, row) => sum + row.unsafe_top3_hit,
              0,
            ) / subset.length,
        },
      ];
    }),
  );
  return {
    variant,
    strata,
    overall_unsafe_top3_hit_rate:
      selected.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
      selected.length,
  };
};
const summaries = variants.map(summarize);
check(
  JSON.stringify(summaries) === JSON.stringify(result.summaries),
  "summary metrics do not independently reproduce",
);
const control = summaries[0];
const eligible = summaries
  .slice(1)
  .filter(
    (summary) =>
      summary.strata.current_only.required_micro_recall_at_3 >=
        control.strata.current_only.required_micro_recall_at_3 &&
      summary.strata.hard_negative_current.required_micro_recall_at_3 >=
        control.strata.hard_negative_current.required_micro_recall_at_3 &&
      summary.overall_unsafe_top3_hit_rate <=
        control.overall_unsafe_top3_hit_rate &&
      summary.strata.conditional_merge.required_micro_recall_at_3 >=
        control.strata.conditional_merge.required_micro_recall_at_3,
  );
check(
  JSON.stringify(eligible.map((summary) => summary.variant)) ===
    JSON.stringify(result.eligible_variants),
  "eligible variants do not reproduce",
);
check(
  result.selected_diagnostic_variant === "pair_score_g2.0_top6_anchor" &&
    result.control_reproduction_rate === 1 &&
    result.retrieval_calls_performed === 0 &&
    result.r2_14_rerun_performed === false,
  "selected variant or isolation claim does not reproduce",
);
check(
  r214Guard.status === "confirmation_failed_locked" &&
    r214Guard.retrieval_execution_count === 1,
  "R2.14 guard changed",
);
const selected = summaries.find(
  (summary) =>
    summary.variant === result.selected_diagnostic_variant,
)!;
const audit = {
  schema_version: "v5-r2.15-compatible-selectivity-audit-1",
  status: failures.length === 0 ? "audit_pass" : "audit_fail",
  development_only: true,
  retrieval_rerun_performed: false,
  retrieval_calls_performed: 0,
  diagnostic_execution_count: guard.execution_count,
  raw_row_count: rows.length,
  control_reproduction_rate: result.control_reproduction_rate,
  selected_diagnostic_variant: result.selected_diagnostic_variant,
  control_compatible_history_recall_at_3:
    control.strata.compatible_history.required_micro_recall_at_3,
  selected_compatible_history_recall_at_3:
    selected.strata.compatible_history.required_micro_recall_at_3,
  control_conditional_merge_recall_at_3:
    control.strata.conditional_merge.required_micro_recall_at_3,
  selected_conditional_merge_recall_at_3:
    selected.strata.conditional_merge.required_micro_recall_at_3,
  promotion_allowed: false,
  new_confirmation_required: true,
  r2_14_execution_count_preserved: r214Guard.retrieval_execution_count,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    execution_guard: sha256(guardText),
    raw_results: sha256(rawText),
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
