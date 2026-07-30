import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  r212EvidenceKey,
  validateR212ConfirmationLedger,
} from "../../src/annotation/validate_r2_12_confirmation";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const ANNOTATIONS = path.join(
  EXP,
  "data/annotations_v5/r2_12_confirmation_codex_reviewed",
);
const GROUPS = path.join(
  EXP,
  "data/annotations_v5/r2_12_predeclared_candidate_groups",
);
const OUT = path.join(EXP, "data/configs/v5_r2_12_frozen_confirmation");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const EXPECTED_PACKET =
  "ba6d66752a722b53c662beb4b20458183483a9143adbc36914e385f440122869";
const EXPECTED_LEDGER =
  "b41fd2cac298010ab97d2a60bf8e052e49bd754c882e8bef5815f80f0d8d777f";
const OWNER_STATEMENT = "核准全部 32 筆";
const exclusionPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
];
const [
  packetText,
  provisionalText,
  groupsText,
  groupManifestText,
  v4ManifestText,
  r211ManifestText,
  runnerText,
  protocolText,
  ...exclusionTexts
] = await Promise.all([
  readFile(path.join(EXP, "R2_12_CONFIRMATION_OWNER_REVIEW_PACKET.md"), "utf8"),
  readFile(path.join(ANNOTATIONS, "provisional_annotations.jsonl"), "utf8"),
  readFile(path.join(GROUPS, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(GROUPS, "MANIFEST.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v4_devval_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_11_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "scripts/v5/run_r2_12_confirmation.ts"), "utf8"),
  readFile(path.join(EXP, "R2_12_CANDIDATE_RECALL_REPAIR_PROTOCOL.md"), "utf8"),
  ...exclusionPaths.map((relativePath) =>
    readFile(path.join(EXP, relativePath), "utf8"),
  ),
]);
if (
  sha256(packetText) !== EXPECTED_PACKET ||
  sha256(provisionalText) !== EXPECTED_LEDGER
) {
  throw new Error("Owner approval checksum boundary failed.");
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
      for (const item of record[field] ?? []) forbiddenEvidence.add(r212EvidenceKey(item));
    }
  }
}
const groups = parseJsonl(groupsText);
const groupMap = new Map(
  groups.map((group) => [
    group.candidate_group_id,
    new Set<string>(group.candidate_items.map((item: any) => item.evidence_key)),
  ]),
);
const errors = validateR212ConfirmationLedger(approved, {
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
  ].map((document) => [
    document.document_id,
    Number(String(document.edition).match(/\d{4}/)?.[0]),
  ]),
);
const runtimeItems = new Map<string, any>();
for (const group of groups) {
  for (const item of group.candidate_items) {
    const runtimeId = `r2.12-item-${sha256(item.evidence_key).slice(0, 18)}`;
    const existing = runtimeItems.get(item.evidence_key);
    if (existing) existing.candidate_group_ids.push(group.candidate_group_id);
    else
      runtimeItems.set(item.evidence_key, {
        runtime_item_id: runtimeId,
        text: item.text,
        publication_year: documentYears.get(item.document_id),
        candidate_group_ids: [group.candidate_group_id],
        source_locator: {
          document_id: item.document_id,
          source_sha256: item.source_sha256,
          page_number: item.page_number,
          chunk_id: item.chunk_id,
        },
      });
  }
}
const queries: any[] = [];
const judgments: any[] = [];
for (const record of approved) {
  const queryKey = `r2.12-query-${sha256(record.query_id).slice(0, 16)}`;
  const toId = (item: any) =>
    runtimeItems.get(r212EvidenceKey(item)).runtime_item_id;
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
  schema_version: "v5-r2.12-confirmation-owner-signoff-1",
  status: "checksum_bound_project_owner_approved",
  owner_statement: OWNER_STATEMENT,
  approved_record_count: 32,
  review_packet_sha256: EXPECTED_PACKET,
  provisional_annotations_sha256: EXPECTED_LEDGER,
  approved_annotations_sha256: sha256(approvedText),
  retrieval_outcomes_observed: false,
};
const signoffText = `${JSON.stringify(signoff, null, 2)}\n`;
const manifest = {
  schema_version: "v5-r2.12-frozen-confirmation-manifest-1",
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
  exclusion_sha256: Object.fromEntries(
    exclusionPaths.map((relativePath, index) => [
      relativePath,
      sha256(exclusionTexts[index]),
    ]),
  ),
  parameters: {
    bm25_k1: 1.2,
    bm25_b: 0.75,
    pool_size: 20,
    group_seed_count: 14,
    downstream_recency_weight: 0.2,
    downstream_group_boost: 0.5,
  },
  validation_errors: errors,
  retrieval_execution_count: 0,
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_11_rerun_allowed: false,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  schema_version: "v5-r2.12-confirmation-guard-1",
  status: "confirmation_frozen_unlocked",
  manifest_sha256: sha256(manifestText),
  retrieval_execution_count: 0,
  judgments_read_only_after_all_retrieval_calls: true,
  validation_allowed: false,
  fresh_test_allowed: false,
  r2_11_rerun_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "PROJECT_OWNER_SIGNOFF.json"), signoffText),
  writeFile(path.join(OUT, "confirmation.approved.frozen.jsonl"), approvedText),
  writeFile(path.join(OUT, "runtime_queries.role_neutral.jsonl"), queriesText),
  writeFile(path.join(OUT, "candidate_corpus.role_neutral.jsonl"), corpusText),
  writeFile(path.join(OUT, "judgments.sealed.jsonl"), judgmentsText),
  writeFile(path.join(OUT, "FROZEN_MANIFEST.json"), manifestText),
  writeFile(path.join(OUT, "EXECUTION_GUARD.json"), `${JSON.stringify(guard, null, 2)}\n`),
]);
console.log(JSON.stringify({ status: manifest.status, record_count: 32, candidate_item_count: runtimeItems.size, validation_error_count: 0 }, null, 2));
