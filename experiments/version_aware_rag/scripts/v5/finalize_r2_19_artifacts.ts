import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const EXP = path.join(ROOT, "experiments/version_aware_rag");
const MODEL_ROOT = path.join(EXP, "data/models/v5_r2_19_minilm");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_19_neural_hybrid_diagnostic/ARTIFACT_CHECKSUMS.sha256",
);
const model = JSON.parse(
  await readFile(path.join(MODEL_ROOT, "MODEL_MANIFEST.json"), "utf8"),
);
const paths = [
  "R2_19_SOURCE_EXPANDED_NEURAL_HYBRID_PROTOCOL.md",
  "SOURCE_CATALOG_R2_19_SUPPLEMENT.md",
  "V5_R2_19_NEURAL_HYBRID_DIAGNOSTIC_RESULT.md",
  "data/configs/v5_r2_19_neural_hybrid_diagnostic/EXECUTION_GUARD.json",
  "data/configs/v5_r2_19_neural_hybrid_diagnostic/FROZEN_MANIFEST.json",
  "data/corpus_v5_r2_19_draft/chunks.jsonl",
  "data/corpus_v5_r2_19_draft/source_manifest.json",
  "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json",
  "data/sources_v5/r2_19/who_nss_systematic_review_2022.pdf",
  "data/sources_v5/r2_19/who_physical_activity_web_annex_2020.pdf",
  "data/sources_v5/r2_19/who_potassium_adverse_effects_review_2012.pdf",
  "data/sources_v5/r2_19/who_potassium_drinking_water_background.pdf",
  "results/v5/r2_19_neural_hybrid_diagnostic/AUDIT.json",
  "results/v5/r2_19_neural_hybrid_diagnostic/DIAGNOSTIC_RESULT.json",
  "results/v5/r2_19_neural_hybrid_diagnostic/EMBEDDING_INTEGRITY.json",
  "results/v5/r2_19_neural_hybrid_diagnostic/INITIALIZATION_ATTEMPT.json",
  "results/v5/r2_19_neural_hybrid_diagnostic/raw_candidate_results.jsonl",
  "scripts/v5/audit_r2_19_neural_hybrid_diagnostic.ts",
  "scripts/v5/finalize_r2_19_artifacts.ts",
  "scripts/v5/freeze_r2_19_neural_hybrid_diagnostic.ts",
  "scripts/v5/prepare_r2_19_minilm_model.ts",
  "scripts/v5/prepare_r2_19_sources.ts",
  "scripts/v5/run_r2_19_neural_hybrid_diagnostic.ts",
  "tests/unit/v5_r2_19_protocol.test.ts",
  ...model.cache_artifacts.map(
    (artifact: any) => `data/models/v5_r2_19_minilm/${artifact.path}`,
  ),
].sort();
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const lines = [];
for (const relativePath of paths) {
  lines.push(
    `${sha256(await readFile(path.join(EXP, relativePath)))}  ${relativePath}`,
  );
}
for (const artifact of model.native_runtime) {
  lines.push(
    `${sha256(await readFile(path.join(ROOT, artifact.path)))}  ${artifact.path}`,
  );
}
await writeFile(OUT, `${lines.sort().join("\n")}\n`);
console.log(JSON.stringify({
  status: "r2_19_checksum_pass",
  artifact_count: lines.length,
}, null, 2));
