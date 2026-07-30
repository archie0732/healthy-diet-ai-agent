import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUTPUT = path.join(
  EXP,
  "data/configs/v5_r2_12_candidate_recall_diagnostic/ARTIFACT_CHECKSUMS.sha256",
);
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const paths = [
  "R2_12_CANDIDATE_RECALL_REPAIR_PROTOCOL.md",
  "V5_R2_12_CANDIDATE_RECALL_DIAGNOSTIC_RESULT.md",
  "scripts/v5/freeze_r2_12_candidate_diagnostic.ts",
  "scripts/v5/run_r2_12_candidate_diagnostic.ts",
  "scripts/v5/audit_r2_12_candidate_diagnostic.ts",
  "scripts/v5/mine_r2_12_predeclared_candidate_groups.ts",
  "scripts/v5/review_r2_12_candidate_groups.ts",
  "scripts/v5/build_r2_12_confirmation_annotations.ts",
  "scripts/v5/freeze_r2_12_confirmation.ts",
  "scripts/v5/run_r2_12_confirmation.ts",
  "scripts/v5/audit_r2_12_confirmation.ts",
  "scripts/v5/finalize_r2_12_artifacts.ts",
  "src/retrieval/r2_12_candidate_generator.ts",
  "src/annotation/r2_12_confirmation_schema.ts",
  "src/annotation/validate_r2_12_confirmation.ts",
  "tests/unit/r2_12_candidate_generator.test.ts",
  "tests/unit/r2_12_confirmation_validator.test.ts",
  "tests/unit/v5_r2_12_protocol.test.ts",
  "data/configs/v5_r2_12_candidate_recall_diagnostic/FROZEN_DIAGNOSTIC_MANIFEST.json",
  "data/configs/v5_r2_12_candidate_recall_diagnostic/DIAGNOSTIC_GUARD.json",
  "data/configs/v5_r2_12_candidate_recall_diagnostic/R2_12_STATUS.json",
  "data/configs/v5_r2_12_candidate_recall_diagnostic/PROJECT_OWNER_CHECKPOINT_APPROVAL.json",
  "data/annotations_v5/r2_12_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
  "data/annotations_v5/r2_12_predeclared_candidate_groups/MANIFEST.json",
  "data/annotations_v5/r2_12_candidate_groups_codex_reviewed/semantic_review.jsonl",
  "data/annotations_v5/r2_12_candidate_groups_codex_reviewed/MANIFEST.json",
  "data/annotations_v5/r2_12_confirmation_codex_reviewed/provisional_annotations.jsonl",
  "data/annotations_v5/r2_12_confirmation_codex_reviewed/MANIFEST.json",
  "R2_12_CONFIRMATION_OWNER_REVIEW_PACKET.md",
  "V5_R2_12_CONFIRMATION_RESULT.md",
  "data/configs/v5_r2_12_frozen_confirmation/PROJECT_OWNER_SIGNOFF.json",
  "data/configs/v5_r2_12_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/runtime_queries.role_neutral.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/judgments.sealed.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/FROZEN_MANIFEST.json",
  "data/configs/v5_r2_12_frozen_confirmation/EXECUTION_GUARD.json",
  "results/v5/r2_12_confirmation/raw_retrieval_results.jsonl",
  "results/v5/r2_12_confirmation/CONFIRMATION_RESULT.json",
  "results/v5/r2_12_confirmation/AUDIT.json",
  "results/v5/r2_12_candidate_recall_diagnostic/raw_candidate_pools.jsonl",
  "results/v5/r2_12_candidate_recall_diagnostic/DIAGNOSTIC_RESULT.json",
  "results/v5/r2_12_candidate_recall_diagnostic/AUDIT.json",
];
const lines: string[] = [];
for (const relativePath of paths.sort()) {
  lines.push(
    `${sha256(await readFile(path.join(EXP, relativePath)))}  ${relativePath}`,
  );
}
await writeFile(OUTPUT, `${lines.join("\n")}\n`);
let verified = 0;
for (const line of lines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/)!;
  if (sha256(await readFile(path.join(EXP, match[2]))) !== match[1]) {
    throw new Error(`Checksum verification failed: ${match[2]}`);
  }
  verified++;
}
console.log(
  JSON.stringify(
    {
      status: "r2_12_artifact_checksum_pass",
      artifact_count: lines.length,
      verified_count: verified,
    },
    null,
    2,
  ),
);
