import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_20_frozen_confirmation/ARTIFACT_CHECKSUMS.sha256",
);
const paths = [
  "R2_20_CONFIRMATION_OWNER_REVIEW_PACKET.md",
  "R2_20_NEURAL_HYBRID_CONFIRMATION_PROTOCOL.md",
  "V5_R2_20_NEURAL_HYBRID_CONFIRMATION_RESULT.md",
  "data/annotations_v5/r2_20_annotation_authoring_plan/MANIFEST.json",
  "data/annotations_v5/r2_20_annotation_authoring_plan/authoring_plan.frozen.jsonl",
  "data/annotations_v5/r2_20_candidate_groups_codex_reviewed/MANIFEST.json",
  "data/annotations_v5/r2_20_candidate_groups_codex_reviewed/semantic_review.jsonl",
  "data/annotations_v5/r2_20_confirmation_codex_reviewed/MANIFEST.json",
  "data/annotations_v5/r2_20_confirmation_codex_reviewed/provisional_annotations.jsonl",
  "data/annotations_v5/r2_20_predeclared_candidate_groups/MANIFEST.json",
  "data/annotations_v5/r2_20_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
  "data/configs/v5_r2_19_neural_hybrid_diagnostic/ARTIFACT_CHECKSUMS.sha256",
  "data/configs/v5_r2_20_frozen_confirmation/EXECUTION_GUARD.json",
  "data/configs/v5_r2_20_frozen_confirmation/FROZEN_MANIFEST.json",
  "data/configs/v5_r2_20_frozen_confirmation/PROJECT_OWNER_SIGNOFF.json",
  "data/configs/v5_r2_20_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
  "data/configs/v5_r2_20_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_20_frozen_confirmation/judgments.sealed.jsonl",
  "data/configs/v5_r2_20_frozen_confirmation/runtime_queries.role_neutral.jsonl",
  "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json",
  "results/v5/r2_20_confirmation/AUDIT.json",
  "results/v5/r2_20_confirmation/CONFIRMATION_RESULT.json",
  "results/v5/r2_20_confirmation/EMBEDDING_INTEGRITY.json",
  "results/v5/r2_20_confirmation/INITIALIZATION_ATTEMPT.json",
  "results/v5/r2_20_confirmation/raw_retrieval_results.jsonl",
  "scripts/v5/audit_r2_20_neural_hybrid_confirmation.ts",
  "scripts/v5/build_r2_20_confirmation_annotations.ts",
  "scripts/v5/finalize_r2_20_artifacts.ts",
  "scripts/v5/freeze_r2_20_annotation_authoring_plan.ts",
  "scripts/v5/freeze_r2_20_neural_hybrid_confirmation.ts",
  "scripts/v5/mine_r2_20_candidate_groups.ts",
  "scripts/v5/r2_20_annotation_specs.ts",
  "scripts/v5/review_r2_20_candidate_groups.ts",
  "scripts/v5/run_r2_20_neural_hybrid_confirmation.ts",
  "src/annotation/r2_20_confirmation_schema.ts",
  "src/annotation/validate_r2_20_confirmation.ts",
  "tests/unit/v5_r2_20_protocol.test.ts",
].sort();
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const lines = [];
for (const relativePath of paths) {
  lines.push(
    `${sha256(await readFile(path.join(EXP, relativePath)))}  ${relativePath}`,
  );
}
await writeFile(OUT, `${lines.join("\n")}\n`);
console.log(
  JSON.stringify(
    {
      status: "r2_20_checksum_pass",
      artifact_count: lines.length,
    },
    null,
    2,
  ),
);
