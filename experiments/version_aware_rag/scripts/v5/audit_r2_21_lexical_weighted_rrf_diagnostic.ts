import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_21_lexical_weighted_rrf");
const OUT = path.join(EXP, "results/v5/r2_21_lexical_weighted_rrf");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [manifestText, guardText, rawText, embeddingText, resultText, r220GuardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
    readFile(path.join(OUT, "raw_results.jsonl"), "utf8"),
    readFile(path.join(OUT, "EMBEDDING_INTEGRITY.json"), "utf8"),
    readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
    readFile(path.join(EXP, "data/configs/v5_r2_20_frozen_confirmation/EXECUTION_GUARD.json"), "utf8"),
  ]);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const rows = parseJsonl(rawText);
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};
check(
  guard.status === "diagnostic_complete_locked" && guard.execution_count === 1,
  "R2.21 guard is not locked at one",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_results_sha256, "raw hash mismatch");
check(sha256(embeddingText) === guard.embedding_integrity_sha256, "embedding hash mismatch");
check(sha256(resultText) === guard.diagnostic_result_sha256, "result hash mismatch");
check(rows.length === 96, "expected 96 rows");
check(rows.every((row) =>
  row.ordered_top20_ids.length === 20 &&
  new Set(row.ordered_top20_ids).size === 20 &&
  row.top3.length === 3 &&
  sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256),
  "ordered output integrity failed",
);
check(
  result.control_reproduced_exactly === true &&
  result.selected_diagnostic_variant === null &&
  result.eligible_variants.length === 0 &&
  result.summaries[0].required_micro_recall_at_20 === 51 / 52 &&
  result.summaries[1].required_micro_recall_at_20 === 51 / 52 &&
  result.summaries[2].required_micro_recall_at_20 === 50 / 52 &&
  result.summaries.every(
    (summary: any) =>
      summary.strata.current_only.required_micro_recall_at_3 === 5 / 6,
  ),
  "diagnostic decision does not reproduce",
);
const r220 = JSON.parse(r220GuardText);
check(
  r220.status === "confirmation_failed_locked" &&
  r220.retrieval_execution_count === 1,
  "R2.20 guard changed",
);
const audit = {
  schema_version: "v5-r2.21-lexical-weighted-rrf-audit-1",
  status: failures.length ? "audit_fail" : "audit_pass",
  retrieval_rerun_performed: false,
  execution_count: guard.execution_count,
  raw_row_count: rows.length,
  control_reproduced_exactly: result.control_reproduced_exactly,
  eligible_variant_count: result.eligible_variants.length,
  selected_diagnostic_variant: result.selected_diagnostic_variant,
  promotion_allowed: false,
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length ? 1 : 0);
