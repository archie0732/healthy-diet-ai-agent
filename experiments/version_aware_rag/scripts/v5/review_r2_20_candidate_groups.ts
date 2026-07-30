import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const INPUT = path.join(EXP, "data/annotations_v5/r2_20_predeclared_candidate_groups");
const OUT = path.join(EXP, "data/annotations_v5/r2_20_candidate_groups_codex_reviewed");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const acceptedIds = new Set([
  "r2.20-pre-4b26c3bc06f16ec41e",
  "r2.20-pre-633e4c418b488a0337",
  "r2.20-pre-04af467d2c0a9beb4a",
  "r2.20-pre-9f51193cd3de92a60f",
  "r2.20-pre-a30bf6a40641300994",
  "r2.20-pre-89f21959370ad2a0c0",
  "r2.20-pre-fb9ee50b1cb1fdf23c",
  "r2.20-pre-18d4fa38dbf74bd52d",
  "r2.20-pre-fd8c79b41508f1d1e4",
  "r2.20-pre-0421ae7fde8d31c624",
  "r2.20-pre-0ad908ca25bb7214cb",
  "r2.20-pre-8c7824121df732fdaf",
  "r2.20-pre-ff921f1c5901297aff",
  "r2.20-pre-7659e83189460a00d5",
  "r2.20-pre-2013a56798eb8d1094",
  "r2.20-pre-7da00aa959a482a4ce",
  "r2.20-pre-63636bc0df885b1b7d",
  "r2.20-pre-0e3d61251ebea70ea0",
  "r2.20-pre-d98387ce9936a01f9b",
  "r2.20-pre-f4fc551155ccfb07cb",
  "r2.20-pre-2cee957587b496d6df",
  "r2.20-pre-0ced2d595e2cafcad7",
  "r2.20-pre-8bd098e7ad6970088a",
  "r2.20-pre-ffd8d218efe5b36d50",
  "r2.20-pre-35ef6fa28db5d19b2d",
  "r2.20-pre-c767eb9185ce7fb403",
  "r2.20-pre-77d6eb913f6ecedae8",
  "r2.20-pre-5cb2a05216c92700f5",
  "r2.20-pre-87b052e08d3b02bc8b",
  "r2.20-pre-0faf2e7f91d1e534af",
  "r2.20-pre-d6ed5a6bdd07d5358a",
  "r2.20-pre-4af8f791e30569d087",
  "r2.20-pre-b7783fea9353c1b7e4",
  "r2.20-pre-6e9e6704c98af26aac",
  "r2.20-pre-c58427d04631c0e454",
  "r2.20-pre-d499d35ea1ec819a9b",
  "r2.20-pre-4b590bc8d78d2a8678",
  "r2.20-pre-8655fcf1fdc8e82e03",
  "r2.20-pre-caa8f8b2df4f016610",
  "r2.20-pre-45a39c54f545a891a0",
  "r2.20-pre-7eca6ffcc3a4364ea9",
  "r2.20-pre-0f565071584408f12f",
  "r2.20-pre-73268ed77fc4111b59",
  "r2.20-pre-fe9d1e63bf4f7f41b1",
  "r2.20-pre-91771407ea7cb00f21",
  "r2.20-pre-b58d67a323db4ab64d",
  "r2.20-pre-20b17981ecde51e75c",
  "r2.20-pre-6b027cfe4f24cedba9",
  "r2.20-pre-38fd0700e8ab5f4a10",
  "r2.20-pre-f6b763db251da0113b",
  "r2.20-pre-95ace1431efc4456a2",
  "r2.20-pre-64cce5316a06b42037",
  "r2.20-pre-1e9ec6fdba87963d37",
  "r2.20-pre-493cd20df864900f2c",
  "r2.20-pre-03f198c054421c3276",
  "r2.20-pre-197d98f11aafed463f",
  "r2.20-pre-61f1e5514ccef661b3",
  "r2.20-pre-47bcf4e409ec77f8c5",
  "r2.20-pre-b53992073bac25c0d3",
  "r2.20-pre-054a9f85dbabd4f837",
]);

const [groupsText, sourceManifestText] = await Promise.all([
  readFile(path.join(INPUT, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(INPUT, "MANIFEST.json"), "utf8"),
]);
const groups = parseJsonl(groupsText);
for (const id of acceptedIds) {
  if (!groups.some((group) => group.candidate_group_id === id)) {
    throw new Error(`Accepted candidate group not found: ${id}`);
  }
}
const reviews = groups.map((group) => {
  const accepted = acceptedIds.has(group.candidate_group_id);
  return {
    schema_version: "v5-r2.20-candidate-group-semantic-review-1",
    candidate_group_id: group.candidate_group_id,
    source_family: group.source_family,
    decision: accepted
      ? "eligible_for_confirmation_annotation_authoring"
      : "rejected_before_annotation",
    reasons: accepted
      ? [
          "Both passages contain substantive recommendation, effect, scope, safety, implementation, or evidence-interpretation content that can support a precise annotation contract.",
          "Supporting reviews, background documents, and evidence profiles retain their declared source roles and are not treated as independent recommendations.",
          "Eligibility was decided before query authoring and without R2.20 retrieval outcomes.",
        ]
      : [
          "The pair is dominated by methods, references, rosters, evidence-table fragments, or a topic mismatch that does not support a precise two-passage contract.",
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
if (eligibleCount < 32) {
  throw new Error(`Expected at least 32 eligible groups, received ${eligibleCount}.`);
}
const reviewsText = jsonl(reviews);
const manifest = {
  schema_version: "v5-r2.20-candidate-group-review-manifest-1",
  status: "codex_semantic_review_complete_not_annotation_gold",
  reviewed_group_count: reviews.length,
  eligible_group_count: eligibleCount,
  rejected_group_count: reviews.length - eligibleCount,
  minimum_eligible_group_count: 32,
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
