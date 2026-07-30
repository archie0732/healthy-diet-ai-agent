import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_19_neural_hybrid_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const files = {
  protocol: "R2_19_SOURCE_EXPANDED_NEURAL_HYBRID_PROTOCOL.md",
  source_catalog: "SOURCE_CATALOG_R2_19_SUPPLEMENT.md",
  source_manifest: "data/corpus_v5_r2_19_draft/source_manifest.json",
  source_chunks: "data/corpus_v5_r2_19_draft/chunks.jsonl",
  model_manifest: "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json",
  initialization_attempt:
    "results/v5/r2_19_neural_hybrid_diagnostic/INITIALIZATION_ATTEMPT.json",
  runner: "scripts/v5/run_r2_19_neural_hybrid_diagnostic.ts",
  queries:
    "data/configs/v5_r2_16_frozen_confirmation/runtime_queries.role_neutral.jsonl",
  corpus:
    "data/configs/v5_r2_16_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
  judgments:
    "data/configs/v5_r2_16_frozen_confirmation/judgments.sealed.jsonl",
  r216_guard:
    "data/configs/v5_r2_16_frozen_confirmation/EXECUTION_GUARD.json",
  r218_guard:
    "data/configs/v5_r2_18_candidate_failure_attribution/EXECUTION_GUARD.json",
};
const inputs = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [
      key,
      {
        path: relativePath,
        sha256: sha256(await readFile(path.join(EXP, relativePath))),
      },
    ]),
  ),
);
const [r216, r218, model, sources, initialization] = await Promise.all([
  readFile(path.join(EXP, files.r216_guard), "utf8").then(JSON.parse),
  readFile(path.join(EXP, files.r218_guard), "utf8").then(JSON.parse),
  readFile(path.join(EXP, files.model_manifest), "utf8").then(JSON.parse),
  readFile(path.join(EXP, files.source_manifest), "utf8").then(JSON.parse),
  readFile(path.join(EXP, files.initialization_attempt), "utf8").then(
    JSON.parse,
  ),
]);
if (
  r216.status !== "confirmation_failed_locked" ||
  r216.retrieval_execution_count !== 1
) {
  throw new Error("R2.16 must remain failed-and-locked at count 1.");
}
if (
  r218.status !== "diagnostic_complete_locked" ||
  r218.execution_count !== 1 ||
  r218.selected_diagnostic_variant !== null
) {
  throw new Error("R2.18 must remain locked with no selected repair.");
}
if (
  model.status !== "model_cached_and_smoke_tested" ||
  model.revision !== "751bff37182d3f1213fa05d7196b954e230abad9" ||
  model.dtype !== "q8" ||
  model.dimensions !== 384 ||
  model.blocked_postinstall_scripts_executed !== false
) {
  throw new Error("R2.19 model manifest contract failed.");
}
for (const artifact of model.cache_artifacts) {
  const absolute = path.join(
    EXP,
    "data/models/v5_r2_19_minilm",
    artifact.path,
  );
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Model cache mismatch: ${artifact.path}`);
  }
}
for (const artifact of model.native_runtime) {
  const absolute = path.join(process.cwd(), artifact.path);
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Native runtime mismatch: ${artifact.path}`);
  }
}
if (
  sources.status !== "draft_source_corpus_not_gold" ||
  sources.document_count !== 4 ||
  sources.chunk_count !== 1694
) {
  throw new Error("R2.19 source-capacity contract failed.");
}
if (
  initialization.status !== "failed_before_model_load" ||
  initialization.embedding_count !== 0 ||
  initialization.candidate_pool_count !== 0 ||
  initialization.judgment_read_count !== 0 ||
  initialization.diagnostic_execution_count_after_attempt !== 0
) {
  throw new Error("R2.19 initialization-attempt record failed.");
}
const variants = [
  "bm25_seed12_control",
  "minilm_q8_dense_top20",
  "bm25_minilm_rrf_k60_top20",
  "bm25_minilm_rrf_k60_iterative_closure",
];
const manifest = {
  schema_version: "v5-r2.19-neural-hybrid-manifest-1",
  status: "diagnostic_frozen_unlocked",
  development_only: true,
  outcome_exposed_r2_16_data: true,
  source_expansion_frozen_not_used_in_exposed_diagnostic: true,
  variants,
  lexical_parameters: {
    bm25_k1: 1.2,
    bm25_b: 0.75,
    seed_count: 12,
    pool_size: 20,
    rrf_k: 60,
  },
  model: {
    id: model.model_id,
    revision: model.revision,
    dtype: model.dtype,
    pooling: model.pooling,
    normalization: model.normalization,
    dimensions: model.dimensions,
    device: model.device,
    cache_root: "data/models/v5_r2_19_minilm/cache",
    local_model_directory:
      "data/models/v5_r2_19_minilm/cache/Xenova/all-MiniLM-L6-v2/751bff37182d3f1213fa05d7196b954e230abad9",
    local_files_only: true,
    remote_loading_allowed: false,
  },
  eligibility: {
    minimum_required_micro_recall_at_20: 0.9,
    every_stratum_noninferior_to_control: true,
    ordered_pool_integrity: 1,
    embedding_integrity: 1,
  },
  selection_order: [
    "required_micro_recall_at_20_desc",
    "minimum_stratum_recall_at_20_desc",
    "declared_variant_order",
  ],
  inputs,
  r2_16_execution_count_before_diagnostic: 1,
  r2_18_execution_count_before_diagnostic: 1,
  r2_16_rerun_allowed: false,
  top3_reranking_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.19-neural-hybrid-guard-1",
  status: "diagnostic_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  execution_count: 0,
  judgments_read_only_after_all_embeddings_and_candidate_pools: true,
  remote_model_loading_allowed: false,
  blocked_postinstall_scripts_executed: false,
  r2_16_rerun_allowed: false,
  top3_reranking_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(
    path.join(OUT, "EXECUTION_GUARD.json"),
    `${JSON.stringify(guard, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify({
  status: manifest.status,
  variants: variants.length,
  source_documents: sources.document_count,
  source_chunks: sources.chunk_count,
  execution_count: 0,
}, null, 2));
