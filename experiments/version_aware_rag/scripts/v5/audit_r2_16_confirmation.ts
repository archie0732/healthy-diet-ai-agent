import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_16_frozen_confirmation");
const OUT = path.join(EXP, "results/v5/r2_16_confirmation");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [manifestText, guardText, rawText, resultText, r214GuardText, r215GuardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
    readFile(path.join(OUT, "raw_retrieval_results.jsonl"), "utf8"),
    readFile(path.join(OUT, "CONFIRMATION_RESULT.json"), "utf8"),
    readFile(path.join(EXP, "data/configs/v5_r2_14_frozen_confirmation/EXECUTION_GUARD.json"), "utf8"),
    readFile(path.join(EXP, "data/configs/v5_r2_15_compatible_selectivity_diagnostic/EXECUTION_GUARD.json"), "utf8"),
  ]);
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
  "R2.16 is not failed-and-locked at count 1",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_retrieval_sha256, "raw hash mismatch");
check(sha256(resultText) === guard.confirmation_result_sha256, "result hash mismatch");
check(rows.length === 64, "expected 64 rows");
check(
  rows.every(
    (row) =>
      row.ordered_top20_ids.length === 20 &&
      row.top3.length === 3 &&
      sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256,
  ),
  "pool or Top-3 integrity failure",
);
const keys = [...new Set(rows.map((row) => row.runtime_query_key))];
check(
  keys.every((key) => {
    const pair = rows.filter((row) => row.runtime_query_key === key);
    return pair.length === 2 && pair[0].ordered_top20_sha256 === pair[1].ordered_top20_sha256;
  }),
  "variant pools differ",
);
const variants = ["pair_score_g0.5", "pair_score_g2.0_top6_anchor"];
const recall20 = Object.fromEntries(
  variants.map((variant) => {
    const selected = rows.filter((row) => row.variant === variant);
    return [
      variant,
      selected.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
        selected.reduce((sum, row) => sum + row.required_count, 0),
    ];
  }),
);
check(
  recall20["pair_score_g2.0_top6_anchor"] === 42 / 52 &&
    recall20["pair_score_g0.5"] === 42 / 52,
  "candidate Recall@20 does not reproduce",
);
const stratumRecall = (variant: string, stratum: string) => {
  const selected = rows.filter(
    (row) => row.variant === variant && row.stratum === stratum,
  );
  return (
    selected.reduce((sum, row) => sum + row.required_hits_at_3, 0) /
    selected.reduce((sum, row) => sum + row.required_count, 0)
  );
};
check(
  stratumRecall(variants[0], "conditional_merge") === 0.35 &&
    stratumRecall(variants[1], "conditional_merge") === 0.45 &&
    stratumRecall(variants[0], "compatible_history") === 0.25 &&
    stratumRecall(variants[1], "compatible_history") === 0.3,
  "implicit Recall@3 does not reproduce",
);
check(
  result.hard_eligible === false &&
    result.hard_constraints.required_candidate_micro_recall_at_20_at_least_0_90 === false &&
    Object.values(result.strict_improvement_checks).every(Boolean) &&
    result.gate_passed === false,
  "gate decision does not reproduce",
);
const r214 = JSON.parse(r214GuardText);
const r215 = JSON.parse(r215GuardText);
check(
  r214.status === "confirmation_failed_locked" &&
    r214.retrieval_execution_count === 1 &&
    r215.status === "diagnostic_complete_locked" &&
    r215.execution_count === 1,
  "prior-cycle guard changed",
);
const audit = {
  schema_version: "v5-r2.16-confirmation-audit-1",
  status: failures.length ? "audit_fail" : "audit_pass",
  development_only: true,
  retrieval_rerun_performed: false,
  retrieval_execution_count: guard.retrieval_execution_count,
  raw_row_count: rows.length,
  ordered_pool_identity_rate: 1,
  required_candidate_recall_at_20: recall20["pair_score_g2.0_top6_anchor"],
  hard_constraints_passed: Object.values(result.hard_constraints).filter(Boolean).length,
  strict_improvements_passed: Object.values(result.strict_improvement_checks).filter(Boolean).length,
  gate_passed: false,
  promotion_allowed: false,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    execution_guard: sha256(guardText),
    raw_results: sha256(rawText),
    confirmation_result: sha256(resultText),
  },
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length ? 1 : 0);
