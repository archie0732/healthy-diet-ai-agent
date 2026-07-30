import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_20_frozen_confirmation");
const OUT = path.join(EXP, "results/v5/r2_20_confirmation");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const [
  manifestText,
  guardText,
  rawText,
  embeddingText,
  resultText,
  r216GuardText,
  r219GuardText,
  r210ChecksumsText,
] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(OUT, "raw_retrieval_results.jsonl"), "utf8"),
  readFile(path.join(OUT, "EMBEDDING_INTEGRITY.json"), "utf8"),
  readFile(path.join(OUT, "CONFIRMATION_RESULT.json"), "utf8"),
  readFile(path.join(EXP, "data/configs/v5_r2_16_frozen_confirmation/EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(EXP, "data/configs/v5_r2_19_neural_hybrid_diagnostic/EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(EXP, "results/v5/r2_10_fresh_test_cycle/ARTIFACT_CHECKSUMS.sha256"), "utf8"),
]);
const guard = JSON.parse(guardText);
const result = JSON.parse(resultText);
const embedding = JSON.parse(embeddingText);
const rows = parseJsonl(rawText);
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};
check(
  guard.status === "confirmation_failed_locked" &&
    guard.retrieval_execution_count === 1,
  "R2.20 is not failed-and-locked at count 1",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest hash mismatch");
check(sha256(rawText) === guard.raw_retrieval_sha256, "raw hash mismatch");
check(
  sha256(embeddingText) === guard.embedding_integrity_sha256,
  "embedding hash mismatch",
);
check(
  sha256(resultText) === guard.confirmation_result_sha256,
  "result hash mismatch",
);
check(rows.length === 64, "expected 64 rows");
check(
  rows.every(
    (row) =>
      row.ordered_top20_ids.length === 20 &&
      new Set(row.ordered_top20_ids).size === 20 &&
      row.top3.length === 3 &&
      sha256(row.ordered_top20_ids.join("\n")) === row.ordered_top20_sha256,
  ),
  "pool or Top-3 integrity failure",
);
check(
  embedding.document_embedding_count === 148 &&
    embedding.query_embedding_count === 32 &&
    embedding.dimensions.length === 1 &&
    embedding.dimensions[0] === 384 &&
    embedding.all_finite === true &&
    embedding.all_l2_normalized === true,
  "embedding integrity does not reproduce",
);
const variants = [
  "bm25_seed12_pair_score_g0.5",
  "bm25_minilm_rrf_k60_pair_score_g2.0_top6_anchor",
];
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
  recall20[variants[0]] === 47 / 52 &&
    recall20[variants[1]] === 51 / 52,
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
  stratumRecall(variants[0], "conditional_merge") === 13 / 20 &&
    stratumRecall(variants[1], "conditional_merge") === 15 / 20 &&
    stratumRecall(variants[0], "compatible_history") === 8 / 20 &&
    stratumRecall(variants[1], "compatible_history") === 10 / 20,
  "implicit Recall@3 does not reproduce",
);
check(
  stratumRecall(variants[0], "current_only") === 6 / 6 &&
    stratumRecall(variants[1], "current_only") === 5 / 6 &&
    stratumRecall(variants[0], "hard_negative_current") === 3 / 6 &&
    stratumRecall(variants[1], "hard_negative_current") === 4 / 6,
  "single-evidence Recall@3 does not reproduce",
);
check(
  result.hard_eligible === false &&
    result.hard_constraints
      .current_only_required_micro_recall_at_3_noninferior === false &&
    result.hard_constraints
      .required_candidate_micro_recall_at_20_at_least_0_90 === true &&
    Object.values(result.strict_improvement_checks).every(Boolean) &&
    result.gate_passed === false,
  "gate decision does not reproduce",
);
const r216 = JSON.parse(r216GuardText);
const r219 = JSON.parse(r219GuardText);
check(
  r216.status === "confirmation_failed_locked" &&
    r216.retrieval_execution_count === 1 &&
    r219.status === "diagnostic_complete_locked" &&
    r219.execution_count === 1,
  "prior-cycle guard changed",
);
const r210Rows = r210ChecksumsText.split(/\r?\n/).filter(Boolean);
check(r210Rows.length === 22, "R2.10 checksum archive count changed");
for (const row of r210Rows) {
  const match = row.match(/^([a-f0-9]{64})  (.+)$/);
  check(
    !!match &&
      sha256(await readFile(path.join(EXP, match?.[2] ?? ""))) === match?.[1],
    `R2.10 archive mismatch: ${row}`,
  );
}
const audit = {
  schema_version: "v5-r2.20-confirmation-audit-1",
  status: failures.length ? "audit_fail" : "audit_pass",
  development_only: true,
  retrieval_rerun_performed: false,
  retrieval_execution_count: guard.retrieval_execution_count,
  raw_row_count: rows.length,
  required_candidate_recall_at_20: recall20[variants[1]],
  current_only_required_recall_at_3: {
    baseline: stratumRecall(variants[0], "current_only"),
    repaired: stratumRecall(variants[1], "current_only"),
  },
  hard_constraints_passed: Object.values(result.hard_constraints).filter(Boolean).length,
  strict_improvements_passed: Object.values(result.strict_improvement_checks).filter(Boolean).length,
  r2_10_checksum_entries_verified: r210Rows.length,
  gate_passed: false,
  promotion_allowed: false,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    execution_guard: sha256(guardText),
    raw_results: sha256(rawText),
    embedding_integrity: sha256(embeddingText),
    confirmation_result: sha256(resultText),
  },
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length ? 1 : 0);
