import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_11_frozen_development");
const RESULT_DIR = path.join(EXP, "results/v5/r2_11_development");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const close = (left: number, right: number) =>
  Math.abs(left - right) <= Number.EPSILON * 16;

const [
  rawText,
  resultText,
  manifestText,
  guardText,
  signoffText,
  runnerText,
  r210ChecksumText,
] = await Promise.all([
  readFile(path.join(RESULT_DIR, "raw_retrieval_results.jsonl"), "utf8"),
  readFile(path.join(RESULT_DIR, "DEVELOPMENT_RESULT.json"), "utf8"),
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  readFile(
    path.join(CONFIG, "PROJECT_OWNER_SIGNOFF_REMAINING_51.json"),
    "utf8",
  ),
  readFile(path.join(EXP, "scripts/v5/run_r2_11_development.ts"), "utf8"),
  readFile(
    path.join(
      EXP,
      "results/v5/r2_10_fresh_test_cycle/ARTIFACT_CHECKSUMS.sha256",
    ),
    "utf8",
  ),
]);

const rows = parseJsonl(rawText);
const result = JSON.parse(resultText);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const signoff = JSON.parse(signoffText);
const failures: string[] = [];
const check = (condition: boolean, message: string) => {
  if (!condition) failures.push(message);
};

check(sha256(rawText) === guard.raw_retrieval_sha256, "raw checksum mismatch");
check(
  sha256(resultText) === guard.development_result_sha256,
  "result checksum mismatch",
);
check(sha256(manifestText) === guard.manifest_sha256, "manifest checksum mismatch");
check(sha256(runnerText) === manifest.runner_sha256, "runner checksum mismatch");
check(
  guard.status === "development_gate_failed_locked" &&
    guard.retrieval_execution_count === 1,
  "execution guard is not failed-and-locked at count 1",
);
check(
  signoff.owner_statement === "核准全部 51 筆" &&
    signoff.approved_record_count === 51 &&
    signoff.retrieval_outcomes_observed === false,
  "remaining owner approval is not exact and pre-outcome",
);
check(
  rows.length ===
    manifest.runtime_query_count * result.systems_executed.length,
  "raw row count mismatch",
);

const uniquePairs = new Set(
  rows.map((row) => `${row.runtime_query_key}\t${row.system}`),
);
check(uniquePairs.size === rows.length, "duplicate query-system rows");
check(
  rows.every(
    (row) =>
      row.shared_candidate_pool_ids.length ===
        manifest.retrieval.candidate_pool_size &&
      row.full_scores.length === manifest.retrieval.candidate_pool_size &&
      row.top3.length === manifest.retrieval.top_k &&
      Object.values(row.latency_ms).every(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      ),
  ),
  "pool, Top-3, score, or latency contract mismatch",
);

const byQuery = new Map<string, any[]>();
for (const row of rows) {
  const selected = byQuery.get(row.runtime_query_key) ?? [];
  selected.push(row);
  byQuery.set(row.runtime_query_key, selected);
}
const sharedPoolIdentity = [...byQuery.values()].every(
  (queryRows) =>
    queryRows.length === result.systems_executed.length &&
    queryRows.every(
      (row) =>
        row.shared_candidate_pool_hash ===
          queryRows[0].shared_candidate_pool_hash &&
        JSON.stringify(row.shared_candidate_pool_ids) ===
          JSON.stringify(queryRows[0].shared_candidate_pool_ids) &&
        JSON.stringify(row.shared_candidate_pool_scores) ===
          JSON.stringify(queryRows[0].shared_candidate_pool_scores),
    ),
);
check(sharedPoolIdentity, "shared candidate pool identity failed");

for (const row of rows) {
  const required = new Set<string>(row.required_item_ids);
  const unsafe = new Set<string>([
    ...row.deprecated_item_ids,
    ...row.forbidden_item_ids,
  ]);
  const top3Required = row.top3.filter((id: string) => required.has(id)).length;
  const poolRequired = row.shared_candidate_pool_ids.filter((id: string) =>
    required.has(id),
  ).length;
  check(top3Required === row.required_hits_at_3, "Top-3 required hit mismatch");
  check(
    poolRequired === row.candidate_required_hits_at_20,
    "Top-20 required hit mismatch",
  );
  check(
    row.unsafe_top3_hit ===
      Number(row.top3.some((id: string) => unsafe.has(id))),
    "unsafe Top-3 mismatch",
  );
  for (const attribution of row.required_item_stage_attribution) {
    const expected = !row.shared_candidate_pool_ids.includes(
      attribution.runtime_item_id,
    )
      ? "candidate_recall_failure"
      : !row.top3.includes(attribution.runtime_item_id)
        ? "reranking_or_policy_failure"
        : "retrieval_success";
    check(attribution.stage === expected, "failure-stage attribution mismatch");
  }
}

const selectedRows = rows.filter(
  (row) => row.system === result.selected_system,
);
const recencyRows = rows.filter(
  (row) => row.system === "recency_lambda_0.75",
);
const requiredCandidateRecall =
  selectedRows.reduce(
    (sum, row) => sum + row.candidate_required_hits_at_20,
    0,
  ) /
  selectedRows.reduce((sum, row) => sum + row.candidate_required_count, 0);
check(
  close(requiredCandidateRecall, 0.8863636363636364),
  "candidate Recall@20 does not reproduce",
);
check(
  result.gate_checks.required_candidate_micro_recall_at_20_at_least_0_90 ===
    false,
  "expected candidate Recall@20 gate failure is absent",
);
check(
  Object.values(result.gate_checks).filter((value) => value === true).length ===
    7 &&
    Object.values(result.gate_checks).filter((value) => value === false)
      .length === 1,
  "gate pass/fail count is not 7/1",
);
check(
  result.gate_passed === false &&
    result.status === "development_gate_failed_remains_development",
  "result improperly promotes the Development cycle",
);
check(
  selectedRows.length === manifest.runtime_query_count &&
    recencyRows.length === manifest.runtime_query_count,
  "selected or Recency query count mismatch",
);

const r210Entries = r210ChecksumText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) throw new Error(`Invalid R2.10 checksum line: ${line}`);
    return { expected: match[1], relativePath: match[2] };
  });
let r210Verified = 0;
for (const entry of r210Entries) {
  const bytes = await readFile(path.join(EXP, entry.relativePath));
  if (sha256(bytes) === entry.expected) r210Verified++;
  else failures.push(`R2.10 checksum mismatch: ${entry.relativePath}`);
}

const audit = {
  schema_version: "v5-r2.11-development-audit-1",
  status: failures.length === 0 ? "audit_pass" : "audit_fail",
  audited_at: "2026-07-26T00:00:00.000+08:00",
  development_only: true,
  retrieval_rerun_performed: false,
  raw_row_count: rows.length,
  query_count: manifest.runtime_query_count,
  system_count: result.systems_executed.length,
  unique_query_system_pair_count: uniquePairs.size,
  owner_approved_record_count: 56,
  shared_candidate_pool_identity: sharedPoolIdentity,
  selected_system: result.selected_system,
  selected_required_candidate_micro_recall_at_20: requiredCandidateRecall,
  gate_checks_passed: 7,
  gate_checks_failed: 1,
  gate_passed: false,
  promotion_allowed: false,
  execution_guard_status: guard.status,
  retrieval_execution_count: guard.retrieval_execution_count,
  r2_10_archive_checksum_entries_verified: r210Verified,
  r2_10_archive_checksum_entry_count: r210Entries.length,
  artifact_sha256: {
    frozen_manifest: sha256(manifestText),
    execution_guard: sha256(guardText),
    runner: sha256(runnerText),
    raw_retrieval_results: sha256(rawText),
    development_result: sha256(resultText),
  },
  failures,
};

await writeFile(
  path.join(RESULT_DIR, "AUDIT.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(audit, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
