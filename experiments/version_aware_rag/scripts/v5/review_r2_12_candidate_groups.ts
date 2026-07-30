import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const INPUT = path.join(
  EXP,
  "data/annotations_v5/r2_12_predeclared_candidate_groups",
);
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_12_candidate_groups_codex_reviewed",
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

const acceptedIds = new Set([
  "r2.12-pre-0cfeb43aed8f9649bc",
  "r2.12-pre-d7e4193cf1cc0c5077",
  "r2.12-pre-698d4b713d408d1840",
  "r2.12-pre-27e00abab835de5b8e",
  "r2.12-pre-41941f43a41ce801d6",
  "r2.12-pre-74349e68b1e4a21905",
  "r2.12-pre-a470c9d0da85afba56",
  "r2.12-pre-9855df9618092c6fea",
  "r2.12-pre-3f10dec0f770ab90ea",
  "r2.12-pre-54a4e84f9f4c836e83",
  "r2.12-pre-cdd0ffd2132b2c9b90",
  "r2.12-pre-16c3061019b9deb414",
  "r2.12-pre-241e7b5b29b712bb43",
  "r2.12-pre-c5e6068e7e1901539a",
  "r2.12-pre-54ec051fc3be7ed2c9",
  "r2.12-pre-9f2d32190c4930b350",
  "r2.12-pre-3d63b68f771483d1fd",
  "r2.12-pre-14d23c831c33deef1e",
  "r2.12-pre-febd26f5da4bbcdef5",
  "r2.12-pre-dbd985d66f699571f1",
  "r2.12-pre-665e6a17a683f45504",
  "r2.12-pre-b2de3d8ecd9ee444d7",
  "r2.12-pre-9902385c74db75281e",
  "r2.12-pre-8e337651348bc86869",
  "r2.12-pre-8f988df975edb71e37",
  "r2.12-pre-bfac4873a0703fe13e",
  "r2.12-pre-b6dbd0f30bf62eb52f",
  "r2.12-pre-26df9d90ede3abcb5b",
  "r2.12-pre-c962ce7ea66683946b",
  "r2.12-pre-a42f101cb07d1cc2af",
  "r2.12-pre-8ca0fa76a56e27f6ef",
  "r2.12-pre-712b90ccc66281e818",
  "r2.12-pre-5827e68e7515bfc239",
]);
const referenceDominated = new Set([
  "r2.12-pre-5e3a8fd3b3c9626c67",
  "r2.12-pre-ead0d5dde1595cddbd",
  "r2.12-pre-4f67a027e0359c6730",
  "r2.12-pre-1ff5e42f5b59fb31b9",
  "r2.12-pre-216af34e13f7340e1e",
  "r2.12-pre-3cb157f8cd20001fea",
  "r2.12-pre-70f990ca7361210658",
  "r2.12-pre-ddefd5aa491809bc95",
  "r2.12-pre-f09852736f8f959943",
  "r2.12-pre-80df3a24cee9c11abc",
]);
const methodDominated = new Set([
  "r2.12-pre-421d0ea03508efc209",
  "r2.12-pre-7b145732a7970f9b9f",
  "r2.12-pre-3563bc110c200a18bd",
  "r2.12-pre-3eca0b2c1308637e0a",
  "r2.12-pre-d96a9733ab09db2677",
  "r2.12-pre-ddefd5aa491809bc95",
  "r2.12-pre-c7a3ffa73715c815b8",
  "r2.12-pre-303b255d4e083375d0",
]);
const mismatchDominated = new Set([
  "r2.12-pre-a4a01e484850c74f27",
  "r2.12-pre-dca4ac4c4e7fb51a0b",
  "r2.12-pre-9b74d125a467f4e0af",
  "r2.12-pre-2dedac576620744257",
  "r2.12-pre-b4378ed0b3c4bdc679",
  "r2.12-pre-f772ba5f565d1eb885",
]);

const [groupsText, sourceManifestText] = await Promise.all([
  readFile(path.join(INPUT, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(INPUT, "MANIFEST.json"), "utf8"),
]);
const groups = parseJsonl(groupsText);
const reviews = groups.map((group) => {
  const accepted = acceptedIds.has(group.candidate_group_id);
  const reasons = accepted
    ? [
        "Both role-neutral passages contain substantive guideline, evidence, scope, or implementation content.",
        "The pair can support an answerable confirmation annotation without using retrieval outcomes.",
      ]
    : [
        referenceDominated.has(group.candidate_group_id)
          ? "At least one passage is dominated by bibliography or citation-list content."
          : null,
        methodDominated.has(group.candidate_group_id)
          ? "At least one passage is dominated by methods, PICO, GRADE table, or process content."
          : null,
        mismatchDominated.has(group.candidate_group_id)
          ? "The paired passages do not form a sufficiently coherent semantic relation."
          : null,
      ].filter(Boolean);
  return {
    schema_version: "v5-r2.12-candidate-group-semantic-review-1",
    candidate_group_id: group.candidate_group_id,
    source_family: group.source_family,
    decision: accepted
      ? "eligible_for_confirmation_annotation_authoring"
      : "rejected_before_annotation",
    reasons:
      reasons.length > 0
        ? reasons
        : ["The pair lacks a sufficiently precise two-passage annotation contract."],
    reviewer_id: "codex_semantic_reviewer",
    reviewer_type: "codex_non_owner",
    independent_blinded_or_clinical_review: false,
    query_authored_at_review_time: false,
    retrieval_outcomes_used: false,
    r2_11_outcomes_used: false,
    r2_12_diagnostic_outcomes_used: false,
  };
});
if (reviews.filter((review) => review.decision.startsWith("eligible")).length !== 33) {
  throw new Error("Expected exactly 33 eligible groups.");
}
const reviewsText = jsonl(reviews);
const manifest = {
  schema_version: "v5-r2.12-candidate-group-review-manifest-1",
  status: "codex_semantic_review_complete_not_annotation_gold",
  reviewed_group_count: reviews.length,
  eligible_group_count: 33,
  rejected_group_count: 23,
  predeclared_groups_sha256: sha256(groupsText),
  predeclared_group_manifest_sha256: sha256(sourceManifestText),
  semantic_review_sha256: sha256(reviewsText),
  project_owner_approval_required_for_future_annotations: true,
  retrieval_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "semantic_review.jsonl"), reviewsText),
  writeFile(
    path.join(OUT, "MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(manifest, null, 2));
