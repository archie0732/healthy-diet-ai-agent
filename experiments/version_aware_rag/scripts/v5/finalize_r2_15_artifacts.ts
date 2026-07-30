import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic/ARTIFACT_CHECKSUMS.sha256",
);
const paths = [
  "R2_15_COMPATIBLE_HISTORY_SELECTIVITY_DIAGNOSTIC_PROTOCOL.md",
  "R2_16_TOP6_ANCHORED_CONFIRMATION_PROTOCOL.md",
  "V5_R2_15_COMPATIBLE_SELECTIVITY_DIAGNOSTIC_RESULT.md",
  "scripts/v5/freeze_r2_15_compatible_selectivity_diagnostic.ts",
  "scripts/v5/run_r2_15_compatible_selectivity_diagnostic.ts",
  "scripts/v5/audit_r2_15_compatible_selectivity_diagnostic.ts",
  "scripts/v5/finalize_r2_15_artifacts.ts",
  "tests/unit/v5_r2_15_protocol.test.ts",
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic/runtime_trace.role_neutral.jsonl",
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic/FROZEN_MANIFEST.json",
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic/EXECUTION_GUARD.json",
  "results/v5/r2_15_compatible_selectivity_diagnostic/raw_top3_results.jsonl",
  "results/v5/r2_15_compatible_selectivity_diagnostic/DIAGNOSTIC_RESULT.json",
  "results/v5/r2_15_compatible_selectivity_diagnostic/AUDIT.json",
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
    { status: "r2_15_checksum_pass", artifact_count: lines.length },
    null,
    2,
  ),
);
