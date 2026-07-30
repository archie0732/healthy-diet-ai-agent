import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_18_candidate_failure_attribution");
const OUT = path.join(EXP, "results/v5/r2_18_candidate_failure_attribution");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parse = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const variants = [
  "bm25_seed12_control",
  "bm25_seed12_iterative_closure",
  "clause_rrf_seed12_iterative_closure",
  "hybrid_rank_fusion_seed12_iterative_closure",
];
const strata = [
  "conditional_merge",
  "compatible_history",
  "current_only",
  "hard_negative_current",
];
const [manifestText, guardText, rawText, resultText, r216Text] =
  await Promise.all([
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
    readFile(path.join(OUT, "raw_candidate_results.jsonl"), "utf8"),
    readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_16_frozen_confirmation/EXECUTION_GUARD.json",
      ),
      "utf8",
    ),
  ]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const r216 = JSON.parse(r216Text);
const rows = parse(rawText);
const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};
check(
  guard.status === "diagnostic_complete_locked" &&
    guard.execution_count === 1,
  "guard",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash");
check(sha256(rawText) === guard.raw_results_sha256, "raw hash");
check(sha256(resultText) === guard.diagnostic_result_sha256, "result hash");
check(
  JSON.stringify(manifest.variants) === JSON.stringify(variants),
  "variant order",
);
check(rows.length === 128, "row count");
check(
  rows.every(
    (row) =>
      row.ordered_top20_ids.length === 20 &&
      new Set(row.ordered_top20_ids).size === 20 &&
      sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256,
  ),
  "pool integrity",
);
const summaries = variants.map((variant) => {
  const selected = rows.filter((row) => row.variant === variant);
  const recall = (subset: any[]) =>
    subset.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
    subset.reduce((sum, row) => sum + row.required_count, 0);
  return {
    variant,
    required_micro_recall_at_20: recall(selected),
    stratum_recall_at_20: Object.fromEntries(
      strata.map((stratum) => [
        stratum,
        recall(selected.filter((row) => row.stratum === stratum)),
      ]),
    ),
  };
});
check(
  JSON.stringify(summaries) === JSON.stringify(result.summaries),
  "summary reproduction",
);
check(
  JSON.stringify(summaries.map((summary) => summary.required_micro_recall_at_20)) ===
    JSON.stringify([44 / 52, 44 / 52, 43 / 52, 43 / 52]),
  "recall reproduction",
);
const controlRows = new Map(
  rows
    .filter((row) => row.variant === variants[0])
    .map((row) => [row.runtime_query_key, row]),
);
const closureChanges = rows
  .filter((row) => row.variant === variants[1])
  .map((row) => ({
    query_id: row.query_id,
    hit_delta:
      row.required_hits_at_20 -
      controlRows.get(row.runtime_query_key).required_hits_at_20,
  }))
  .filter((row) => row.hit_delta !== 0);
check(
  closureChanges.filter((row) => row.hit_delta === 1).length === 1 &&
    closureChanges.filter((row) => row.hit_delta === -1).length === 1,
  "closure tradeoff",
);
check(
  result.status === "diagnostic_complete_no_eligible_repair" &&
    result.selected_diagnostic_variant === null &&
    result.eligible_variants.length === 0 &&
    result.confirmation_required === false,
  "selection",
);
check(
  r216.status === "confirmation_failed_locked" &&
    r216.retrieval_execution_count === 1,
  "R2.16 changed",
);
const audit = {
  schema_version: "v5-r2.18-candidate-failure-attribution-audit-1",
  status: failures.length ? "audit_fail" : "audit_pass",
  diagnostic_execution_count: guard.execution_count,
  r2_16_rerun_performed: false,
  raw_row_count: rows.length,
  ordered_pool_integrity: failures.includes("pool integrity") ? 0 : 1,
  required_micro_recall_at_20: Object.fromEntries(
    summaries.map((summary) => [
      summary.variant,
      summary.required_micro_recall_at_20,
    ]),
  ),
  iterative_closure_changes_vs_control: closureChanges,
  attribution:
    "Fixed-size group closure exchanged one recovered hit for one displaced hit; clause and hybrid lexical fusion reduced total recall.",
  selected_diagnostic_variant: null,
  new_confirmation_required: false,
  new_official_source_capacity_required_before_next_confirmation: true,
  semantic_or_dense_retrieval_research_required: true,
  promotion_allowed: false,
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length ? 1 : 0);
