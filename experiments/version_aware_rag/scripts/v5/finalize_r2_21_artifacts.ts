import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_21_lexical_weighted_rrf/ARTIFACT_CHECKSUMS.sha256",
);
const paths = [
  "PAPER_HANDOFF_AFTER_R2_21.md",
  "R2_21_LEXICAL_WEIGHTED_RRF_DIAGNOSTIC_PROTOCOL.md",
  "V5_R2_21_LEXICAL_WEIGHTED_RRF_DIAGNOSTIC_RESULT.md",
  "data/configs/v5_r2_21_lexical_weighted_rrf/EXECUTION_GUARD.json",
  "data/configs/v5_r2_21_lexical_weighted_rrf/FROZEN_MANIFEST.json",
  "results/v5/r2_21_lexical_weighted_rrf/AUDIT.json",
  "results/v5/r2_21_lexical_weighted_rrf/DIAGNOSTIC_RESULT.json",
  "results/v5/r2_21_lexical_weighted_rrf/EMBEDDING_INTEGRITY.json",
  "results/v5/r2_21_lexical_weighted_rrf/raw_results.jsonl",
  "scripts/v5/audit_r2_21_lexical_weighted_rrf_diagnostic.ts",
  "scripts/v5/finalize_r2_21_artifacts.ts",
  "scripts/v5/freeze_r2_21_lexical_weighted_rrf_diagnostic.ts",
  "scripts/v5/run_r2_21_lexical_weighted_rrf_diagnostic.ts",
  "tests/unit/v5_r2_21_protocol.test.ts",
].sort();
const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const lines = [];
for (const relativePath of paths) {
  lines.push(`${sha256(await readFile(path.join(EXP, relativePath)))}  ${relativePath}`);
}
await writeFile(OUT, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ status: "r2_21_checksum_pass", artifact_count: lines.length }, null, 2));
