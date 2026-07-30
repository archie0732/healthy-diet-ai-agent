import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(EXP, "data/configs/v5_r2_17_candidate_recall_diagnostic");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const files = {
  protocol: "R2_17_CANDIDATE_RECALL_DIAGNOSTIC_PROTOCOL.md",
  runner: "scripts/v5/run_r2_17_candidate_recall_diagnostic.ts",
  queries: "data/configs/v5_r2_16_frozen_confirmation/runtime_queries.role_neutral.jsonl",
  corpus: "data/configs/v5_r2_16_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
  judgments: "data/configs/v5_r2_16_frozen_confirmation/judgments.sealed.jsonl",
  r216_guard: "data/configs/v5_r2_16_frozen_confirmation/EXECUTION_GUARD.json",
};
const inputs = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [
      key,
      { path: relativePath, sha256: sha256(await readFile(path.join(EXP, relativePath))) },
    ]),
  ),
);
const r216Guard = JSON.parse(
  await readFile(path.join(EXP, files.r216_guard), "utf8"),
);
if (
  r216Guard.status !== "confirmation_failed_locked" ||
  r216Guard.retrieval_execution_count !== 1
) {
  throw new Error("R2.16 must remain failed-and-locked at count 1.");
}
const manifest = {
  schema_version: "v5-r2.17-candidate-recall-diagnostic-manifest-1",
  status: "diagnostic_frozen_unlocked",
  development_only: true,
  outcome_exposed_r2_16_data: true,
  seed_counts: [8, 10, 12, 14],
  parameters: { bm25_k1: 1.2, bm25_b: 0.75, pool_size: 20 },
  inputs,
  r2_16_execution_count_before_diagnostic: 1,
  r2_16_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.17-candidate-recall-diagnostic-guard-1",
  status: "diagnostic_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  execution_count: 0,
  judgments_read_only_after_all_candidate_pools: true,
  r2_16_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(path.join(OUT, "EXECUTION_GUARD.json"), `${JSON.stringify(guard, null, 2)}\n`),
]);
console.log(JSON.stringify({ status: manifest.status, variants: 4, execution_count: 0 }, null, 2));
