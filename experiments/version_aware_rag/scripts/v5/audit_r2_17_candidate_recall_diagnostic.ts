import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_17_candidate_recall_diagnostic");
const OUT = path.join(EXP, "results/v5/r2_17_candidate_recall_diagnostic");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const parse = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [manifestText, guardText, rawText, resultText, r216Text] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(OUT, "raw_candidate_results.jsonl"), "utf8"),
  readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
  readFile(path.join(EXP, "data/configs/v5_r2_16_frozen_confirmation/EXECUTION_GUARD.json"), "utf8"),
]);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const r216 = JSON.parse(r216Text);
const rows = parse(rawText);
const failures: string[] = [];
const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
check(guard.status === "diagnostic_complete_locked" && guard.execution_count === 1, "guard");
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash");
check(sha256(rawText) === guard.raw_results_sha256, "raw hash");
check(sha256(resultText) === guard.diagnostic_result_sha256, "result hash");
check(rows.length === 128, "row count");
check(rows.every((row) => row.ordered_top20_ids.length === 20 && sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256), "pool integrity");
const recalls = Object.fromEntries([8, 10, 12, 14].map((seed) => {
  const selected = rows.filter((row) => row.seed_count === seed);
  return [seed, selected.reduce((s, r) => s + r.required_hits_at_20, 0) / selected.reduce((s, r) => s + r.required_count, 0)];
}));
check(recalls[8] === 44 / 52 && recalls[10] === 43 / 52 && recalls[12] === 44 / 52 && recalls[14] === 42 / 52, "recall reproduction");
check(result.selected_diagnostic_variant === null && result.eligible_variants.length === 0 && result.confirmation_required === false, "selection");
check(r216.status === "confirmation_failed_locked" && r216.retrieval_execution_count === 1, "R2.16 changed");
const audit = {
  schema_version: "v5-r2.17-candidate-recall-diagnostic-audit-1",
  status: failures.length ? "audit_fail" : "audit_pass",
  diagnostic_execution_count: guard.execution_count,
  r2_16_rerun_performed: false,
  top3_reranking_performed: false,
  raw_row_count: rows.length,
  best_required_recall_at_20: Math.max(...Object.values(recalls) as number[]),
  selected_diagnostic_variant: null,
  new_confirmation_required: false,
  promotion_allowed: false,
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length ? 1 : 0);
