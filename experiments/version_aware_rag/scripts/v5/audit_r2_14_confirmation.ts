import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_14_frozen_confirmation");
const OUT = path.join(EXP, "results/v5/r2_14_confirmation");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [
  manifestText,
  guardText,
  rawText,
  resultText,
  r211GuardText,
  r212GuardText,
  r213GuardText,
] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(OUT, "raw_retrieval_results.jsonl"), "utf8"),
  readFile(path.join(OUT, "CONFIRMATION_RESULT.json"), "utf8"),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_11_frozen_development/EXECUTION_GUARD.json",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_12_frozen_confirmation/EXECUTION_GUARD.json",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_13_top3_diagnostic/EXECUTION_GUARD.json",
    ),
    "utf8",
  ),
]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const rows = parseJsonl(rawText);
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};
check(
  guard.status === "confirmation_failed_locked" &&
    guard.retrieval_execution_count === 1,
  "R2.14 guard is not failed-and-locked at count 1",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_retrieval_sha256, "raw hash mismatch");
check(
  sha256(resultText) === guard.confirmation_result_sha256,
  "result hash mismatch",
);
check(rows.length === 64, "expected 64 query-variant rows");
check(
  new Set(
    rows.map((row) => `${row.runtime_query_key}\t${row.variant}`),
  ).size === 64,
  "duplicate query-variant rows",
);
check(
  rows.every(
    (row) =>
      row.ordered_top20_ids.length === 20 &&
      row.top3.length === 3 &&
      sha256(row.ordered_top20_ids.join("\n")) ===
        row.ordered_top20_sha256,
  ),
  "ordered pool or Top-3 integrity failure",
);
const queryKeys = [...new Set(rows.map((row) => row.runtime_query_key))];
check(
  queryKeys.every((key) => {
    const pair = rows.filter((row) => row.runtime_query_key === key);
    return (
      pair.length === 2 &&
      pair[0].ordered_top20_sha256 === pair[1].ordered_top20_sha256
    );
  }),
  "variants did not receive identical ordered Top-20 pools",
);

const variants = ["pair_score_g0.5", "pair_score_g2.0"];
const strata = [
  "conditional_merge",
  "compatible_history",
  "current_only",
  "hard_negative_current",
];
const recomputed = Object.fromEntries(
  variants.map((variant) => {
    const selected = rows.filter((row) => row.variant === variant);
    const byStratum = Object.fromEntries(
      strata.map((stratum) => {
        const subset = selected.filter((row) => row.stratum === stratum);
        const implicit = subset.filter(
          (row) => row.both_evidence_coverage !== null,
        );
        return [
          stratum,
          {
            recall_at_3:
              subset.reduce(
                (sum, row) => sum + row.required_hits_at_3,
                0,
              ) /
              subset.reduce((sum, row) => sum + row.required_count, 0),
            both_evidence:
              implicit.length > 0
                ? implicit.reduce(
                    (sum, row) => sum + row.both_evidence_coverage,
                    0,
                  ) / implicit.length
                : null,
            unsafe_rate:
              subset.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
              subset.length,
          },
        ];
      }),
    );
    return [
      variant,
      {
        recall_at_20:
          selected.reduce(
            (sum, row) => sum + row.required_hits_at_20,
            0,
          ) /
          selected.reduce((sum, row) => sum + row.required_count, 0),
        strata: byStratum,
        unsafe_rate:
          selected.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
          selected.length,
      },
    ];
  }),
);
const baseline = recomputed["pair_score_g0.5"];
const repaired = recomputed["pair_score_g2.0"];
const combinedBoth = (summary: any) =>
  (summary.strata.conditional_merge.both_evidence +
    summary.strata.compatible_history.both_evidence) /
  2;
const hardConstraints = {
  required_candidate_micro_recall_at_20_at_least_0_90:
    repaired.recall_at_20 >= 0.9,
  current_only_required_micro_recall_at_3_noninferior:
    repaired.strata.current_only.recall_at_3 >=
    baseline.strata.current_only.recall_at_3,
  hard_negative_required_micro_recall_at_3_noninferior:
    repaired.strata.hard_negative_current.recall_at_3 >=
    baseline.strata.hard_negative_current.recall_at_3,
  unsafe_top3_hit_rate_not_increased:
    repaired.unsafe_rate <= baseline.unsafe_rate,
  ordered_pool_and_execution_integrity: failures.length === 0,
};
const strictImprovements = {
  conditional_merge_required_micro_recall_at_3_strictly_improves:
    repaired.strata.conditional_merge.recall_at_3 >
    baseline.strata.conditional_merge.recall_at_3,
  compatible_history_required_micro_recall_at_3_strictly_improves:
    repaired.strata.compatible_history.recall_at_3 >
    baseline.strata.compatible_history.recall_at_3,
  implicit_both_evidence_coverage_strictly_improves:
    combinedBoth(repaired) > combinedBoth(baseline),
};
check(
  JSON.stringify(hardConstraints) ===
    JSON.stringify(result.hard_constraints),
  "hard constraints do not independently reproduce",
);
check(
  JSON.stringify(strictImprovements) ===
    JSON.stringify(result.strict_improvement_checks),
  "strict improvement checks do not independently reproduce",
);
check(
  Object.values(hardConstraints).every(Boolean) &&
    strictImprovements
      .compatible_history_required_micro_recall_at_3_strictly_improves ===
      false &&
    result.gate_passed === false,
  "R2.14 gate decision does not reproduce",
);
for (const [text, expectedStatus, countField] of [
  [r211GuardText, "development_gate_failed_locked", "retrieval_execution_count"],
  [r212GuardText, "confirmation_failed_locked", "retrieval_execution_count"],
  [r213GuardText, "top3_diagnostic_complete_locked", "execution_count"],
] as const) {
  const prior = JSON.parse(text);
  check(
    prior.status === expectedStatus && prior[countField] === 1,
    `prior-cycle guard changed: ${expectedStatus}`,
  );
}
const audit = {
  schema_version: "v5-r2.14-confirmation-audit-1",
  status: failures.length === 0 ? "audit_pass" : "audit_fail",
  development_only: true,
  retrieval_rerun_performed: false,
  retrieval_execution_count: guard.retrieval_execution_count,
  raw_row_count: rows.length,
  ordered_pool_identity_rate:
    queryKeys.filter((key) => {
      const pair = rows.filter((row) => row.runtime_query_key === key);
      return pair[0].ordered_top20_sha256 === pair[1].ordered_top20_sha256;
    }).length / queryKeys.length,
  baseline_required_recall_at_20: baseline.recall_at_20,
  repaired_required_recall_at_20: repaired.recall_at_20,
  baseline_compatible_history_recall_at_3:
    baseline.strata.compatible_history.recall_at_3,
  repaired_compatible_history_recall_at_3:
    repaired.strata.compatible_history.recall_at_3,
  hard_constraints_passed: Object.values(hardConstraints).filter(Boolean)
    .length,
  strict_improvements_passed: Object.values(strictImprovements).filter(
    Boolean,
  ).length,
  gate_passed: false,
  promotion_allowed: false,
  prior_cycle_execution_counts_preserved: true,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    execution_guard: sha256(guardText),
    raw_results: sha256(rawText),
    confirmation_result: sha256(resultText),
  },
  failures,
};
await writeFile(
  path.join(OUT, "AUDIT.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
