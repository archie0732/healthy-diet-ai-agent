import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(EXP, "data/configs/v5_r2_21_lexical_weighted_rrf");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const files = {
  protocol: "R2_21_LEXICAL_WEIGHTED_RRF_DIAGNOSTIC_PROTOCOL.md",
  runner: "scripts/v5/run_r2_21_lexical_weighted_rrf_diagnostic.ts",
  queries: "data/configs/v5_r2_20_frozen_confirmation/runtime_queries.role_neutral.jsonl",
  corpus: "data/configs/v5_r2_20_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
  judgments: "data/configs/v5_r2_20_frozen_confirmation/judgments.sealed.jsonl",
  r220_raw: "results/v5/r2_20_confirmation/raw_retrieval_results.jsonl",
  r220_result: "results/v5/r2_20_confirmation/CONFIRMATION_RESULT.json",
  r220_guard: "data/configs/v5_r2_20_frozen_confirmation/EXECUTION_GUARD.json",
  model_manifest: "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json",
};
const inputs = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [
      key,
      { path: relativePath, sha256: sha256(await readFile(path.join(EXP, relativePath))) },
    ]),
  ),
);
const [r220, result, model] = await Promise.all([
  readFile(path.join(EXP, files.r220_guard), "utf8").then(JSON.parse),
  readFile(path.join(EXP, files.r220_result), "utf8").then(JSON.parse),
  readFile(path.join(EXP, files.model_manifest), "utf8").then(JSON.parse),
]);
if (
  r220.status !== "confirmation_failed_locked" ||
  r220.retrieval_execution_count !== 1 ||
  result.gate_passed !== false
) throw new Error("R2.20 must remain failed-and-locked.");
if (
  model.revision !== "751bff37182d3f1213fa05d7196b954e230abad9" ||
  model.dtype !== "q8" ||
  model.dimensions !== 384
) throw new Error("R2.21 model boundary failed.");
for (const artifact of model.cache_artifacts) {
  const absolute = path.join(EXP, "data/models/v5_r2_19_minilm", artifact.path);
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Model cache mismatch: ${artifact.path}`);
  }
}
const variants = [
  "rrf_lex1_dense1_control",
  "rrf_lex2_dense1",
  "rrf_lex3_dense1",
];
const manifest = {
  schema_version: "v5-r2.21-lexical-weighted-rrf-manifest-1",
  status: "diagnostic_frozen_unlocked",
  development_only: true,
  outcome_exposed_r2_20_data: true,
  variants,
  parameters: {
    bm25_k1: 1.2, bm25_b: 0.75, rrf_k: 60, pool_size: 20,
    recency_weight: 0.2, pair_signal_weight: 2.0, anchor_rank: 6,
    lexical_weights: [1, 2, 3], dense_weight: 1,
  },
  model: {
    dtype: "q8", dimensions: 384,
    cache_root: "data/models/v5_r2_19_minilm/cache",
    local_model_directory:
      "data/models/v5_r2_19_minilm/cache/Xenova/all-MiniLM-L6-v2/751bff37182d3f1213fa05d7196b954e230abad9",
  },
  inputs,
  selection_order: [
    "current_only_recall_at_3_desc",
    "candidate_recall_at_20_desc",
    "combined_implicit_both_evidence_desc",
    "minimum_implicit_recall_at_3_desc",
    "declared_variant_order",
  ],
  prior_cycle_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.21-lexical-weighted-rrf-guard-1",
  status: "diagnostic_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  execution_count: 0,
  judgments_read_only_after_all_embeddings_pools_and_top3: true,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(path.join(OUT, "EXECUTION_GUARD.json"), `${JSON.stringify(guard, null, 2)}\n`),
]);
console.log(JSON.stringify({ status: manifest.status, variants: variants.length, execution_count: 0 }, null, 2));
