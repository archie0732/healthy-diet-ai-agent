import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_14_frozen_confirmation/ARTIFACT_CHECKSUMS.sha256",
);
const paths = [
  "R2_14_GATE_FEASIBLE_TOP3_CONFIRMATION_PROTOCOL.md",
  "R2_14_CONFIRMATION_OWNER_REVIEW_PACKET.md",
  "V5_R2_14_CONFIRMATION_RESULT.md",
  "scripts/v5/mine_r2_14_candidate_groups.ts",
  "scripts/v5/review_r2_14_candidate_groups.ts",
  "scripts/v5/build_r2_14_confirmation_annotations.ts",
  "scripts/v5/freeze_r2_14_confirmation.ts",
  "scripts/v5/run_r2_14_confirmation.ts",
  "scripts/v5/audit_r2_14_confirmation.ts",
  "scripts/v5/finalize_r2_14_artifacts.ts",
  "src/annotation/r2_14_confirmation_schema.ts",
  "src/annotation/validate_r2_14_confirmation.ts",
  "tests/unit/v5_r2_14_protocol.test.ts",
  "data/annotations_v5/r2_14_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
  "data/annotations_v5/r2_14_predeclared_candidate_groups/MANIFEST.json",
  "data/annotations_v5/r2_14_candidate_groups_codex_reviewed/semantic_review.jsonl",
  "data/annotations_v5/r2_14_candidate_groups_codex_reviewed/MANIFEST.json",
  "data/annotations_v5/r2_14_confirmation_codex_reviewed/provisional_annotations.jsonl",
  "data/annotations_v5/r2_14_confirmation_codex_reviewed/MANIFEST.json",
  "data/configs/v5_r2_14_frozen_confirmation/PROJECT_OWNER_SIGNOFF.json",
  "data/configs/v5_r2_14_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_14_frozen_confirmation/runtime_queries.role_neutral.jsonl",
  "data/configs/v5_r2_14_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
  "data/configs/v5_r2_14_frozen_confirmation/judgments.sealed.jsonl",
  "data/configs/v5_r2_14_frozen_confirmation/FROZEN_MANIFEST.json",
  "data/configs/v5_r2_14_frozen_confirmation/EXECUTION_GUARD.json",
  "results/v5/r2_14_confirmation/raw_retrieval_results.jsonl",
  "results/v5/r2_14_confirmation/CONFIRMATION_RESULT.json",
  "results/v5/r2_14_confirmation/AUDIT.json",
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
    { status: "r2_14_checksum_pass", artifact_count: lines.length },
    null,
    2,
  ),
);
