import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  r220EvidenceKey,
  validateR220ConfirmationLedger,
} from "../../src/annotation/validate_r2_20_confirmation";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const ANNOTATIONS = path.join(
  EXP,
  "data/annotations_v5/r2_20_confirmation_codex_reviewed",
);
const GROUPS = path.join(
  EXP,
  "data/annotations_v5/r2_20_predeclared_candidate_groups",
);
const OUT = path.join(EXP, "data/configs/v5_r2_20_frozen_confirmation");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const EXPECTED_PACKET =
  "39b0d4b49007b5ef2845ce1992502bdfc1950f8672511ea8bbafdc98897ad729";
const EXPECTED_LEDGER =
  "2edaac8c3b6832fdd2f63f034873ae2b376b2d4bbbc6279860f7b9b0d66d084c";
const OWNER_STATEMENT = "核准全部 32 筆";
const exclusionPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_14_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_16_frozen_confirmation/confirmation.approved.frozen.jsonl",
];
const [
  packetText,
  provisionalText,
  groupsText,
  groupManifestText,
  v4ManifestText,
  r211ManifestText,
  r219SourceManifestText,
  modelManifestText,
  r219GuardText,
  initializationAttemptText,
  runnerText,
  protocolText,
  bunLock,
  ...exclusionTexts
] = await Promise.all([
  readFile(path.join(EXP, "R2_20_CONFIRMATION_OWNER_REVIEW_PACKET.md"), "utf8"),
  readFile(path.join(ANNOTATIONS, "provisional_annotations.jsonl"), "utf8"),
  readFile(path.join(GROUPS, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(GROUPS, "MANIFEST.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v4_devval_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_11_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_19_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/models/v5_r2_19_minilm/MODEL_MANIFEST.json"), "utf8"),
  readFile(path.join(EXP, "data/configs/v5_r2_19_neural_hybrid_diagnostic/EXECUTION_GUARD.json"), "utf8"),
  readFile(path.join(EXP, "results/v5/r2_20_confirmation/INITIALIZATION_ATTEMPT.json"), "utf8"),
  readFile(path.join(EXP, "scripts/v5/run_r2_20_neural_hybrid_confirmation.ts"), "utf8"),
  readFile(path.join(EXP, "R2_20_NEURAL_HYBRID_CONFIRMATION_PROTOCOL.md"), "utf8"),
  readFile(path.join(process.cwd(), "bun.lock")),
  ...exclusionPaths.map((relativePath) =>
    readFile(path.join(EXP, relativePath), "utf8"),
  ),
]);
if (
  sha256(packetText) !== EXPECTED_PACKET ||
  sha256(provisionalText) !== EXPECTED_LEDGER ||
  !packetText.includes("Exact bulk-approval phrase: `核准全部 32 筆`")
) {
  throw new Error("R2.20 owner-approval checksum boundary failed.");
}
const r219Guard = JSON.parse(r219GuardText);
if (
  r219Guard.status !== "diagnostic_complete_locked" ||
  r219Guard.execution_count !== 1 ||
  r219Guard.selected_diagnostic_variant !== "bm25_minilm_rrf_k60_top20"
) {
  throw new Error("R2.19 must remain locked with the selected RRF variant.");
}
const initializationAttempt = JSON.parse(initializationAttemptText);
if (
  initializationAttempt.status !== "failed_during_javascript_parse" ||
  initializationAttempt.embedding_count !== 0 ||
  initializationAttempt.candidate_pool_count !== 0 ||
  initializationAttempt.judgment_read_count !== 0 ||
  initializationAttempt.retrieval_execution_count_after_attempt !== 0
) {
  throw new Error("R2.20 initialization-attempt boundary failed.");
}
const model = JSON.parse(modelManifestText);
if (
  model.status !== "model_cached_and_smoke_tested" ||
  model.revision !== "751bff37182d3f1213fa05d7196b954e230abad9" ||
  model.dtype !== "q8" ||
  model.dimensions !== 384 ||
  model.blocked_postinstall_scripts_executed !== false ||
  sha256(bunLock) !== model.package.bun_lock_sha256
) {
  throw new Error("R2.20 frozen model boundary failed.");
}
for (const artifact of model.cache_artifacts) {
  const absolute = path.join(
    EXP,
    "data/models/v5_r2_19_minilm",
    artifact.path,
  );
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Model cache mismatch: ${artifact.path}`);
  }
}
for (const artifact of model.native_runtime) {
  const absolute = path.join(process.cwd(), artifact.path);
  if (sha256(await readFile(absolute)) !== artifact.sha256) {
    throw new Error(`Native runtime mismatch: ${artifact.path}`);
  }
}

const approved = parseJsonl(provisionalText).map((record) => ({
  ...record,
  review: {
    ...record.review,
    status: "project_owner_approved",
    reviewer_id: "project_owner_user",
    reviewer_type: "human_project_owner",
  },
}));
const forbiddenLineages = new Set<string>();
const forbiddenEvidence = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    if (record.lineage_group_id) forbiddenLineages.add(record.lineage_group_id);
    for (const field of ["required_current_evidence", "required_retained_evidence"]) {
      for (const item of record[field] ?? []) {
        forbiddenEvidence.add(r220EvidenceKey(item));
      }
    }
  }
}
const groups = parseJsonl(groupsText);
const groupMap = new Map(
  groups.map((group) => [
    group.candidate_group_id,
    new Set<string>(
      group.candidate_items.map((item: any) => item.evidence_key),
    ),
  ]),
);
const errors = validateR220ConfirmationLedger(approved, {
  forbiddenLineageIds: forbiddenLineages,
  forbiddenRequiredEvidenceKeys: forbiddenEvidence,
  candidateGroups: groupMap,
  candidateGroupManifestSha256: sha256(groupManifestText),
  requireFreezeReady: true,
});
if (errors.length > 0) throw new Error(JSON.stringify(errors));

const documentYears = new Map(
  [
    ...JSON.parse(v4ManifestText).documents,
    ...JSON.parse(r211ManifestText).documents,
    ...JSON.parse(r219SourceManifestText).documents,
  ].map((document) => [
    document.document_id,
    Number(
      String(document.edition ?? document.published_at).match(/\d{4}/)?.[0],
    ),
  ]),
);
const runtimeItems = new Map<string, any>();
for (const group of groups) {
  for (const item of group.candidate_items) {
    const runtimeId = `r2.20-item-${sha256(item.evidence_key).slice(0, 18)}`;
    const existing = runtimeItems.get(item.evidence_key);
    if (existing) {
      existing.candidate_group_ids.push(group.candidate_group_id);
    } else {
      runtimeItems.set(item.evidence_key, {
        runtime_item_id: runtimeId,
        text: item.text,
        publication_year: documentYears.get(item.document_id),
        candidate_group_ids: [group.candidate_group_id],
        source_locator: {
          document_id: item.document_id,
          source_role: item.source_role,
          source_sha256: item.source_sha256,
          page_number: item.page_number,
          chunk_id: item.chunk_id,
        },
      });
    }
  }
}
const queries: any[] = [];
const judgments: any[] = [];
for (const record of approved) {
  const queryKey = `r2.20-query-${sha256(record.query_id).slice(0, 16)}`;
  const toId = (item: any) =>
    runtimeItems.get(r220EvidenceKey(item)).runtime_item_id;
  queries.push({ runtime_query_key: queryKey, text: record.query_text });
  judgments.push({
    runtime_query_key: queryKey,
    query_id: record.query_id,
    stratum: record.stratum,
    required_item_ids: [
      ...record.required_current_evidence,
      ...record.required_retained_evidence,
    ].map(toId),
    unsafe_item_ids: [
      ...record.deprecated_evidence,
      ...record.forbidden_evidence,
    ].map(toId),
  });
}
const approvedText = jsonl(approved);
const queriesText = jsonl(queries);
const corpusText = jsonl([...runtimeItems.values()]);
const judgmentsText = jsonl(judgments);
const signoff = {
  schema_version: "v5-r2.20-confirmation-owner-signoff-1",
  status: "checksum_bound_project_owner_approved",
  approved_at: "2026-07-28",
  owner_statement: OWNER_STATEMENT,
  approved_record_count: approved.length,
  review_packet_sha256: EXPECTED_PACKET,
  provisional_annotations_sha256: EXPECTED_LEDGER,
  approved_annotations_sha256: sha256(approvedText),
  retrieval_outcomes_observed: false,
};
const signoffText = `${JSON.stringify(signoff, null, 2)}\n`;
const manifest = {
  schema_version: "v5-r2.20-frozen-confirmation-manifest-1",
  status: "confirmation_frozen_unlocked",
  record_count: approved.length,
  candidate_item_count: runtimeItems.size,
  approved_ledger_sha256: sha256(approvedText),
  owner_signoff_sha256: sha256(signoffText),
  candidate_group_manifest_sha256: sha256(groupManifestText),
  runtime_queries_sha256: sha256(queriesText),
  candidate_corpus_sha256: sha256(corpusText),
  judgments_sha256: sha256(judgmentsText),
  runner_sha256: sha256(runnerText),
  protocol_sha256: sha256(protocolText),
  model_manifest_sha256: sha256(modelManifestText),
  initialization_attempt_sha256: sha256(initializationAttemptText),
  bun_lock_sha256: sha256(bunLock),
  exclusion_sha256: Object.fromEntries(
    exclusionPaths.map((relativePath, index) => [
      relativePath,
      sha256(exclusionTexts[index]),
    ]),
  ),
  parameters: {
    bm25_k1: 1.2,
    bm25_b: 0.75,
    seed_count: 12,
    pool_size: 20,
    rrf_k: 60,
    recency_weight: 0.2,
    baseline_pair_signal_weight: 0.5,
    repaired_pair_signal_weight: 2.0,
    repaired_anchor_rank: 6,
    forced_pair_quota: false,
  },
  model: {
    id: model.model_id,
    revision: model.revision,
    dtype: model.dtype,
    pooling: model.pooling,
    normalization: model.normalization,
    dimensions: model.dimensions,
    device: model.device,
    cache_root: "data/models/v5_r2_19_minilm/cache",
    local_model_directory:
      "data/models/v5_r2_19_minilm/cache/Xenova/all-MiniLM-L6-v2/751bff37182d3f1213fa05d7196b954e230abad9",
    local_files_only: true,
    remote_loading_allowed: false,
  },
  validation_errors: errors,
  retrieval_execution_count: 0,
  r2_10_rerun_allowed: false,
  r2_16_rerun_allowed: false,
  r2_19_rerun_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.20-confirmation-guard-1",
  status: "confirmation_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  retrieval_execution_count: 0,
  judgments_read_only_after_all_embeddings_and_retrieval_calls: true,
  remote_model_loading_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
  promotion_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "PROJECT_OWNER_SIGNOFF.json"), signoffText),
  writeFile(path.join(OUT, "confirmation.approved.frozen.jsonl"), approvedText),
  writeFile(path.join(OUT, "runtime_queries.role_neutral.jsonl"), queriesText),
  writeFile(path.join(OUT, "candidate_corpus.role_neutral.jsonl"), corpusText),
  writeFile(path.join(OUT, "judgments.sealed.jsonl"), judgmentsText),
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(
    path.join(OUT, "EXECUTION_GUARD.json"),
    `${JSON.stringify(guard, null, 2)}\n`,
  ),
]);
console.log(
  JSON.stringify(
    {
      status: manifest.status,
      record_count: approved.length,
      candidate_item_count: runtimeItems.size,
      validation_error_count: errors.length,
      retrieval_execution_count: 0,
    },
    null,
    2,
  ),
);
