import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(
  EXP,
  "data/configs/v5_r2_19_neural_hybrid_diagnostic",
);
const OUT = path.join(EXP, "results/v5/r2_19_neural_hybrid_diagnostic");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parse = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const variants = [
  "bm25_seed12_control",
  "minilm_q8_dense_top20",
  "bm25_minilm_rrf_k60_top20",
  "bm25_minilm_rrf_k60_iterative_closure",
];
const strata = [
  "conditional_merge",
  "compatible_history",
  "current_only",
  "hard_negative_current",
];
const [
  manifestText,
  guardText,
  rawText,
  embeddingText,
  resultText,
  r216Text,
  initializationText,
] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(OUT, "raw_candidate_results.jsonl"), "utf8"),
  readFile(path.join(OUT, "EMBEDDING_INTEGRITY.json"), "utf8"),
  readFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), "utf8"),
  readFile(
    path.join(
      EXP,
      "data/configs/v5_r2_16_frozen_confirmation/EXECUTION_GUARD.json",
    ),
    "utf8",
  ),
  readFile(path.join(OUT, "INITIALIZATION_ATTEMPT.json"), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const embedding = JSON.parse(embeddingText);
const result = JSON.parse(resultText);
const r216 = JSON.parse(r216Text);
const initialization = JSON.parse(initializationText);
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
check(
  sha256(embeddingText) === guard.embedding_integrity_sha256,
  "embedding hash",
);
check(
  sha256(resultText) === guard.diagnostic_result_sha256,
  "result hash",
);
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
check(
  embedding.document_embedding_count === 140 &&
    embedding.query_embedding_count === 32 &&
    JSON.stringify(embedding.dimensions) === JSON.stringify([384]) &&
    embedding.all_finite === true &&
    embedding.all_l2_normalized === true,
  "embedding integrity",
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
  JSON.stringify(
    summaries.map((summary) => summary.required_micro_recall_at_20),
  ) === JSON.stringify([44 / 52, 49 / 52, 50 / 52, 49 / 52]),
  "recall reproduction",
);
check(
  JSON.stringify(result.eligible_variants) ===
    JSON.stringify(variants.slice(1)) &&
    result.selected_diagnostic_variant === variants[2] &&
    result.new_lineage_disjoint_confirmation_required === true,
  "selection",
);
check(
  initialization.status === "failed_before_model_load" &&
    initialization.embedding_count === 0 &&
    initialization.candidate_pool_count === 0 &&
    initialization.judgment_read_count === 0 &&
    initialization.diagnostic_execution_count_after_attempt === 0,
  "initialization record",
);
check(
  r216.status === "confirmation_failed_locked" &&
    r216.retrieval_execution_count === 1,
  "R2.16 changed",
);
const sourceManifest = JSON.parse(
  await readFile(
    path.join(EXP, manifest.inputs.source_manifest.path),
    "utf8",
  ),
);
check(
  sourceManifest.document_count === 4 &&
    sourceManifest.chunk_count === 1694 &&
    sourceManifest.documents.every(
      (document: any) =>
        document.pdf_header_verified &&
        document.text_extraction_verified &&
        document.visual_verification_completed,
    ),
  "source capacity",
);
const audit = {
  schema_version: "v5-r2.19-neural-hybrid-audit-1",
  status: failures.length ? "audit_fail" : "audit_pass",
  diagnostic_execution_count: guard.execution_count,
  initialization_failures_before_execution: 1,
  initialization_failure_judgment_reads: 0,
  r2_16_rerun_performed: false,
  top3_reranking_performed: false,
  raw_row_count: rows.length,
  ordered_pool_integrity: failures.includes("pool integrity") ? 0 : 1,
  embedding_integrity: failures.includes("embedding integrity") ? 0 : 1,
  required_micro_recall_at_20: Object.fromEntries(
    summaries.map((summary) => [
      summary.variant,
      summary.required_micro_recall_at_20,
    ]),
  ),
  selected_diagnostic_variant: result.selected_diagnostic_variant,
  new_source_document_count: sourceManifest.document_count,
  new_source_chunk_count: sourceManifest.chunk_count,
  new_lineage_disjoint_confirmation_required: true,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
  failures,
};
await writeFile(path.join(OUT, "AUDIT.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length ? 1 : 0);
