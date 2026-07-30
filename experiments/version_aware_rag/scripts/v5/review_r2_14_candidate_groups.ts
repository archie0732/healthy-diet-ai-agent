import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const INPUT = path.join(
  EXP,
  "data/annotations_v5/r2_14_predeclared_candidate_groups",
);
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_14_candidate_groups_codex_reviewed",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

// Eligibility is based only on the frozen role-neutral passages. Some coherent
// mismatches are intentionally retained because they can support a scoped
// current-only hard negative with the older passage marked forbidden.
const acceptedIds = new Set([
  "r2.14-pre-c4d926e23314d131ef",
  "r2.14-pre-d1de417f76d1623bfa",
  "r2.14-pre-806e312e12f7aaf38b",
  "r2.14-pre-3f68da5ca88e059bf5",
  "r2.14-pre-f0f52dd92079939cbd",
  "r2.14-pre-82fb786503c1bdfe2f",
  "r2.14-pre-5d04765730d2df77cf",
  "r2.14-pre-67b7b31cb94666b07e",
  "r2.14-pre-b2fffc787e3ba00c81",
  "r2.14-pre-3d0ddc2eb493a27e89",
  "r2.14-pre-6fdc7995867b266d8f",
  "r2.14-pre-fea202db288ec35202",
  "r2.14-pre-6853b806b1f9a2f504",
  "r2.14-pre-0f1ecdae72a61eb3fb",
  "r2.14-pre-ee06bc1d0a9c6f884e",
  "r2.14-pre-9dde0152d662a2cb4c",
  "r2.14-pre-6fa2b79b864d138b23",
  "r2.14-pre-b414993d8d5436d88c",
  "r2.14-pre-ba03ee4375fcc7e15a",
  "r2.14-pre-1f46dbba4b3df62aec",
  "r2.14-pre-b9e4bce082c2616444",
  "r2.14-pre-6b0dd5cf57bbb22308",
  "r2.14-pre-370bd01a936e84c201",
  "r2.14-pre-a00aa0c85d83a4e5d0",
  "r2.14-pre-16941c66d1ea60ef88",
  "r2.14-pre-b69bf08ad105c49276",
  "r2.14-pre-6d77cf5c73d06ef59f",
  "r2.14-pre-1d2777f05d695b6224",
  "r2.14-pre-c41e92a31277ed0314",
  "r2.14-pre-a72f9273e279049b7b",
  "r2.14-pre-4a81a26f69938ec129",
  "r2.14-pre-9f4f090dd49dd34747",
  "r2.14-pre-7a3013df94fbf2d8c9",
  "r2.14-pre-3484c102ba8ed0b101",
  "r2.14-pre-aa301e6ca4968a0bde",
  "r2.14-pre-5e71a38395377bef5b",
  "r2.14-pre-86724370c851dbe120",
  "r2.14-pre-51397ed97c006df5f5",
  "r2.14-pre-435fbc0d0e8fbc2c19",
  "r2.14-pre-9a13b19b573644c5ce",
  "r2.14-pre-66300a9c33607d9941",
]);

const referenceOrRosterDominated = new Set([
  "r2.14-pre-9dc98823de8c0769e4",
  "r2.14-pre-8ee3ec0937398597f0",
  "r2.14-pre-739b94019842bd74d0",
  "r2.14-pre-2ef50a5b5520b414ed",
  "r2.14-pre-70a931b15a983c2657",
  "r2.14-pre-eec1d52c506dba2325",
  "r2.14-pre-47754b75866f6260b7",
]);
const methodOrTableDominated = new Set([
  "r2.14-pre-c1957f0c4ec495107f",
  "r2.14-pre-e78467d3ce4f9bebed",
  "r2.14-pre-55561eb1bc41f2381d",
  "r2.14-pre-3c64ea0f8da32e08da",
  "r2.14-pre-027c28e36f6e6630be",
  "r2.14-pre-e642a26772b9634755",
  "r2.14-pre-5f8660d08f2e3d98a0",
  "r2.14-pre-df7ed7df74ddaace1c",
  "r2.14-pre-cdf4e3a3902ce7dbbf",
  "r2.14-pre-c9a558ced246d2c672",
  "r2.14-pre-642dd85e447e0e8da1",
  "r2.14-pre-36a8d212f01abc4a2c",
  "r2.14-pre-dcc101a447e43744f8",
]);

const [groupsText, sourceManifestText] = await Promise.all([
  readFile(path.join(INPUT, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(INPUT, "MANIFEST.json"), "utf8"),
]);
const groups = parseJsonl(groupsText);
const reviews = groups.map((group) => {
  const accepted = acceptedIds.has(group.candidate_group_id);
  const hardNegativeCapable = accepted && [
    "r2.14-pre-a00aa0c85d83a4e5d0",
    "r2.14-pre-370bd01a936e84c201",
    "r2.14-pre-1d2777f05d695b6224",
    "r2.14-pre-a72f9273e279049b7b",
    "r2.14-pre-3484c102ba8ed0b101",
    "r2.14-pre-86724370c851dbe120",
  ].includes(group.candidate_group_id);
  return {
    schema_version: "v5-r2.14-candidate-group-semantic-review-1",
    candidate_group_id: group.candidate_group_id,
    source_family: group.source_family,
    decision: accepted
      ? "eligible_for_confirmation_annotation_authoring"
      : "rejected_before_annotation",
    eligible_use: accepted
      ? hardNegativeCapable
        ? "scoped_current_or_hard_negative"
        : "two_passage_or_scoped_current"
      : "none",
    reasons: accepted
      ? [
          hardNegativeCapable
            ? "The current passage can answer a precise scoped query while the older passage is a plausible but unsafe distractor."
            : "The passages contain substantive evidence, recommendation, scope, or implementation content suitable for an answerable annotation.",
          "Eligibility was decided without authoring a query and without observing R2.14 retrieval outcomes.",
        ]
      : [
          referenceOrRosterDominated.has(group.candidate_group_id)
            ? "At least one passage is dominated by references, affiliations, or reviewer rosters."
            : null,
          methodOrTableDominated.has(group.candidate_group_id)
            ? "At least one passage is dominated by methods, GRADE tables, or evidence-process content."
            : null,
        ].filter(Boolean).length > 0
        ? [
            referenceOrRosterDominated.has(group.candidate_group_id)
              ? "At least one passage is dominated by references, affiliations, or reviewer rosters."
              : null,
            methodOrTableDominated.has(group.candidate_group_id)
              ? "At least one passage is dominated by methods, GRADE tables, or evidence-process content."
              : null,
          ].filter(Boolean)
        : ["The pair lacks a sufficiently precise and defensible annotation contract."],
    reviewer_id: "codex_semantic_reviewer",
    reviewer_type: "codex_non_owner",
    independent_blinded_or_clinical_review: false,
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
  schema_version: "v5-r2.14-candidate-group-review-manifest-1",
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
