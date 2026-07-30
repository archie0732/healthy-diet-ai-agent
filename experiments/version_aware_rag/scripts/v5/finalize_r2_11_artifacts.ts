import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CHECKSUM_PATH = path.join(
  EXP,
  "data/configs/v5_r2_11_development/ARTIFACT_CHECKSUMS.sha256",
);
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");

const priorChecksumText = await readFile(CHECKSUM_PATH, "utf8");
const priorPaths = priorChecksumText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^[0-9a-f]{64}  (.+)$/);
    if (!match) throw new Error(`Invalid prior checksum line: ${line}`);
    return match[1];
  });
const newPaths = [
  "V5_R2_11_IMPLICIT_MERGE_DEVELOPMENT_RESULT.md",
  "scripts/v5/freeze_r2_11_development.ts",
  "scripts/v5/run_r2_11_development.ts",
  "scripts/v5/audit_r2_11_development.ts",
  "scripts/v5/finalize_r2_11_artifacts.ts",
  "data/configs/v5_r2_11_frozen_development/PROJECT_OWNER_SIGNOFF_REMAINING_51.json",
  "data/configs/v5_r2_11_frozen_development/approved_remaining_51.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
  "data/configs/v5_r2_11_frozen_development/runtime_queries.role_neutral.jsonl",
  "data/configs/v5_r2_11_frozen_development/candidate_corpus.role_neutral.jsonl",
  "data/configs/v5_r2_11_frozen_development/judgments.sealed.jsonl",
  "data/configs/v5_r2_11_frozen_development/FROZEN_MANIFEST.json",
  "data/configs/v5_r2_11_frozen_development/EXECUTION_GUARD.json",
  "results/v5/r2_11_development/raw_retrieval_results.jsonl",
  "results/v5/r2_11_development/DEVELOPMENT_RESULT.json",
  "results/v5/r2_11_development/AUDIT.json",
];
const paths = [...new Set([...priorPaths, ...newPaths])].sort();
const lines: string[] = [];
for (const relativePath of paths) {
  const bytes = await readFile(path.join(EXP, relativePath));
  lines.push(`${sha256(bytes)}  ${relativePath}`);
}
const checksumText = `${lines.join("\n")}\n`;
await writeFile(CHECKSUM_PATH, checksumText, "utf8");

let verified = 0;
for (const line of lines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/)!;
  const bytes = await readFile(path.join(EXP, match[2]));
  if (sha256(bytes) !== match[1]) {
    throw new Error(`Post-write checksum verification failed: ${match[2]}`);
  }
  verified++;
}
console.log(
  JSON.stringify(
    {
      status: "finalized_checksum_pass",
      checksum_path: path.relative(EXP, CHECKSUM_PATH).replaceAll("\\", "/"),
      artifact_count: lines.length,
      verified_count: verified,
    },
    null,
    2,
  ),
);
