import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_14_predeclared_candidate_groups",
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
];
const exclusionLedgerPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/confirmation.approved.frozen.jsonl",
];
const priorCandidatePath =
  "data/annotations_v5/r2_12_predeclared_candidate_groups/candidate_groups.predeclared.jsonl";
const families = [
  ["sodium_lsss", "who-sodium-2012", "who-lsss-2025", ["sodium", "salt", "pressure", "cardiovascular", "policy"]],
  ["potassium_lsss", "who-potassium-2012", "who-lsss-2025", ["potassium", "salt", "renal", "kidney", "pressure"]],
  ["sugars_nss", "who-sugars-2015", "who-nss-2023", ["sugar", "sugars", "sweetener", "dental", "weight"]],
  ["legacy_total_fat", "who-fao-trs-916-2003-part2", "who-total-fat-2023", ["fat", "fatty", "energy", "weight", "intake"]],
  ["legacy_sat_trans", "who-fao-trs-916-2003-part2", "who-sat-trans-fat-2023", ["fat", "saturated", "trans", "replacement", "cholesterol"]],
  ["legacy_carbohydrate", "who-fao-trs-916-2003-part2", "who-carbohydrate-2023", ["carbohydrate", "fibre", "fiber", "fruit", "vegetables"]],
  ["physical_activity", "who-physical-activity-2010", "who-physical-activity-2020", ["physical", "activity", "sedentary", "injury", "disability"]],
] as const;
const [chunkTexts, exclusionTexts, priorCandidateText] = await Promise.all([
  Promise.all(chunkPaths.map((file) => readFile(path.join(EXP, file), "utf8"))),
  Promise.all(
    exclusionLedgerPaths.map((file) => readFile(path.join(EXP, file), "utf8")),
  ),
  readFile(path.join(EXP, priorCandidatePath), "utf8"),
]);
const excludedChunkIds = new Set<string>();
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
      }
    }
  }
}
for (const group of parseJsonl(priorCandidateText)) {
  for (const item of group.candidate_items) excludedChunkIds.add(item.chunk_id);
}
const chunks = chunkTexts.flatMap(parseJsonl).filter((chunk) => {
  const lower = chunk.text.toLowerCase();
  const methodLike =
    /references|grade evidence profile|priority questions|pico format|steering group|acknowledg/.test(
      lower,
    );
  const urlCount = (lower.match(/https?:\/\//g) ?? []).length;
  return (
    !excludedChunkIds.has(chunk.chunk_id) &&
    chunk.text.length >= 220 &&
    chunk.text.length <= 4200 &&
    !methodLike &&
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
for (const [family, leftDoc, rightDoc, anchors] of families) {
  const side = (documentId: string) =>
    chunks
      .filter((chunk) => chunk.document_id === documentId)
      .map((chunk) => ({
        chunk,
        anchorCount: anchors.filter((anchor) =>
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
      .slice(0, 60);
  const left = side(leftDoc);
  const right = side(rightDoc);
  const pairs = left
    .flatMap((a) =>
      right.map((b) => {
        const sharedAnchors = anchors.filter(
          (anchor) =>
            a.chunk.text.toLowerCase().includes(anchor) &&
            b.chunk.text.toLowerCase().includes(anchor),
        ).length;
        return {
          a,
          b,
          sharedAnchors,
          score: sharedAnchors / anchors.length + overlap(a.terms, b.terms),
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
    )
      continue;
    globallyUsed.add(pair.a.chunk.chunk_id);
    globallyUsed.add(pair.b.chunk.chunk_id);
    const items = [pair.a.chunk, pair.b.chunk].map((chunk) => ({
      evidence_key: `${chunk.source_checksum}:${chunk.chunk_id}`,
      chunk_id: chunk.chunk_id,
      document_id: chunk.document_id,
      source_sha256: chunk.source_checksum,
      page_number: chunk.page_number,
      text: chunk.text,
    }));
    groups.push({
      schema_version: "v5-r2.14-predeclared-candidate-group-1",
      candidate_group_id: `r2.14-pre-${sha256(
        `${family}|${items.map((item) => item.evidence_key).sort().join("|")}`,
      ).slice(0, 18)}`,
      source_family: family,
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
  if (count !== 10) throw new Error(`${family} produced ${count}/10 groups.`);
}
const groupsText = jsonl(groups);
const manifest = {
  schema_version: "v5-r2.14-predeclared-candidate-group-manifest-1",
  status: "predeclared_candidate_groups_not_annotation_gold",
  development_confirmation_only: true,
  group_count: groups.length,
  candidate_item_count: groups.length * 2,
  source_family_counts: Object.fromEntries(
    families.map(([family]) => [
      family,
      groups.filter((group) => group.source_family === family).length,
    ]),
  ),
  excluded_prior_chunk_count: excludedChunkIds.size,
  required_or_candidate_chunk_overlap_with_prior_cycles: groups
    .flatMap((group) => group.candidate_items)
    .filter((item) => excludedChunkIds.has(item.chunk_id)).length,
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
    [priorCandidatePath]: sha256(priorCandidateText),
  },
  retrieval_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "candidate_groups.predeclared.jsonl"), groupsText),
  writeFile(path.join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify(manifest, null, 2));
