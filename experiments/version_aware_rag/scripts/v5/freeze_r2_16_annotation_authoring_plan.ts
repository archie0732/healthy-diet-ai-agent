import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const GROUPS = path.join(EXP, "data/annotations_v5/r2_16_predeclared_candidate_groups");
const REVIEWS = path.join(EXP, "data/annotations_v5/r2_16_candidate_groups_codex_reviewed");
const OUT = path.join(EXP, "data/annotations_v5/r2_16_annotation_authoring_plan");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const assignments = {
  conditional_merge: [
    "703689c89004755263", "c6d532c5af83fc3371", "b2931d596a23cf9839",
    "6c2d1b28ad847c4bd7", "a4f4fc0f67145895c0", "6ef924ad23f53e31a7",
    "ed4d89acda9db97b13", "dd5ade3a1049de2dc2", "d4c48b15f1866838a1",
    "050ef281c77de3a4d4",
  ],
  compatible_history: [
    "1e7d714155537600e8", "7941fda0eb2e05b0c0", "6adfabdaf0c355bee8",
    "ff84ea3fd8039afcfa", "7bded2564bff2d95d5", "3c9c281ae886c607e4",
    "ac58826b381b14a8a8", "f21a43a574d1fb8825", "a2bc68acff443cecec",
    "486fc9f537400be322",
  ],
  current_only: [
    "3a8351f234b6a09ff2", "177034cdb84da730de", "27d1a747b7341d21d0",
    "d3e53edc319d983ba4", "393874689bad475e36", "ff25aa92c3a8100025",
  ],
  hard_negative_current: [
    "41fc59212160a157d5", "b837610d2d55ebe2d4", "58cf931af6acc584ac",
    "c427ada3d4f355727e", "d77be7d78e6e335719", "2efeda6b21e35bba0f",
  ],
};
const [groupsText, groupManifestText, reviewsText, reviewManifestText] =
  await Promise.all([
    readFile(path.join(GROUPS, "candidate_groups.predeclared.jsonl"), "utf8"),
    readFile(path.join(GROUPS, "MANIFEST.json"), "utf8"),
    readFile(path.join(REVIEWS, "semantic_review.jsonl"), "utf8"),
    readFile(path.join(REVIEWS, "MANIFEST.json"), "utf8"),
  ]);
const groups = new Map(
  parseJsonl(groupsText).map((group) => [group.candidate_group_id, group]),
);
const eligible = new Set(
  parseJsonl(reviewsText)
    .filter((review) => review.decision.startsWith("eligible"))
    .map((review) => review.candidate_group_id),
);
const rows = Object.entries(assignments).flatMap(([stratum, suffixes]) =>
  suffixes.map((suffix) => {
    const candidateGroupId = `r2.16-pre-${suffix}`;
    if (!groups.has(candidateGroupId) || !eligible.has(candidateGroupId)) {
      throw new Error(`Ineligible authoring group: ${candidateGroupId}`);
    }
    return {
      schema_version: "v5-r2.16-annotation-authoring-plan-1",
      candidate_group_id: candidateGroupId,
      stratum,
      query_authored: false,
      evidence_roles_assigned: false,
      retrieval_outcomes_used: false,
    };
  }),
);
if (rows.length !== 32 || new Set(rows.map((row) => row.candidate_group_id)).size !== 32) {
  throw new Error("R2.16 authoring plan must contain 32 unique groups.");
}
const planText = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const manifest = {
  schema_version: "v5-r2.16-annotation-authoring-plan-manifest-1",
  status: "authoring_plan_frozen_before_query_authoring",
  record_count: rows.length,
  stratum_counts: Object.fromEntries(
    Object.keys(assignments).map((stratum) => [
      stratum,
      rows.filter((row) => row.stratum === stratum).length,
    ]),
  ),
  candidate_groups_sha256: sha256(groupsText),
  candidate_group_manifest_sha256: sha256(groupManifestText),
  semantic_review_sha256: sha256(reviewsText),
  semantic_review_manifest_sha256: sha256(reviewManifestText),
  authoring_plan_sha256: sha256(planText),
  retrieval_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "authoring_plan.frozen.jsonl"), planText),
  writeFile(path.join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify(manifest, null, 2));
