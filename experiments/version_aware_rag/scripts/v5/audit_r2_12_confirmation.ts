import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_12_frozen_confirmation");
const OUT = path.join(EXP, "results/v5/r2_12_confirmation");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [manifestText, guardText, rawText, resultText, r211GuardText] =
  await Promise.all([
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
  guard.status === "confirmation_failed_locked" &&
    guard.retrieval_execution_count === 1,
  "confirmation guard is not failed-and-locked at count 1",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_retrieval_sha256, "raw hash mismatch");
check(
  sha256(resultText) === guard.confirmation_result_sha256,
  "result hash mismatch",
);
check(rows.length === 64, "expected 64 query-variant rows");
check(
  new Set(rows.map((row) => `${row.runtime_query_key}\t${row.variant}`)).size ===
    64,
  "duplicate query-variant rows",
);
check(
  rows.every(
    (row) =>
      row.ordered_top20_ids.length === 20 &&
      row.top3.length === 3 &&
      sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256,
  ),
  "ordered pool or Top-3 integrity failure",
);
check(
  result.summaries[0].required_micro_recall_at_20 === 50 / 52 &&
    result.summaries[1].required_micro_recall_at_20 === 51 / 52,
  "candidate Recall@20 does not reproduce",
);
check(
  result.gate_passed === false &&
    Object.values(result.gate_checks).filter(Boolean).length === 5,
  "gate result does not reproduce",
);
check(
  r211Guard.status === "development_gate_failed_locked" &&
    r211Guard.retrieval_execution_count === 1,
  "R2.11 guard changed",
);
const audit = {
  schema_version: "v5-r2.12-confirmation-audit-1",
  status: failures.length === 0 ? "audit_pass" : "audit_fail",
  development_only: true,
  retrieval_rerun_performed: false,
  retrieval_execution_count: guard.retrieval_execution_count,
  raw_row_count: rows.length,
  baseline_required_recall_at_20: result.summaries[0].required_micro_recall_at_20,
  repaired_required_recall_at_20: result.summaries[1].required_micro_recall_at_20,
  gate_checks_passed: 5,
  gate_checks_failed: 3,
  gate_passed: false,
  promotion_allowed: false,
  r2_11_execution_count_preserved: r211Guard.retrieval_execution_count,
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
