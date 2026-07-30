import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateR211DevelopmentLedger } from "../../src/annotation/validate_r2_11_development";

const ROOT = process.cwd();
const EXP = path.join(ROOT, "experiments/version_aware_rag");
const REMAINING = path.join(
  EXP,
  "data/annotations_v5/r2_11_remaining_codex_reviewed",
);
const EXISTING = path.join(
  EXP,
  "data/annotations_v5/r2_11_physical_activity_owner_approved",
);
const OUT = path.join(EXP, "data/configs/v5_r2_11_frozen_development");
const PACKET = path.join(EXP, "R2_11_REMAINING_51_OWNER_REVIEW_PACKET.md");
const PROTOCOL = path.join(EXP, "R2_11_IMPLICIT_MERGE_DEVELOPMENT_PROTOCOL.md");
const SCHEMA = path.join(EXP, "src/annotation/r2_11_schema.ts");
const VALIDATOR = path.join(
  EXP,
  "src/annotation/validate_r2_11_development.ts",
);
const RUNNER = path.join(EXP, "scripts/v5/run_r2_11_development.ts");

const EXPECTED_PACKET_SHA256 =
  "a55d8c38edef2f4ae3e3d9280d3fb545df6fbaff6d9187083db299a809db3b15";
const EXPECTED_PROVISIONAL_SHA256 =
  "71c78ca42be5625dafd9aecd744cba11f9d1119882d76742bf7a0be1901e56e6";
const OWNER_STATEMENT = "核准全部 51 筆";
const OWNER_SIGNOFF_DATE = "2026-07-26";

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const [
  packetText,
  provisionalText,
  remainingManifestText,
  existingApprovedText,
  protocolText,
  schemaText,
  validatorText,
  runnerText,
  v4ChunksText,
  r211ChunksText,
] = await Promise.all([
  readFile(PACKET, "utf8"),
  readFile(path.join(REMAINING, "provisional_annotations.jsonl"), "utf8"),
  readFile(path.join(REMAINING, "MANIFEST.json"), "utf8"),
  readFile(path.join(EXISTING, "approved_annotations.jsonl"), "utf8"),
  readFile(PROTOCOL, "utf8"),
  readFile(SCHEMA, "utf8"),
  readFile(VALIDATOR, "utf8"),
  readFile(RUNNER, "utf8"),
  readFile(path.join(EXP, "data/corpus_v4_devval_draft/chunks.jsonl"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_11_draft/chunks.jsonl"), "utf8"),
]);

const remainingManifest = JSON.parse(remainingManifestText);
if (
  sha256(packetText) !== EXPECTED_PACKET_SHA256 ||
  sha256(provisionalText) !== EXPECTED_PROVISIONAL_SHA256 ||
  remainingManifest.owner_review_packet_sha256 !== EXPECTED_PACKET_SHA256 ||
  remainingManifest.provisional_annotations_sha256 !==
    EXPECTED_PROVISIONAL_SHA256 ||
  remainingManifest.provisional_record_count !== 51 ||
  !remainingManifest.minimum_counts_satisfied
) {
  throw new Error("R2.11 remaining owner-approval checksum guard failed.");
}

const approvedRemaining = parseJsonl(provisionalText).map((record) => ({
  ...record,
  annotation_rationale: `${record.annotation_rationale} Project-owner approval was recorded without observing retrieval outcomes.`,
  review: {
    ...record.review,
    status: "project_owner_approved",
    reviewer_id: "project_owner_user",
    reviewer_type: "human_project_owner",
  },
}));
const existingApproved = parseJsonl(existingApprovedText);
const fullLedger = [...existingApproved, ...approvedRemaining];

const exclusionRelativePaths = [
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
];
const exclusionTexts = await Promise.all(
  exclusionRelativePaths.map((relativePath) =>
    readFile(path.join(EXP, relativePath), "utf8"),
  ),
);
const forbiddenLineageIds = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    for (const key of ["lineage_group_id", "lineage_group", "lineage_id"]) {
      if (typeof record[key] === "string") forbiddenLineageIds.add(record[key]);
    }
  }
}
const validationErrors = validateR211DevelopmentLedger(fullLedger, {
  forbiddenLineageIds,
  requireFreezeReady: true,
});
if (validationErrors.length > 0) {
  throw new Error(`Full R2.11 ledger is not freeze-ready: ${JSON.stringify(validationErrors)}`);
}

const chunkMap = new Map(
  [...parseJsonl(v4ChunksText), ...parseJsonl(r211ChunksText)].map((chunk) => [
    chunk.chunk_id,
    chunk,
  ]),
);
const runtimeItemByEvidenceKey = new Map<string, any>();
const evidenceToRuntimeId = new Map<string, string>();
const runtimeQueries: any[] = [];
const judgments: any[] = [];

const evidenceKey = (evidence: any) =>
  `${evidence.source_sha256}:${evidence.locator.chunk_id ?? `page-${evidence.locator.page_number}`}`;

for (const record of fullLedger) {
  const runtimeQueryKey = `r2.11-query-${sha256(`query|${record.query_id}`).slice(0, 16)}`;
  const candidateGroupId = `r2.11-group-${sha256(`group|${record.lineage_group_id}`).slice(0, 16)}`;
  runtimeQueries.push({
    runtime_query_key: runtimeQueryKey,
    text: record.query_text,
  });

  const roleArrays = [
    ["required_current_evidence", "required"],
    ["required_retained_evidence", "required"],
    ["deprecated_evidence", "deprecated"],
    ["forbidden_evidence", "forbidden"],
  ] as const;
  const roleIds: Record<string, string[]> = {
    required: [],
    deprecated: [],
    forbidden: [],
  };
  for (const [field, judgmentRole] of roleArrays) {
    for (const item of record[field]) {
      const key = evidenceKey(item);
      const runtimeItemId = `r2.11-item-${sha256(`item|${key}`).slice(0, 18)}`;
      evidenceToRuntimeId.set(`${record.query_id}:${item.item_id}`, runtimeItemId);
      roleIds[judgmentRole].push(runtimeItemId);
      const chunk = chunkMap.get(item.locator.chunk_id);
      if (!chunk) throw new Error(`Missing runtime chunk ${item.locator.chunk_id}`);
      const existing = runtimeItemByEvidenceKey.get(key);
      if (existing) {
        if (!existing.candidate_group_ids.includes(candidateGroupId)) {
          existing.candidate_group_ids.push(candidateGroupId);
          existing.candidate_group_ids.sort();
        }
      } else {
        runtimeItemByEvidenceKey.set(key, {
          runtime_item_id: runtimeItemId,
          text: chunk.text,
          publication_year: Number(String(chunk.edition).match(/\d{4}/)?.[0]),
          source_locator: {
            document_id: item.document_id,
            source_sha256: item.source_sha256,
            page_number: item.locator.page_number,
            chunk_id: item.locator.chunk_id,
          },
          candidate_group_ids: [candidateGroupId],
        });
      }
    }
  }
  judgments.push({
    runtime_query_key: runtimeQueryKey,
    query_id: record.query_id,
    stratum: record.stratum,
    required_item_ids: [...new Set(roleIds.required)],
    deprecated_item_ids: [...new Set(roleIds.deprecated)],
    forbidden_item_ids: [...new Set(roleIds.forbidden)],
  });
}

const roleNeutralCorpus = [...runtimeItemByEvidenceKey.values()].sort((a, b) =>
  a.runtime_item_id.localeCompare(b.runtime_item_id),
);
const approvedRemainingText = jsonl(approvedRemaining);
const fullLedgerText = jsonl(fullLedger);
const runtimeQueriesText = jsonl(runtimeQueries);
const corpusText = jsonl(roleNeutralCorpus);
const judgmentsText = jsonl(judgments);

const signoff = {
  schema_version: "v5-r2.11-remaining-owner-signoff-1",
  status: "checksum_bound_project_owner_approved",
  owner_statement: OWNER_STATEMENT,
  owner_signoff_date: OWNER_SIGNOFF_DATE,
  approval_scope: "all_51_records_in_remaining_review_packet",
  review_packet_sha256: EXPECTED_PACKET_SHA256,
  provisional_annotations_sha256: EXPECTED_PROVISIONAL_SHA256,
  approved_annotations_sha256: sha256(approvedRemainingText),
  approved_record_count: approvedRemaining.length,
  retrieval_outcomes_observed: false,
  r2_10_outcomes_used: false,
  limitation:
    "Project-owner review is not independent blinded or clinical review.",
};
const signoffText = `${JSON.stringify(signoff, null, 2)}\n`;

const manifest = {
  schema_version: "v5-r2.11-frozen-development-manifest-1",
  status: "frozen_development_retrieval_unlocked",
  frozen_at: "2026-07-26T00:00:00.000+08:00",
  record_count: fullLedger.length,
  stratum_counts: Object.fromEntries(
    [
      "conditional_merge",
      "compatible_history",
      "current_only",
      "hard_negative_current",
    ].map((stratum) => [
      stratum,
      fullLedger.filter((record) => record.stratum === stratum).length,
    ]),
  ),
  protocol_sha256: sha256(protocolText),
  schema_sha256: sha256(schemaText),
  validator_sha256: sha256(validatorText),
  runner_sha256: sha256(runnerText),
  existing_five_approved_sha256: sha256(existingApprovedText),
  remaining_owner_signoff_sha256: sha256(signoffText),
  approved_remaining_sha256: sha256(approvedRemainingText),
  frozen_ledger_sha256: sha256(fullLedgerText),
  role_neutral_runtime_queries_sha256: sha256(runtimeQueriesText),
  role_neutral_corpus_sha256: sha256(corpusText),
  sealed_judgments_sha256: sha256(judgmentsText),
  runtime_query_count: runtimeQueries.length,
  role_neutral_corpus_item_count: roleNeutralCorpus.length,
  exclusion_input_sha256: Object.fromEntries(
    exclusionRelativePaths.map((relativePath, index) => [
      relativePath,
      sha256(exclusionTexts[index]),
    ]),
  ),
  retrieval: {
    bm25_k1: 1.2,
    bm25_b: 0.75,
    candidate_pool_size: 20,
    top_k: 3,
    recency_lambda: 0.75,
    explicit_history_pair_boost: 0.75,
    implicit_merge_grid: [
      { recency_weight: 0.2, group_boost: 0.25 },
      { recency_weight: 0.2, group_boost: 0.5 },
      { recency_weight: 0.2, group_boost: 0.75 },
      { recency_weight: 0.2, group_boost: 1.0 },
      { recency_weight: 0.4, group_boost: 0.25 },
      { recency_weight: 0.4, group_boost: 0.5 },
      { recency_weight: 0.4, group_boost: 0.75 },
      { recency_weight: 0.4, group_boost: 1.0 },
    ],
    local_embedding: {
      model_id: "deterministic-feature-hash-embedding",
      revision: "r2.11-v1",
      dimensions: 512,
      features: ["word_unigram", "word_bigram", "character_trigram"],
      pretrained_semantic_model: false,
    },
    local_cross_encoder: {
      status: "unavailable_omitted",
      reason:
        "No exact local cross-encoder model revision and file checksum were installed; no network model was substituted.",
    },
    bootstrap_samples: 10000,
    bootstrap_seed: 2112026,
  },
  runtime_view_excludes: [
    "query_id",
    "stratum",
    "gold_lineage_id",
    "required_role",
    "deprecated_role",
    "forbidden_role",
    "annotation_rationale",
    "review_fields",
    "prior_outcomes",
  ],
  validation_errors: validationErrors,
  retrieval_execution_count: 0,
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_10_rerun_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.11-development-execution-guard-1",
  status: "frozen_development_retrieval_unlocked",
  manifest_sha256: sha256(manifestText),
  retrieval_execution_count: 0,
  judgments_may_be_read_only_after_all_retrieval_calls: true,
  external_model_api_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_10_rerun_allowed: false,
};

await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(
    path.join(OUT, "PROJECT_OWNER_SIGNOFF_REMAINING_51.json"),
    signoffText,
    "utf8",
  ),
  writeFile(
    path.join(OUT, "approved_remaining_51.jsonl"),
    approvedRemainingText,
    "utf8",
  ),
  writeFile(path.join(OUT, "development.frozen.jsonl"), fullLedgerText, "utf8"),
  writeFile(
    path.join(OUT, "runtime_queries.role_neutral.jsonl"),
    runtimeQueriesText,
    "utf8",
  ),
  writeFile(
    path.join(OUT, "candidate_corpus.role_neutral.jsonl"),
    corpusText,
    "utf8",
  ),
  writeFile(path.join(OUT, "judgments.sealed.jsonl"), judgmentsText, "utf8"),
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText, "utf8"),
  writeFile(
    path.join(OUT, "EXECUTION_GUARD.json"),
    `${JSON.stringify(guard, null, 2)}\n`,
    "utf8",
  ),
]);

console.log(
  JSON.stringify(
    {
      status: manifest.status,
      record_count: manifest.record_count,
      stratum_counts: manifest.stratum_counts,
      corpus_item_count: manifest.role_neutral_corpus_item_count,
      frozen_ledger_sha256: manifest.frozen_ledger_sha256,
      validation_error_count: validationErrors.length,
    },
    null,
    2,
  ),
);
