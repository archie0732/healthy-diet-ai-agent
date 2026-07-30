import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_18_candidate_failure_attribution/ARTIFACT_CHECKSUMS.sha256",
);
const paths = [
  "R2_18_CANDIDATE_FAILURE_ATTRIBUTION_PROTOCOL.md",
  "V5_R2_18_CANDIDATE_FAILURE_ATTRIBUTION_RESULT.md",
  "data/configs/v5_r2_18_candidate_failure_attribution/EXECUTION_GUARD.json",
  "data/configs/v5_r2_18_candidate_failure_attribution/FROZEN_MANIFEST.json",
  "results/v5/r2_18_candidate_failure_attribution/AUDIT.json",
  "results/v5/r2_18_candidate_failure_attribution/DIAGNOSTIC_RESULT.json",
  "results/v5/r2_18_candidate_failure_attribution/raw_candidate_results.jsonl",
  "scripts/v5/audit_r2_18_candidate_failure_attribution.ts",
  "scripts/v5/finalize_r2_18_artifacts.ts",
  "scripts/v5/freeze_r2_18_candidate_failure_attribution.ts",
  "scripts/v5/run_r2_18_candidate_failure_attribution.ts",
  "tests/unit/v5_r2_18_protocol.test.ts",
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
    { status: "r2_18_checksum_pass", artifact_count: lines.length },
    null,
    2,
  ),
);
