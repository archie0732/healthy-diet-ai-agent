import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  R220_CONFIRMATION_MINIMUM_COUNTS,
  r220EvidenceKey,
  validateR220ConfirmationLedger,
} from "../../src/annotation/validate_r2_20_confirmation";
import { R220_ANNOTATION_SPECS } from "./r2_20_annotation_specs";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const GROUP_DIR = path.join(EXP, "data/annotations_v5/r2_20_predeclared_candidate_groups");
const REVIEW_DIR = path.join(EXP, "data/annotations_v5/r2_20_candidate_groups_codex_reviewed");
const PLAN_DIR = path.join(EXP, "data/annotations_v5/r2_20_annotation_authoring_plan");
const OUT = path.join(EXP, "data/annotations_v5/r2_20_confirmation_codex_reviewed");
const PACKET = path.join(EXP, "R2_20_CONFIRMATION_OWNER_REVIEW_PACKET.md");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const [
  groupsText,
  groupManifestText,
  reviewsText,
  reviewManifestText,
  planText,
  planManifestText,
  v4ManifestText,
  r211ManifestText,
  r219ManifestText,
] = await Promise.all([
  readFile(path.join(GROUP_DIR, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(GROUP_DIR, "MANIFEST.json"), "utf8"),
  readFile(path.join(REVIEW_DIR, "semantic_review.jsonl"), "utf8"),
  readFile(path.join(REVIEW_DIR, "MANIFEST.json"), "utf8"),
  readFile(path.join(PLAN_DIR, "authoring_plan.frozen.jsonl"), "utf8"),
  readFile(path.join(PLAN_DIR, "MANIFEST.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v4_devval_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_11_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_19_draft/source_manifest.json"), "utf8"),
]);
const groupManifestSha = sha256(groupManifestText);
const groups = new Map(
  parseJsonl(groupsText).map((group) => [group.candidate_group_id, group]),
);
const eligible = new Set(
  parseJsonl(reviewsText)
    .filter((review) => review.decision.startsWith("eligible"))
    .map((review) => review.candidate_group_id),
);
const plan = new Map(
  parseJsonl(planText).map((row) => [row.candidate_group_id, row.stratum]),
);
const documents = new Map(
  [
    ...JSON.parse(v4ManifestText).documents,
    ...JSON.parse(r211ManifestText).documents,
    ...JSON.parse(r219ManifestText).documents,
  ].map((document) => [document.document_id, document]),
);
const evidence = (
  specId: string,
  candidate: any,
  role: "current" | "retained" | "forbidden",
  claim: string,
) => {
  const document: any = documents.get(candidate.document_id);
  if (!document) throw new Error(`Missing document ${candidate.document_id}`);
  return {
    item_id: `r2.20-${specId}-${role}`,
    role,
    document_id: candidate.document_id,
    atomic_claim_text: claim,
    official_record_url:
      document.official_record_url ?? document.official_page_url,
    official_pdf_url: document.official_pdf_url ?? document.download_url,
    local_path: document.local_path,
    source_sha256: candidate.source_sha256,
    locator: {
      page_number: candidate.page_number,
      chunk_id: candidate.chunk_id,
    },
  };
};

const records = R220_ANNOTATION_SPECS.map((spec) => {
  const group: any = groups.get(spec.group);
  if (
    !group ||
    !eligible.has(spec.group) ||
    plan.get(spec.group) !== spec.stratum
  ) {
    throw new Error(`Group is not frozen and eligible: ${spec.group}`);
  }
  const [left, right] = group.candidate_items;
  const implicit =
    spec.stratum === "conditional_merge" ||
    spec.stratum === "compatible_history";
  return {
    schema_version: "v5-r2.20-confirmation-annotation-1",
    query_id: `r2.20-confirm-${spec.id}`,
    split: "development_confirmation",
    stratum: spec.stratum,
    lineage_group_id: `r2.20-lineage-${sha256(spec.group).slice(0, 18)}`,
    topic_id: group.source_family,
    query_text: spec.query,
    predeclared_candidate_group_id: spec.group,
    candidate_group_manifest_sha256: groupManifestSha,
    required_current_evidence: [
      evidence(spec.id, right, "current", spec.currentClaim),
    ],
    required_retained_evidence: implicit
      ? [evidence(spec.id, left, "retained", spec.retainedClaim!)]
      : [],
    deprecated_evidence: [],
    forbidden_evidence:
      spec.stratum === "hard_negative_current"
        ? [evidence(spec.id, left, "forbidden", spec.unsafeClaim!)]
        : [],
    implicit_retained_rationale: implicit
      ? "The query requires two distinct clauses: the supporting passage supplies evidence or context, while the guideline passage supplies the recommendation, scope, interpretation, or implementation detail."
      : undefined,
    annotation_rationale:
      spec.stratum === "hard_negative_current"
        ? "The guideline passage directly answers the scoped question; the paired supporting or superseded passage is a plausible but insufficient distractor."
        : "Evidence roles were assigned after candidate-group and stratum freeze and before any R2.20 retrieval execution.",
    review: {
      status: "codex_provisional",
      reviewer_id: "codex_semantic_reviewer",
      reviewer_type: "codex_non_owner",
      independent_blinded_or_clinical_review: false,
      retrieval_outcomes_observed: false,
      r2_10_outcomes_used: false,
      r2_11_outcomes_used: false,
      r2_12_outcomes_used: false,
      r2_13_outcomes_used: false,
      r2_14_outcomes_used: false,
      r2_15_outcomes_used: false,
      r2_16_outcomes_used: false,
      r2_17_outcomes_used: false,
      r2_18_outcomes_used: false,
      r2_19_outcomes_used: false,
    },
  };
});

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
const exclusionTexts = await Promise.all(
  exclusionPaths.map((relativePath) =>
    readFile(path.join(EXP, relativePath), "utf8"),
  ),
);
const forbiddenLineages = new Set<string>();
const forbiddenRequiredEvidence = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    if (record.lineage_group_id) forbiddenLineages.add(record.lineage_group_id);
    for (const field of ["required_current_evidence", "required_retained_evidence"]) {
      for (const item of record[field] ?? []) {
        forbiddenRequiredEvidence.add(r220EvidenceKey(item));
      }
    }
  }
}
const candidateGroups = new Map(
  [...groups].map(([id, group]: [string, any]) => [
    id,
    new Set<string>(
      group.candidate_items.map((item: any) => item.evidence_key),
    ),
  ]),
);
const options = {
  forbiddenLineageIds: forbiddenLineages,
  forbiddenRequiredEvidenceKeys: forbiddenRequiredEvidence,
  candidateGroups,
  candidateGroupManifestSha256: groupManifestSha,
};
const errors = validateR220ConfirmationLedger(records, options);
if (errors.length) {
  throw new Error(`R2.20 provisional ledger invalid: ${JSON.stringify(errors)}`);
}
const freezeErrors = validateR220ConfirmationLedger(records, {
  ...options,
  requireFreezeReady: true,
});
if (
  freezeErrors.length !== 1 ||
  freezeErrors[0].type !== "ReviewStatus" ||
  !freezeErrors[0].message.startsWith("32 records")
) {
  throw new Error(`Unexpected freeze blockers: ${JSON.stringify(freezeErrors)}`);
}
const counts = Object.fromEntries(
  Object.keys(R220_CONFIRMATION_MINIMUM_COUNTS).map((stratum) => [
    stratum,
    records.filter((record) => record.stratum === stratum).length,
  ]),
);
const recordsText = jsonl(records);
const packetText = `${[
  "# R2.20 Confirmation Owner Review Packet",
  "",
  "Scope: 32 new lineage-disjoint Development-confirmation annotations. No R2.20 retrieval has run.",
  "",
  `Provisional ledger SHA-256: \`${sha256(recordsText)}\``,
  `Predeclared candidate-group manifest SHA-256: \`${groupManifestSha}\``,
  `Frozen authoring-plan SHA-256: \`${sha256(planText)}\``,
  "",
  "Counts: conditional_merge=10, compatible_history=10, current_only=6, hard_negative_current=6.",
  "Per-stratum source-document caps: satisfied (2 for each 10-record stratum; 1 for each 6-record stratum).",
  "",
  ...records.flatMap((record, index) => [
    `## ${index + 1}. ${record.query_id}`,
    "",
    `- Stratum: \`${record.stratum}\``,
    `- Query: ${record.query_text}`,
    `- Current: ${record.required_current_evidence[0].atomic_claim_text}`,
    ...(record.required_retained_evidence.length
      ? [`- Retained/supporting: ${record.required_retained_evidence[0].atomic_claim_text}`]
      : []),
    ...(record.forbidden_evidence.length
      ? [`- Forbidden: ${record.forbidden_evidence[0].atomic_claim_text}`]
      : []),
    `- Candidate group: \`${record.predeclared_candidate_group_id}\``,
    "",
  ]),
  "## Approval boundary",
  "",
  "Approval confirms only these 32 checksum-bound annotations. It authorizes freezing the R2.20 Development confirmation package and its one preregistered execution; it does not authorize Validation, fresh-test execution, or promotion.",
  "",
  "Exact bulk-approval phrase: `核准全部 32 筆`",
  "",
].join("\n")}\n`;
const manifest = {
  schema_version: "v5-r2.20-confirmation-provisional-manifest-1",
  status: "codex_provisional_owner_review_required",
  provisional_record_count: records.length,
  stratum_counts: counts,
  minimum_counts_satisfied: Object.entries(
    R220_CONFIRMATION_MINIMUM_COUNTS,
  ).every(([stratum, minimum]) => counts[stratum] >= minimum),
  validator_error_count: errors.length,
  freeze_blockers: freezeErrors,
  forbidden_lineage_count: forbiddenLineages.size,
  forbidden_required_evidence_count: forbiddenRequiredEvidence.size,
  required_evidence_overlap_count: records
    .flatMap((record) => [
      ...record.required_current_evidence,
      ...record.required_retained_evidence,
    ])
    .filter((item) => forbiddenRequiredEvidence.has(r220EvidenceKey(item))).length,
  source_document_caps_satisfied: JSON.parse(planManifestText)
    .source_document_caps_satisfied,
  candidate_group_manifest_sha256: groupManifestSha,
  candidate_group_review_manifest_sha256: sha256(reviewManifestText),
  candidate_group_semantic_review_sha256: sha256(reviewsText),
  authoring_plan_sha256: sha256(planText),
  authoring_plan_manifest_sha256: sha256(planManifestText),
  provisional_annotations_sha256: sha256(recordsText),
  owner_review_packet_sha256: sha256(packetText),
  project_owner_approval_required: true,
  retrieval_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "provisional_annotations.jsonl"), recordsText),
  writeFile(path.join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(PACKET, packetText),
]);
console.log(JSON.stringify(manifest, null, 2));
