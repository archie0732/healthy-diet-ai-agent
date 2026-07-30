import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const INPUT = path.join(EXP, "data/annotations_v5/r2_16_predeclared_candidate_groups");
const OUT = path.join(EXP, "data/annotations_v5/r2_16_candidate_groups_codex_reviewed");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const acceptedIds = new Set([
  "r2.16-pre-703689c89004755263", "r2.16-pre-c6d532c5af83fc3371",
  "r2.16-pre-b2931d596a23cf9839", "r2.16-pre-6c2d1b28ad847c4bd7",
  "r2.16-pre-3a8351f234b6a09ff2", "r2.16-pre-a4f4fc0f67145895c0",
  "r2.16-pre-6ef924ad23f53e31a7", "r2.16-pre-ed4d89acda9db97b13",
  "r2.16-pre-dd5ade3a1049de2dc2", "r2.16-pre-d4c48b15f1866838a1",
  "r2.16-pre-1e7d714155537600e8", "r2.16-pre-7941fda0eb2e05b0c0",
  "r2.16-pre-050ef281c77de3a4d4", "r2.16-pre-6adfabdaf0c355bee8",
  "r2.16-pre-ff84ea3fd8039afcfa", "r2.16-pre-7bded2564bff2d95d5",
  "r2.16-pre-3c9c281ae886c607e4", "r2.16-pre-177034cdb84da730de",
  "r2.16-pre-ac58826b381b14a8a8", "r2.16-pre-f21a43a574d1fb8825",
  "r2.16-pre-b837610d2d55ebe2d4", "r2.16-pre-27d1a747b7341d21d0",
  "r2.16-pre-41fc59212160a157d5", "r2.16-pre-5cdc8982a64a3090f3",
  "r2.16-pre-a2bc68acff443cecec", "r2.16-pre-cafaf887898746332a",
  "r2.16-pre-58cf931af6acc584ac", "r2.16-pre-c427ada3d4f355727e",
  "r2.16-pre-a3e6a7f3c1270c2b18", "r2.16-pre-51470841b70d2b312b",
  "r2.16-pre-781cf4018b6a489ed4", "r2.16-pre-2998238d71b657e29c",
  "r2.16-pre-8d750d9919d9f2ec0f", "r2.16-pre-d77be7d78e6e335719",
  "r2.16-pre-2efeda6b21e35bba0f", "r2.16-pre-d3e53edc319d983ba4",
  "r2.16-pre-486fc9f537400be322", "r2.16-pre-4d9eea1fa6cd8e120e",
  "r2.16-pre-18cdf58f4096d32d2f", "r2.16-pre-393874689bad475e36",
  "r2.16-pre-4bfac0dccc354c3ca4", "r2.16-pre-1c1983735e7aaf5dec",
  "r2.16-pre-ff25aa92c3a8100025", "r2.16-pre-7284703da4699191da",
]);
const [groupsText, sourceManifestText] = await Promise.all([
  readFile(path.join(INPUT, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(INPUT, "MANIFEST.json"), "utf8"),
]);
const groups = parseJsonl(groupsText);
const reviews = groups.map((group) => {
  const accepted = acceptedIds.has(group.candidate_group_id);
  return {
    schema_version: "v5-r2.16-candidate-group-semantic-review-1",
    candidate_group_id: group.candidate_group_id,
    source_family: group.source_family,
    decision: accepted
      ? "eligible_for_confirmation_annotation_authoring"
      : "rejected_before_annotation",
    reasons: accepted
      ? [
          "At least one precise annotation contract can be supported by substantive recommendation, effect, scope, safety, or implementation content.",
          "Eligibility was decided before query authoring and without R2.16 outcomes.",
        ]
      : [
          "The pair is dominated by references, rosters, declarations, methods, evidence tables, or an incoherent topic mismatch.",
        ],
    reviewer_id: "codex_semantic_reviewer",
    reviewer_type: "codex_non_owner",
    query_authored_at_review_time: false,
    retrieval_outcomes_used: false,
    prior_cycle_outcomes_used_for_semantic_decision: false,
  };
});
const eligibleCount = reviews.filter((review) =>
  review.decision.startsWith("eligible"),
).length;
if (eligibleCount < 33) {
  throw new Error(`Expected at least 33 eligible groups, received ${eligibleCount}.`);
}
const reviewsText = jsonl(reviews);
const manifest = {
  schema_version: "v5-r2.16-candidate-group-review-manifest-1",
  status: "codex_semantic_review_complete_not_annotation_gold",
  reviewed_group_count: reviews.length,
  eligible_group_count: eligibleCount,
  rejected_group_count: reviews.length - eligibleCount,
  minimum_eligible_group_count: 33,
  minimum_eligible_group_count_satisfied: true,
  predeclared_groups_sha256: sha256(groupsText),
  predeclared_group_manifest_sha256: sha256(sourceManifestText),
  semantic_review_sha256: sha256(reviewsText),
  project_owner_approval_required_for_future_annotations: true,
  retrieval_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "semantic_review.jsonl"), reviewsText),
  writeFile(path.join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify(manifest, null, 2));
