import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_13_top3_diagnostic");
const OUT = path.join(EXP, "results/v5/r2_13_top3_diagnostic");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const [manifestText, guardText, rawText, resultText, r212GuardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
    readFile(path.join(OUT, "raw_top3_results.jsonl"), "utf8"),
    readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_12_frozen_confirmation/EXECUTION_GUARD.json",
      ),
      "utf8",
    ),
  ]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const r212Guard = JSON.parse(r212GuardText);
const rows = rawText.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};
check(
  guard.status === "top3_diagnostic_complete_locked" &&
    guard.execution_count === 1,
  "R2.13 guard mismatch",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_results_sha256, "raw hash mismatch");
check(sha256(resultText) === guard.diagnostic_result_sha256, "result hash mismatch");
check(rows.length === 160, "expected 160 query-variant rows");
check(
  rows.every(
    (row) =>
      row.top3.length === 3 &&
      sha256(row.top3.join("\n")) === row.top3_sha256,
  ),
  "Top-3 integrity mismatch",
);
check(
  r212Guard.status === "confirmation_failed_locked" &&
    r212Guard.retrieval_execution_count === 1,
  "R2.12 guard changed",
);
const quota = result.summaries.find(
  (summary: any) => summary.variant === "pair_quota_g0.5",
);
const g2 = result.summaries.find(
  (summary: any) => summary.variant === "pair_score_g2.0",
);
check(
  quota.strata.hard_negative_current.required_micro_recall_at_3 === 1 / 3,
  "quota hard-negative regression does not reproduce",
);
check(
  g2.strata.conditional_merge.required_micro_recall_at_3 === 0.5 &&
    g2.strata.compatible_history.required_micro_recall_at_3 === 0.4 &&
    g2.strata.current_only.required_micro_recall_at_3 === 0.5 &&
    g2.strata.hard_negative_current.required_micro_recall_at_3 === 0.5,
  "g2 gate-feasible pattern does not reproduce",
);
const audit = {
  schema_version: "v5-r2.13-top3-diagnostic-audit-1",
  status: failures.length === 0 ? "audit_pass" : "audit_fail",
  development_only: true,
  outcome_exposed_r2_12_data: true,
  promotion_evidence: false,
  diagnostic_execution_count: guard.execution_count,
  r2_12_execution_count_preserved: r212Guard.retrieval_execution_count,
  preregistered_selected_variant: result.selected_diagnostic_variant,
  selection_rule_defect:
    "The weighted selector preferred pair quota despite a hard-negative noninferiority failure.",
  gate_feasible_diagnostic_variant: "pair_score_g2.0",
  new_preregistration_required_before_confirmation: true,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    execution_guard: sha256(guardText),
    raw_results: sha256(rawText),
    diagnostic_result: sha256(resultText),
  },
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
