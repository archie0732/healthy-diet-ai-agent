import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateR211DevelopmentLedger } from "../../src/annotation/validate_r2_11_development";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const REVIEWED = path.join(
  EXP,
  "data/annotations_v5/r2_11_physical_activity_codex_reviewed",
);
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_11_physical_activity_owner_approved",
);
const PACKET = path.join(EXP, "R2_11_PHYSICAL_ACTIVITY_OWNER_REVIEW_PACKET.md");

const EXPECTED_PACKET_SHA256 =
  "c86a2df74050f1f450d25898c8e408f9c2aab2323673aa3e51476d5d0dc2a86f";
const EXPECTED_PROVISIONAL_SHA256 =
  "addc5ee2b8b7e3d076ee7e7e7932ac6886162d177395bcfd3f2c29e430271267";
const OWNER_STATEMENT = "OK I finish all";
const OWNER_SIGNOFF_DATE = "2026-07-24";

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const [packetText, provisionalText, reviewedManifestText] = await Promise.all([
  readFile(PACKET, "utf8"),
  readFile(path.join(REVIEWED, "provisional_annotations.jsonl"), "utf8"),
  readFile(path.join(REVIEWED, "MANIFEST.json"), "utf8"),
]);
const reviewedManifest = JSON.parse(reviewedManifestText);

if (
  sha256(packetText) !== EXPECTED_PACKET_SHA256 ||
  sha256(provisionalText) !== EXPECTED_PROVISIONAL_SHA256 ||
  reviewedManifest.provisional_annotations_sha256 !==
    EXPECTED_PROVISIONAL_SHA256 ||
  reviewedManifest.accepted_provisional_count !== 5 ||
  !packetText.includes("approve all five current provisional annotations")
) {
  throw new Error("R2.11 owner-approval checksum guard failed.");
}

const provisional = parseJsonl(provisionalText);
const approved = provisional.map((record) => ({
  ...record,
  annotation_rationale:
    "Codex provisional semantic review accepted both atomic evidence roles; the project owner approved this annotation without observing retrieval outcomes.",
  review: {
    ...record.review,
    status: "project_owner_approved",
    reviewer_id: "project_owner_user",
    reviewer_type: "human_project_owner",
  },
}));

const validationErrors = validateR211DevelopmentLedger(approved);
if (validationErrors.length > 0) {
  throw new Error(
    `Approved partial ledger is invalid: ${JSON.stringify(validationErrors)}`,
  );
}

const approvedText = `${approved.map((record) => JSON.stringify(record)).join("\n")}\n`;
const signoff = {
  schema_version: "v5-r2.11-physical-activity-owner-signoff-1",
  status: "checksum_bound_project_owner_approved",
  owner_statement: OWNER_STATEMENT,
  owner_signoff_date: OWNER_SIGNOFF_DATE,
  approval_scope: "all_five_annotations_in_review_packet",
  review_packet_sha256: EXPECTED_PACKET_SHA256,
  provisional_annotations_sha256: EXPECTED_PROVISIONAL_SHA256,
  approved_annotations_sha256: sha256(approvedText),
  approved_record_count: approved.length,
  retrieval_outcomes_observed: false,
  r2_10_outcomes_used: false,
  limitation:
    "Approval covers five Development annotations only; the R2.11 ledger is not complete or frozen.",
};
const signoffText = `${JSON.stringify(signoff, null, 2)}\n`;
const counts = Object.fromEntries(
  [
    "conditional_merge",
    "compatible_history",
    "current_only",
    "hard_negative_current",
  ].map((stratum) => [
    stratum,
    approved.filter((record) => record.stratum === stratum).length,
  ]),
);
const manifest = {
  schema_version: "v5-r2.11-physical-activity-owner-approved-manifest-1",
  status: "partial_development_ledger_owner_approved_not_freeze_ready",
  approved_annotations_path:
    "data/annotations_v5/r2_11_physical_activity_owner_approved/approved_annotations.jsonl",
  approved_annotations_sha256: sha256(approvedText),
  owner_signoff_path:
    "data/annotations_v5/r2_11_physical_activity_owner_approved/PROJECT_OWNER_SIGNOFF.json",
  owner_signoff_sha256: sha256(signoffText),
  approved_record_count: approved.length,
  stratum_counts: counts,
  validation_error_count: validationErrors.length,
  project_owner_approved: true,
  full_ledger_frozen: false,
  retrieval_allowed: false,
};

await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "approved_annotations.jsonl"), approvedText, "utf8"),
  writeFile(path.join(OUT, "PROJECT_OWNER_SIGNOFF.json"), signoffText, "utf8"),
  writeFile(
    path.join(OUT, "MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  ),
]);

console.log(JSON.stringify(signoff, null, 2));
