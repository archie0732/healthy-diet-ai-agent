import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/configs/v5_r2_12_candidate_recall_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const files = {
  protocol: "R2_12_CANDIDATE_RECALL_REPAIR_PROTOCOL.md",
  runner: "scripts/v5/run_r2_12_candidate_diagnostic.ts",
  queries:
    "data/configs/v5_r2_11_frozen_development/runtime_queries.role_neutral.jsonl",
  corpus:
    "data/configs/v5_r2_11_frozen_development/candidate_corpus.role_neutral.jsonl",
  judgments:
    "data/configs/v5_r2_11_frozen_development/judgments.sealed.jsonl",
  r211_manifest:
    "data/configs/v5_r2_11_frozen_development/FROZEN_MANIFEST.json",
  r211_guard:
    "data/configs/v5_r2_11_frozen_development/EXECUTION_GUARD.json",
};
const entries = await Promise.all(
  Object.entries(files).map(async ([key, relativePath]) => [
    key,
    {
      path: relativePath,
      sha256: sha256(await readFile(path.join(EXP, relativePath))),
    },
  ]),
);
const inputs = Object.fromEntries(entries);
const r211Guard = JSON.parse(
  await readFile(path.join(EXP, files.r211_guard), "utf8"),
);
if (
  r211Guard.status !== "development_gate_failed_locked" ||
  r211Guard.retrieval_execution_count !== 1
) {
  throw new Error("R2.11 must remain failed-and-locked at execution count 1.");
}
const manifest = {
  schema_version: "v5-r2.12-candidate-diagnostic-manifest-1",
  status: "diagnostic_frozen_unlocked",
  frozen_at: "2026-07-26T00:00:00.000+08:00",
  development_only: true,
  outcome_exposed_r2_11_data: true,
  promotion_evidence_allowed: false,
  variants: [
    "whole_query_bm25",
    "clause_rrf_k60",
    "bm25_group_expand_seed14",
    "clause_rrf_group_expand_seed14",
  ],
  parameters: {
    bm25_k1: 1.2,
    bm25_b: 0.75,
    pool_size: 20,
    rrf_k: 60,
    group_seed_count: 14,
    minimum_clause_token_count: 3,
  },
  inputs,
  r2_11_retrieval_execution_count_before_diagnostic: 1,
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_10_rerun_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.12-candidate-diagnostic-guard-1",
  status: "diagnostic_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  diagnostic_execution_count: 0,
  judgments_read_allowed_only_after_all_pools: true,
  r2_11_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "FROZEN_DIAGNOSTIC_MANIFEST.json"), manifestText),
  writeFile(
    path.join(OUT, "DIAGNOSTIC_GUARD.json"),
    `${JSON.stringify(guard, null, 2)}\n`,
  ),
]);
console.log(
  JSON.stringify(
    {
      status: manifest.status,
      variant_count: manifest.variants.length,
      r2_11_execution_count_preserved:
        manifest.r2_11_retrieval_execution_count_before_diagnostic,
    },
    null,
    2,
  ),
);
