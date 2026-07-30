import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_20_predeclared_candidate_groups",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const chunkPaths = [
  "data/corpus_v4_devval_draft/chunks.jsonl",
  "data/corpus_v5_r2_11_draft/chunks.jsonl",
  "data/corpus_v5_r2_19_draft/chunks.jsonl",
];
const exclusionLedgerPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_14_frozen_confirmation/confirmation.approved.frozen.jsonl",
  "data/configs/v5_r2_16_frozen_confirmation/confirmation.approved.frozen.jsonl",
];
const priorCandidatePaths = [
  "data/annotations_v5/r2_12_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
  "data/annotations_v5/r2_14_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
  "data/annotations_v5/r2_16_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
];

const families = [
  {
    family: "potassium_review_guideline",
    leftDoc: "who-potassium-adverse-effects-review-2012",
    rightDoc: "who-potassium-2012",
    anchors: ["potassium", "blood pressure", "renal", "kidney", "adverse"],
    sourceRoles: ["systematic_review", "guideline"],
  },
  {
    family: "potassium_water_guideline",
    leftDoc: "who-potassium-drinking-water-background-2009",
    rightDoc: "who-potassium-2012",
    anchors: ["potassium", "renal", "kidney", "hyperkalaemia", "intake"],
    sourceRoles: ["background_document", "guideline"],
  },
  {
    family: "nss_review_guideline",
    leftDoc: "who-nss-systematic-review-2022",
    rightDoc: "who-nss-2023",
    anchors: ["sweetener", "weight", "diabetes", "cardiovascular", "mortality"],
    sourceRoles: ["systematic_review", "guideline"],
  },
  {
    family: "physical_activity_evidence_guideline",
    leftDoc: "who-physical-activity-web-annex-2020",
    rightDoc: "who-physical-activity-2020",
    anchors: ["physical activity", "sedentary", "disability", "pregnancy", "exercise"],
    sourceRoles: ["evidence_profile", "guideline"],
  },
  {
    family: "sodium_lsss",
    leftDoc: "who-sodium-2012",
    rightDoc: "who-lsss-2025",
    anchors: ["sodium", "salt", "blood pressure", "cardiovascular", "policy"],
    sourceRoles: ["guideline", "guideline"],
  },
  {
    family: "sugars_nss",
    leftDoc: "who-sugars-2015",
    rightDoc: "who-nss-2023",
    anchors: ["sugar", "sweetener", "dental", "weight", "intake"],
    sourceRoles: ["guideline", "guideline"],
  },
  {
    family: "legacy_total_fat",
    leftDoc: "who-fao-trs-916-2003-part2",
    rightDoc: "who-total-fat-2023",
    anchors: ["fat", "fatty", "energy", "weight", "intake"],
    sourceRoles: ["technical_report", "guideline"],
  },
  {
    family: "complementary_feeding_carbohydrate",
    leftDoc: "who-complementary-feeding-2023",
    rightDoc: "who-carbohydrate-2023",
    anchors: ["child", "children", "fruit", "vegetables", "fibre", "food"],
    sourceRoles: ["guideline", "guideline"],
  },
] as const;

const substantivePageRanges: Record<string, Array<[number, number]>> = {
  "who-potassium-adverse-effects-review-2012": [[9, 55]],
  "who-potassium-drinking-water-background-2009": [[7, 11]],
  "who-nss-systematic-review-2022": [[9, 60]],
  "who-physical-activity-web-annex-2020": [
    [8, 88],
    [99, 235],
    [239, 346],
    [354, 533],
  ],
  "who-potassium-2012": [
    [12, 27],
    [40, 42],
  ],
  "who-sodium-2012": [
    [12, 27],
    [44, 46],
  ],
  "who-sugars-2015": [[12, 26]],
  "who-nss-2023": [[8, 40]],
  "who-total-fat-2023": [[13, 35]],
  "who-carbohydrate-2023": [[13, 40]],
  "who-lsss-2025": [[18, 45]],
  "who-physical-activity-2020": [[6, 79]],
  "who-complementary-feeding-2023": [[12, 75]],
  "who-fao-trs-916-2003-part2": [
    [1, 35],
    [81, 90],
  ],
};

const [chunkTexts, exclusionTexts, priorCandidateTexts] = await Promise.all([
  Promise.all(chunkPaths.map((file) => readFile(path.join(EXP, file), "utf8"))),
  Promise.all(
    exclusionLedgerPaths.map((file) => readFile(path.join(EXP, file), "utf8")),
  ),
  Promise.all(
    priorCandidatePaths.map((file) => readFile(path.join(EXP, file), "utf8")),
  ),
]);

const excludedChunkIds = new Set<string>();
const excludedEvidenceKeys = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    for (const field of [
      "required_current_evidence",
      "required_retained_evidence",
      "deprecated_evidence",
      "forbidden_evidence",
    ]) {
      for (const item of record[field] ?? []) {
        if (item.locator?.chunk_id) excludedChunkIds.add(item.locator.chunk_id);
        if (item.source_sha256 && item.locator?.chunk_id) {
          excludedEvidenceKeys.add(`${item.source_sha256}:${item.locator.chunk_id}`);
        }
      }
    }
  }
}
for (const text of priorCandidateTexts) {
  for (const group of parseJsonl(text)) {
    for (const item of group.candidate_items) {
      excludedChunkIds.add(item.chunk_id);
      excludedEvidenceKeys.add(item.evidence_key);
    }
  }
}

const chunks = chunkTexts.flatMap(parseJsonl).filter((chunk) => {
  const lower = chunk.text.toLowerCase();
  const methodLike =
    /references|grade evidence profile|priority questions|pico format|steering group|acknowledg|declaration of interest|library cataloguing|members of the|comments received from|isbn 97|conflict of interest/.test(
      lower,
    );
  const pageAllowed = (substantivePageRanges[chunk.document_id] ?? []).some(
    ([start, end]) => chunk.page_number >= start && chunk.page_number <= end,
  );
  const urlCount = (lower.match(/https?:\/\//g) ?? []).length;
  return (
    !excludedChunkIds.has(chunk.chunk_id) &&
    !excludedEvidenceKeys.has(`${chunk.source_checksum}:${chunk.chunk_id}`) &&
    chunk.text.length >= 220 &&
    chunk.text.length <= 4200 &&
    !methodLike &&
    pageAllowed &&
    urlCount <= 1
  );
});

const STOP = new Set(
  "the and that with from this were have has into their which when where what should can may for are not but all any its they them also than such been being".split(
    " ",
  ),
);
const terms = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3 && !STOP.has(token)),
  );
const overlap = (left: Set<string>, right: Set<string>) => {
  const common = [...left].filter((term) => right.has(term)).length;
  return common / Math.max(1, new Set([...left, ...right]).size);
};

const groups: any[] = [];
const globallyUsed = new Set<string>();
for (const family of families) {
  const side = (documentId: string) =>
    chunks
      .filter((chunk) => chunk.document_id === documentId)
      .map((chunk) => ({
        chunk,
        anchorCount: family.anchors.filter((anchor) =>
          chunk.text.toLowerCase().includes(anchor),
        ).length,
        terms: terms(chunk.text),
      }))
      .filter((entry) => entry.anchorCount >= 1)
      .sort(
        (a, b) =>
          b.anchorCount - a.anchorCount ||
          a.chunk.chunk_id.localeCompare(b.chunk.chunk_id),
      )
      .slice(0, 80);
  const left = side(family.leftDoc);
  const right = side(family.rightDoc);
  const pairs = left
    .flatMap((a) =>
      right.map((b) => {
        const sharedAnchors = family.anchors.filter(
          (anchor) =>
            a.chunk.text.toLowerCase().includes(anchor) &&
            b.chunk.text.toLowerCase().includes(anchor),
        ).length;
        return {
          a,
          b,
          sharedAnchors,
          score:
            sharedAnchors / family.anchors.length + overlap(a.terms, b.terms),
        };
      }),
    )
    .filter((pair) => pair.sharedAnchors > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.a.chunk.chunk_id.localeCompare(b.a.chunk.chunk_id) ||
        a.b.chunk.chunk_id.localeCompare(b.b.chunk.chunk_id),
    );
  let count = 0;
  for (const pair of pairs) {
    if (count === 10) break;
    if (
      globallyUsed.has(pair.a.chunk.chunk_id) ||
      globallyUsed.has(pair.b.chunk.chunk_id)
    ) {
      continue;
    }
    globallyUsed.add(pair.a.chunk.chunk_id);
    globallyUsed.add(pair.b.chunk.chunk_id);
    const items = [pair.a.chunk, pair.b.chunk].map((chunk, index) => ({
      evidence_key: `${chunk.source_checksum}:${chunk.chunk_id}`,
      chunk_id: chunk.chunk_id,
      document_id: chunk.document_id,
      source_role: family.sourceRoles[index],
      source_sha256: chunk.source_checksum,
      page_number: chunk.page_number,
      text: chunk.text,
    }));
    groups.push({
      schema_version: "v5-r2.20-predeclared-candidate-group-1",
      candidate_group_id: `r2.20-pre-${sha256(
        `${family.family}|${items
          .map((item) => item.evidence_key)
          .sort()
          .join("|")}`,
      ).slice(0, 18)}`,
      source_family: family.family,
      creation_method:
        "quality_filtered_role_neutral_lexical_pairing_before_query_authoring",
      lexical_pair_score: pair.score,
      shared_anchor_count: pair.sharedAnchors,
      candidate_items: items,
      annotation_role_assigned: false,
      query_authored: false,
      retrieval_outcomes_used: false,
      prior_cycle_outcomes_used: false,
    });
    count++;
  }
  if (count < 6) {
    throw new Error(`${family.family} produced only ${count} groups.`);
  }
}

const groupsText = jsonl(groups);
const manifest = {
  schema_version: "v5-r2.20-predeclared-candidate-group-manifest-1",
  status: "predeclared_candidate_groups_not_annotation_gold",
  development_confirmation_only: true,
  group_count: groups.length,
  candidate_item_count: groups.length * 2,
  source_family_counts: Object.fromEntries(
    families.map(({ family }) => [
      family,
      groups.filter((group) => group.source_family === family).length,
    ]),
  ),
  supporting_source_roles_preserved: true,
  excluded_prior_chunk_count: excludedChunkIds.size,
  excluded_prior_evidence_key_count: excludedEvidenceKeys.size,
  required_or_candidate_chunk_overlap_with_prior_cycles: groups
    .flatMap((group) => group.candidate_items)
    .filter(
      (item) =>
        excludedChunkIds.has(item.chunk_id) ||
        excludedEvidenceKeys.has(item.evidence_key),
    ).length,
  candidate_groups_sha256: sha256(groupsText),
  input_sha256: {
    ...Object.fromEntries(
      chunkPaths.map((file, index) => [file, sha256(chunkTexts[index])]),
    ),
    ...Object.fromEntries(
      exclusionLedgerPaths.map((file, index) => [
        file,
        sha256(exclusionTexts[index]),
      ]),
    ),
    ...Object.fromEntries(
      priorCandidatePaths.map((file, index) => [
        file,
        sha256(priorCandidateTexts[index]),
      ]),
    ),
  },
  retrieval_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "candidate_groups.predeclared.jsonl"), groupsText),
  writeFile(
    path.join(OUT, "MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(manifest, null, 2));
