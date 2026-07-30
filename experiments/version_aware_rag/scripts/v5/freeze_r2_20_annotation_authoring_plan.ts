import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const GROUPS = path.join(EXP, "data/annotations_v5/r2_20_predeclared_candidate_groups");
const REVIEWS = path.join(EXP, "data/annotations_v5/r2_20_candidate_groups_codex_reviewed");
const OUT = path.join(EXP, "data/annotations_v5/r2_20_annotation_authoring_plan");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

const assignments = {
  conditional_merge: [
    "4b26c3bc06f16ec41e", "9f51193cd3de92a60f",
    "2013a56798eb8d1094", "63636bc0df885b1b7d",
    "87b052e08d3b02bc8b", "c58427d04631c0e454",
    "0ced2d595e2cafcad7", "ffd8d218efe5b36d50",
    "73268ed77fc4111b59", "91771407ea7cb00f21",
  ],
  compatible_history: [
    "18d4fa38dbf74bd52d", "8c7824121df732fdaf",
    "7da00aa959a482a4ce", "0e3d61251ebea70ea0",
    "2cee957587b496d6df", "35ef6fa28db5d19b2d",
    "77d6eb913f6ecedae8", "d6ed5a6bdd07d5358a",
    "fe9d1e63bf4f7f41b1", "6b027cfe4f24cedba9",
  ],
  current_only: [
    "fb9ee50b1cb1fdf23c", "d98387ce9936a01f9b",
    "c767eb9185ce7fb403", "4af8f791e30569d087",
    "1e9ec6fdba87963d37", "20b17981ecde51e75c",
  ],
  hard_negative_current: [
    "0ad908ca25bb7214cb", "f4fc551155ccfb07cb",
    "8bd098e7ad6970088a", "b7783fea9353c1b7e4",
    "197d98f11aafed463f", "b58d67a323db4ab64d",
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
    const candidateGroupId = `r2.20-pre-${suffix}`;
    const group: any = groups.get(candidateGroupId);
    if (!group || !eligible.has(candidateGroupId)) {
      throw new Error(`Ineligible authoring group: ${candidateGroupId}`);
    }
    return {
      schema_version: "v5-r2.20-annotation-authoring-plan-1",
      candidate_group_id: candidateGroupId,
      stratum,
      source_documents: group.candidate_items.map(
        (item: any) => item.document_id,
      ),
      query_authored: false,
      evidence_roles_assigned: false,
      retrieval_outcomes_used: false,
    };
  }),
);
if (rows.length !== 32 || new Set(rows.map((row) => row.candidate_group_id)).size !== 32) {
  throw new Error("R2.20 authoring plan must contain 32 unique groups.");
}
const sourceCaps: Record<string, number> = {
  conditional_merge: 2,
  compatible_history: 2,
  current_only: 1,
  hard_negative_current: 1,
};
const sourceDocumentCounts: Record<string, Record<string, number>> = {};
for (const stratum of Object.keys(assignments)) {
  const counts: Record<string, number> = {};
  for (const row of rows.filter((entry) => entry.stratum === stratum)) {
    for (const documentId of new Set(row.source_documents)) {
      counts[documentId] = (counts[documentId] ?? 0) + 1;
    }
  }
  if (Object.values(counts).some((count) => count > sourceCaps[stratum])) {
    throw new Error(`Source-document cap exceeded in ${stratum}: ${JSON.stringify(counts)}`);
  }
  sourceDocumentCounts[stratum] = counts;
}
const planText = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const manifest = {
  schema_version: "v5-r2.20-annotation-authoring-plan-manifest-1",
  status: "authoring_plan_frozen_before_query_authoring",
  record_count: rows.length,
  stratum_counts: Object.fromEntries(
    Object.keys(assignments).map((stratum) => [
      stratum,
      rows.filter((row) => row.stratum === stratum).length,
    ]),
  ),
  source_document_caps: sourceCaps,
  source_document_counts: sourceDocumentCounts,
  source_document_caps_satisfied: true,
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
