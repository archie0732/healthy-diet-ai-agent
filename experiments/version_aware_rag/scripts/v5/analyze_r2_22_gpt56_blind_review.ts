import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const REVIEW_DIR = path.join(
  EXP,
  "data/annotations_v5/r2_22_gpt56_blind_review",
);
const SEALED_DIR = path.join(
  EXP,
  "data/configs/v5_r2_22_gpt56_blind_review",
);
const RESULT_JSON = path.join(REVIEW_DIR, "AGREEMENT_RESULT.json");
const RESULT_MD = path.join(EXP, "V5_R2_22_GPT56_BLIND_REVIEW_RESULT.md");

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

const answerabilityValues = new Set([
  "fully_answerable",
  "partially_answerable",
  "not_answerable",
]);
const contractValues = new Set([
  "both_required",
  "a_primary_b_supporting",
  "b_primary_a_supporting",
  "a_only",
  "b_only",
  "neither",
]);
const candidateValues = new Set([
  "required",
  "supporting",
  "relevant_but_not_required",
  "unsafe_or_misleading",
  "irrelevant",
]);

const [reviewText, mappingText, manifestText] = await Promise.all([
  readFile(path.join(REVIEW_DIR, "GPT56_BLIND_REVIEW.jsonl"), "utf8"),
  readFile(path.join(SEALED_DIR, "SEALED_MAPPING.jsonl"), "utf8"),
  readFile(path.join(REVIEW_DIR, "MANIFEST.json"), "utf8"),
]);
const reviews = parseJsonl(reviewText);
const mappings = parseJsonl(mappingText);
const manifest = JSON.parse(manifestText);

const errors: string[] = [];
if (reviews.length !== 32) errors.push(`Expected 32 reviews, got ${reviews.length}`);
if (mappings.length !== 32) errors.push(`Expected 32 mappings, got ${mappings.length}`);
if (sha256(mappingText) !== manifest.sealed_mapping_sha256) {
  errors.push("Sealed mapping checksum mismatch");
}
const reviewById = new Map<string, any>();
for (const review of reviews) {
  if (reviewById.has(review.blind_item_id)) {
    errors.push(`Duplicate ${review.blind_item_id}`);
  }
  reviewById.set(review.blind_item_id, review);
  if (review.schema_version !== "v5-r2.22-gpt56-blind-review-1") {
    errors.push(`Invalid schema ${review.blind_item_id}`);
  }
  if (review.reviewer_id !== "gpt-5.6-sol_independent_context_reviewer") {
    errors.push(`Invalid reviewer ${review.blind_item_id}`);
  }
  if (!answerabilityValues.has(review.answerability)) {
    errors.push(`Invalid answerability ${review.blind_item_id}`);
  }
  if (!contractValues.has(review.evidence_contract)) {
    errors.push(`Invalid contract ${review.blind_item_id}`);
  }
  if (!candidateValues.has(review.candidate_a)) {
    errors.push(`Invalid candidate_a ${review.blind_item_id}`);
  }
  if (!candidateValues.has(review.candidate_b)) {
    errors.push(`Invalid candidate_b ${review.blind_item_id}`);
  }
  if (!Number.isInteger(review.confidence) || review.confidence < 1 || review.confidence > 5) {
    errors.push(`Invalid confidence ${review.blind_item_id}`);
  }
  if (typeof review.rationale !== "string" || !review.rationale.trim()) {
    errors.push(`Missing rationale ${review.blind_item_id}`);
  }
}
for (const mapping of mappings) {
  if (!reviewById.has(mapping.blind_item_id)) {
    errors.push(`Missing ${mapping.blind_item_id}`);
  }
}
if (errors.length) throw new Error(JSON.stringify(errors, null, 2));

const implicitStrata = new Set(["conditional_merge", "compatible_history"]);
const rows = mappings.map((mapping) => {
  const review = reviewById.get(mapping.blind_item_id);
  const implicit = implicitStrata.has(mapping.stratum);
  const rightLabel = mapping.candidate_a_original_side === "right" ? "a" : "b";
  const leftLabel = rightLabel === "a" ? "b" : "a";
  const exactGoldContract = implicit ? "both_required" : `${rightLabel}_only`;
  const contractExact = review.evidence_contract === exactGoldContract;
  const contractRoleCompatible = implicit
    ? new Set([
        "both_required",
        "a_primary_b_supporting",
        "b_primary_a_supporting",
      ]).has(review.evidence_contract)
    : contractExact;
  const currentJudgment = review[`candidate_${rightLabel}`];
  const leftJudgment = review[`candidate_${leftLabel}`];
  const currentAgrees = currentJudgment === "required";
  const leftAgrees = implicit
    ? new Set(["required", "supporting"]).has(leftJudgment)
    : mapping.stratum === "hard_negative_current"
      ? new Set(["unsafe_or_misleading", "irrelevant"]).has(leftJudgment)
      : new Set(["relevant_but_not_required", "irrelevant"]).has(leftJudgment);
  return {
    blind_item_id: mapping.blind_item_id,
    query_id: mapping.query_id,
    stratum: mapping.stratum,
    answerability: review.answerability,
    confidence: review.confidence,
    reviewer_contract: review.evidence_contract,
    expected_contract: exactGoldContract,
    contract_exact: contractExact,
    contract_role_compatible: contractRoleCompatible,
    current_candidate_agreement: currentAgrees,
    paired_candidate_agreement: leftAgrees,
    rationale: review.rationale,
  };
});

const rate = (values: boolean[]) =>
  values.length ? values.filter(Boolean).length / values.length : 0;
const summarize = (subset: typeof rows) => ({
  n: subset.length,
  contract_exact: rate(subset.map((row) => row.contract_exact)),
  contract_role_compatible: rate(
    subset.map((row) => row.contract_role_compatible),
  ),
  current_candidate_agreement: rate(
    subset.map((row) => row.current_candidate_agreement),
  ),
  paired_candidate_agreement: rate(
    subset.map((row) => row.paired_candidate_agreement),
  ),
  fully_answerable: rate(
    subset.map((row) => row.answerability === "fully_answerable"),
  ),
  mean_confidence:
    subset.reduce((sum, row) => sum + row.confidence, 0) / subset.length,
});
const strata = [
  "conditional_merge",
  "compatible_history",
  "current_only",
  "hard_negative_current",
];
const result = {
  schema_version: "v5-r2.22-gpt56-blind-review-result-1",
  status: "complete",
  interpretation:
    "Supplemental independent-context AI triangulation; not independent human, clinical, or expert review.",
  review_count: reviews.length,
  schema_error_count: errors.length,
  reviewer_id: "gpt-5.6-sol_independent_context_reviewer",
  checksums: {
    blind_packet_sha256: manifest.packet_sha256,
    blind_instructions_sha256: manifest.instructions_sha256,
    sealed_mapping_sha256: manifest.sealed_mapping_sha256,
    gpt56_review_sha256: sha256(reviewText),
  },
  overall: summarize(rows),
  by_stratum: Object.fromEntries(
    strata.map((stratum) => [
      stratum,
      summarize(rows.filter((row) => row.stratum === stratum)),
    ]),
  ),
  answerability_counts: Object.fromEntries(
    [...answerabilityValues].map((value) => [
      value,
      rows.filter((row) => row.answerability === value).length,
    ]),
  ),
  disagreements: rows.filter(
    (row) =>
      !row.contract_role_compatible ||
      !row.current_candidate_agreement ||
      !row.paired_candidate_agreement,
  ),
};
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const md = `# V5 R2.22 GPT-5.6 Blinded Review Result

Date completed: 2026-07-28  
Scope: 32 owner-approved R2.20 Development-confirmation questions

## Outcome

The isolated-context GPT-5.6 reviewer completed ${reviews.length}/32 items with
${errors.length} schema errors. This is supplemental AI triangulation, not an
independent human, clinical, or expert review.

| Measure | Overall |
|---|---:|
| Exact evidence-contract agreement | ${pct(result.overall.contract_exact)} |
| Role-compatible evidence-contract agreement | ${pct(result.overall.contract_role_compatible)} |
| Current-candidate agreement | ${pct(result.overall.current_candidate_agreement)} |
| Paired-candidate agreement | ${pct(result.overall.paired_candidate_agreement)} |
| Fully answerable | ${pct(result.overall.fully_answerable)} |
| Mean confidence | ${result.overall.mean_confidence.toFixed(2)} / 5 |

## By stratum

| Stratum | n | Exact contract | Role-compatible contract | Current candidate | Paired candidate |
|---|---:|---:|---:|---:|---:|
${strata
  .map((stratum) => {
    const value = result.by_stratum[stratum];
    return `| ${stratum} | ${value.n} | ${pct(value.contract_exact)} | ${pct(value.contract_role_compatible)} | ${pct(value.current_candidate_agreement)} | ${pct(value.paired_candidate_agreement)} |`;
  })
  .join("\n")}

## Disclosure boundary

The reviewer saw only a checksum-frozen, A/B-order-randomized packet and fixed
rubric. It did not see original IDs, strata, gold roles, retrieval rankings, or
R2.20/R2.21 outcomes. Because the reviewer is an AI system and may share model
family or training-data biases with annotation tooling, the result supports
robustness triangulation only and does not replace blinded human or clinical
validation.

## Disagreements

${result.disagreements.length
  ? result.disagreements
      .map(
        (row) =>
          `- \`${row.query_id}\` (${row.stratum}): reviewer=${row.reviewer_contract}, expected=${row.expected_contract}; current=${row.current_candidate_agreement}; paired=${row.paired_candidate_agreement}. ${row.rationale}`,
      )
      .join("\n")
  : "- None under the preregistered role-compatible mapping."}
`;

await Promise.all([
  writeFile(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`),
  writeFile(RESULT_MD, md),
]);
console.log(JSON.stringify(result, null, 2));
