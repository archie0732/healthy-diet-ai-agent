import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_12_predeclared_candidate_groups",
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
const normalizePath = (value: string) => value.replaceAll("\\", "/");

type Chunk = {
  chunk_id: string;
  document_id: string;
  source_checksum: string;
  page_number: number;
  text: string;
};
type Family = {
  id: string;
  leftDocument: string;
  rightDocument: string;
  anchors: string[];
  groupCount: number;
};

const chunkPaths = [
  "data/corpus_v4_devval_draft/chunks.jsonl",
  "data/corpus_v5_r2_11_draft/chunks.jsonl",
];
const exclusionPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
];
const families: Family[] = [
  {
    id: "sodium_lsss",
    leftDocument: "who-sodium-2012",
    rightDocument: "who-lsss-2025",
    anchors: ["sodium", "salt", "blood", "pressure", "policy", "intervention"],
    groupCount: 8,
  },
  {
    id: "potassium_lsss",
    leftDocument: "who-potassium-2012",
    rightDocument: "who-lsss-2025",
    anchors: ["potassium", "salt", "kidney", "renal", "pressure", "excretion"],
    groupCount: 8,
  },
  {
    id: "sugars_nss",
    leftDocument: "who-sugars-2015",
    rightDocument: "who-nss-2023",
    anchors: ["sugar", "sugars", "sweetener", "dental", "weight", "intake"],
    groupCount: 8,
  },
  {
    id: "legacy_total_fat",
    leftDocument: "who-fao-trs-916-2003-part2",
    rightDocument: "who-total-fat-2023",
    anchors: ["fat", "fats", "fatty", "energy", "weight", "intake"],
    groupCount: 8,
  },
  {
    id: "legacy_saturated_trans_fat",
    leftDocument: "who-fao-trs-916-2003-part2",
    rightDocument: "who-sat-trans-fat-2023",
    anchors: [
      "fat",
      "fatty",
      "saturated",
      "trans",
      "replacement",
      "cholesterol",
    ],
    groupCount: 8,
  },
  {
    id: "legacy_carbohydrate",
    leftDocument: "who-fao-trs-916-2003-part2",
    rightDocument: "who-carbohydrate-2023",
    anchors: [
      "carbohydrate",
      "fibre",
      "fiber",
      "fruit",
      "vegetables",
      "intake",
    ],
    groupCount: 8,
  },
  {
    id: "physical_activity",
    leftDocument: "who-physical-activity-2010",
    rightDocument: "who-physical-activity-2020",
    anchors: [
      "physical",
      "activity",
      "sedentary",
      "injury",
      "disability",
      "health",
    ],
    groupCount: 8,
  },
];

const [chunkTexts, exclusionTexts] = await Promise.all([
  Promise.all(
    chunkPaths.map((relativePath) =>
      readFile(path.join(EXP, relativePath), "utf8"),
    ),
  ),
  Promise.all(
    exclusionPaths.map((relativePath) =>
      readFile(path.join(EXP, relativePath), "utf8"),
    ),
  ),
]);
const chunks = chunkTexts.flatMap(parseJsonl) as Chunk[];
const forbiddenEvidenceKeys = new Set<string>();
const forbiddenChunkIds = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    for (const field of [
      "required_current_evidence",
      "required_retained_evidence",
      "deprecated_evidence",
      "forbidden_evidence",
    ]) {
      for (const evidence of record[field] ?? []) {
        const chunkId = evidence.locator?.chunk_id;
        if (typeof chunkId === "string") {
          forbiddenChunkIds.add(chunkId);
          forbiddenEvidenceKeys.add(`${evidence.source_sha256}:${chunkId}`);
        }
      }
    }
  }
}

const STOP = new Set(
  "the and that with from this were have has into their which when where what who how should can may for are not but all any its they them also than such been being".split(
    " ",
  ),
);
const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3 && !STOP.has(token)),
  );
const jaccard = (left: Set<string>, right: Set<string>) => {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};
const candidateChunks = chunks.filter(
  (chunk) =>
    !forbiddenChunkIds.has(chunk.chunk_id) &&
    chunk.text.length >= 180 &&
    chunk.text.length <= 5000,
);
const globallyUsed = new Set<string>();
const groups: any[] = [];
for (const family of families) {
  const rankSide = (documentId: string) =>
    candidateChunks
      .filter((chunk) => chunk.document_id === documentId)
      .map((chunk) => {
        const lower = chunk.text.toLowerCase();
        const anchorCount = family.anchors.filter((anchor) =>
          lower.includes(anchor),
        ).length;
        return { chunk, anchorCount, terms: tokens(chunk.text) };
      })
      .filter((entry) => entry.anchorCount > 0)
      .sort(
        (left, right) =>
          right.anchorCount - left.anchorCount ||
          left.chunk.chunk_id.localeCompare(right.chunk.chunk_id),
      )
      .slice(0, 48);
  const left = rankSide(family.leftDocument);
  const right = rankSide(family.rightDocument);
  const pairCandidates = left
    .flatMap((leftEntry) =>
      right.map((rightEntry) => {
        const sharedAnchors = family.anchors.filter(
          (anchor) =>
            leftEntry.chunk.text.toLowerCase().includes(anchor) &&
            rightEntry.chunk.text.toLowerCase().includes(anchor),
        ).length;
        return {
          left: leftEntry.chunk,
          right: rightEntry.chunk,
          score:
            sharedAnchors / family.anchors.length +
            jaccard(leftEntry.terms, rightEntry.terms),
          sharedAnchors,
        };
      }),
    )
    .filter((pair) => pair.sharedAnchors > 0)
    .sort(
      (leftPair, rightPair) =>
        rightPair.score - leftPair.score ||
        leftPair.left.chunk_id.localeCompare(rightPair.left.chunk_id) ||
        leftPair.right.chunk_id.localeCompare(rightPair.right.chunk_id),
    );
  let selectedCount = 0;
  for (const pair of pairCandidates) {
    if (selectedCount >= family.groupCount) break;
    if (
      globallyUsed.has(pair.left.chunk_id) ||
      globallyUsed.has(pair.right.chunk_id)
    ) {
      continue;
    }
    globallyUsed.add(pair.left.chunk_id);
    globallyUsed.add(pair.right.chunk_id);
    const keys = [pair.left, pair.right].map(
      (chunk) => `${chunk.source_checksum}:${chunk.chunk_id}`,
    );
    const groupId = `r2.12-pre-${sha256(
      `${family.id}|${keys.sort().join("|")}`,
    ).slice(0, 18)}`;
    groups.push({
      schema_version: "v5-r2.12-predeclared-candidate-group-1",
      candidate_group_id: groupId,
      source_family: family.id,
      creation_method:
        "deterministic_role_neutral_lexical_pairing_before_query_authoring",
      lexical_pair_score: pair.score,
      shared_anchor_count: pair.sharedAnchors,
      candidate_items: [pair.left, pair.right].map((chunk) => ({
        evidence_key: `${chunk.source_checksum}:${chunk.chunk_id}`,
        chunk_id: chunk.chunk_id,
        document_id: chunk.document_id,
        source_sha256: chunk.source_checksum,
        page_number: chunk.page_number,
        text: chunk.text,
      })),
      annotation_role_assigned: false,
      query_authored: false,
      retrieval_outcomes_used: false,
      r2_11_outcomes_used: false,
      r2_12_diagnostic_outcomes_used: false,
    });
    selectedCount++;
  }
  if (selectedCount !== family.groupCount) {
    throw new Error(
      `${family.id} produced ${selectedCount}/${family.groupCount} groups.`,
    );
  }
}
const groupsText = jsonl(groups);
const manifest = {
  schema_version: "v5-r2.12-predeclared-candidate-group-manifest-1",
  status: "predeclared_candidate_groups_not_annotation_gold",
  created_at: "2026-07-26T00:00:00.000+08:00",
  development_confirmation_only: true,
  query_authoring_allowed_after_this_freeze: true,
  retrieval_allowed: false,
  group_count: groups.length,
  candidate_item_count: groups.reduce(
    (sum, group) => sum + group.candidate_items.length,
    0,
  ),
  source_family_counts: Object.fromEntries(
    families.map((family) => [
      family.id,
      groups.filter((group) => group.source_family === family.id).length,
    ]),
  ),
  excluded_prior_chunk_count: forbiddenChunkIds.size,
  excluded_prior_evidence_key_count: forbiddenEvidenceKeys.size,
  chunk_input_sha256: Object.fromEntries(
    chunkPaths.map((relativePath, index) => [
      relativePath,
      sha256(chunkTexts[index]),
    ]),
  ),
  exclusion_input_sha256: Object.fromEntries(
    exclusionPaths.map((relativePath, index) => [
      relativePath,
      sha256(exclusionTexts[index]),
    ]),
  ),
  candidate_groups_path: normalizePath(
    path.relative(EXP, path.join(OUT, "candidate_groups.predeclared.jsonl")),
  ),
  candidate_groups_sha256: sha256(groupsText),
  construction_script_sha256: sha256(
    await readFile(
      path.join(EXP, "scripts/v5/mine_r2_12_predeclared_candidate_groups.ts"),
    ),
  ),
  required_evidence_overlap_with_exclusions: groups
    .flatMap((group) => group.candidate_items)
    .filter((item) => forbiddenEvidenceKeys.has(item.evidence_key)).length,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(
    path.join(OUT, "candidate_groups.predeclared.jsonl"),
    groupsText,
  ),
  writeFile(
    path.join(OUT, "MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(manifest, null, 2));
