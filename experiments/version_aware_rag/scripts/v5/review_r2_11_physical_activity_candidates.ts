import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateR211DevelopmentLedger } from "../../src/annotation/validate_r2_11_development";

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(
  ROOT,
  "experiments/version_aware_rag/data/annotations_v5/r2_11_candidate_mining/physical_activity_candidates.jsonl",
);
const OUTPUT_DIR = path.join(
  ROOT,
  "experiments/version_aware_rag/data/annotations_v5/r2_11_physical_activity_codex_reviewed",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const decisions = {
  "r2.11-pa-cand-001": {
    decision: "reject",
    rationale:
      "The current passage fully states the updated child target and strengthening frequency; the old passage is not necessary to answer an implicit query.",
  },
  "r2.11-pa-cand-002": {
    decision: "reject",
    rationale:
      "The current passage is sufficient for current targets, while the old 10-minute bout rule is not retained. This pair is useful for relation segmentation, not implicit merge annotation.",
  },
  "r2.11-pa-cand-003": {
    decision: "accept_provisional",
    stratum: "conditional_merge",
    lineage_group_id: "r2.11-pa-older-capacity-current-balance",
    query_text:
      "For an older adult with low exercise capacity, how should activity intensity be scaled while still meeting aerobic and balance-focused recommendations?",
    old_claim:
      "Older adults with low exercise capacity may obtain benefits at lower absolute intensity and amount than fitter individuals.",
    current_claim:
      "Older adults should complete 150-300 minutes of moderate aerobic activity or 75-150 minutes of vigorous activity, and balance-focused multicomponent activity on at least three days each week.",
    rationale:
      "The retained passage supplies the relative-capacity interpretation, while the current passage supplies the aerobic range and balance schedule.",
  },
  "r2.11-pa-cand-004": {
    decision: "accept_provisional",
    stratum: "compatible_history",
    lineage_group_id: "r2.11-pa-adult-benefits-injury-context",
    query_text:
      "What major health benefits should adults expect from regular activity, and how should a population programme manage musculoskeletal injury risk when people begin?",
    old_claim:
      "At 150 minutes of moderate activity per week, musculoskeletal injury rates appear uncommon, and a moderate start with gradual progression can reduce injury risk.",
    current_claim:
      "Adult physical activity benefits mortality, cardiovascular health, hypertension, several cancers, type 2 diabetes, mental and cognitive health, sleep, and adiposity.",
    rationale:
      "The current passage supplies the expanded benefit set, while the retained passage supplies implementation safety context not present in that passage.",
  },
  "r2.11-pa-cand-005": {
    decision: "reject",
    rationale:
      "The proposed old evidence is a child recommendation and is population-misaligned with the current adult-disability passage.",
  },
  "r2.11-pa-cand-006": {
    decision: "accept_provisional",
    stratum: "conditional_merge",
    lineage_group_id: "r2.11-pa-child-disability-activity-types",
    query_text:
      "For children with disabilities, what weekly activity pattern applies, which specific activity types should be included, and what disability-related benefits may occur?",
    old_claim:
      "Children's activity can include resistance exercise, vigorous aerobic exercise, and weight-loading activity to support muscle, cardiorespiratory fitness, and bone health.",
    current_claim:
      "Children and adolescents living with disability should average 60 minutes of mostly aerobic moderate-to-vigorous activity each day across the week and include vigorous, muscle- and bone-strengthening activity on at least three days.",
    rationale:
      "The current passage establishes disability-specific applicability and schedule; the retained passage provides the requested concrete activity types.",
  },
  "r2.11-pa-cand-007": {
    decision: "accept_provisional",
    stratum: "conditional_merge",
    lineage_group_id: "r2.11-pa-adult-distribution-sedentary-replacement",
    query_text:
      "How should adults integrate activity through the week and daily routines while reducing sedentary time, and which health areas does this approach address?",
    old_claim:
      "Regular activity distributed through the week can support daily active travel and applies across cardiorespiratory, metabolic, bone, cancer, and depression outcomes.",
    current_claim:
      "Adults should limit sedentary time and replace it with physical activity of any intensity, including light intensity.",
    rationale:
      "The retained passage supplies distribution, daily-life, and health-area context; the current passage supplies the sedentary replacement recommendation.",
  },
  "r2.11-pa-cand-008": {
    decision: "accept_provisional",
    stratum: "conditional_merge",
    lineage_group_id: "r2.11-pa-older-relative-intensity-chronic-conditions",
    query_text:
      "For an older adult with a chronic condition, how should intensity be interpreted relative to capacity while meeting aerobic, strength, and balance recommendations?",
    old_claim:
      "For older adults, moderate-to-vigorous intensity is relative to individual capacity, and lower absolute intensity may be appropriate for lower fitness.",
    current_claim:
      "Adults and older adults with chronic conditions should meet the current aerobic range, add major-muscle strengthening on at least two days, and for older adults add balance-focused multicomponent activity on at least three days.",
    rationale:
      "The retained passage defines capacity-relative intensity, while the current passage supplies chronic-condition-specific aerobic, strength, and balance requirements.",
  },
} as const;

const candidateText = await readFile(CANDIDATE_PATH, "utf8");
const candidates = candidateText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const evidence = (
  candidate: (typeof candidates)[number],
  generation: "old" | "current",
  role: "retained" | "current",
  atomicClaimText: string,
) => {
  const source = candidate[`${generation}_evidence`];
  return {
    item_id: `${candidate.candidate_id}::${role.toUpperCase()}`,
    role,
    document_id: source.document_id,
    atomic_claim_text: atomicClaimText,
    official_record_url: source.source_url,
    official_pdf_url: source.source_download_url,
    local_path:
      generation === "old"
        ? "experiments/version_aware_rag/data/sources_v5/r2_11/who_physical_activity_2010.pdf"
        : "experiments/version_aware_rag/data/sources_v5/r2_11/who_physical_activity_2020.pdf",
    source_sha256: source.source_sha256,
    locator: {
      page_number: source.page_number,
      chunk_id: source.chunk_id,
    },
  };
};

const reviewRows = candidates.map((candidate) => {
  const decision = decisions[candidate.candidate_id as keyof typeof decisions];
  if (!decision) throw new Error(`Missing review for ${candidate.candidate_id}`);
  return {
    schema_version: "v5-r2.11-codex-semantic-review-1",
    candidate_id: candidate.candidate_id,
    ...decision,
    reviewer_id: "codex-gpt5-primary-reviewer",
    reviewer_type: "ai_primary_reviewer_not_independent_human",
    reviewed_at: "2026-07-24",
    retrieval_outcomes_observed: false,
    r2_10_outcomes_used: false,
  };
});

const records = candidates.flatMap((candidate) => {
  const decision = decisions[candidate.candidate_id as keyof typeof decisions];
  if (decision.decision !== "accept_provisional") return [];
  return [
    {
      schema_version: "v5-r2.11-development-annotation-1",
      query_id: decision.lineage_group_id,
      split: "development",
      stratum: decision.stratum,
      lineage_group_id: decision.lineage_group_id,
      topic_id: candidate.topic_id,
      query_text: decision.query_text,
      required_current_evidence: [
        evidence(candidate, "current", "current", decision.current_claim),
      ],
      required_retained_evidence: [
        evidence(candidate, "old", "retained", decision.old_claim),
      ],
      deprecated_evidence: [],
      forbidden_evidence: [],
      implicit_retained_rationale: decision.rationale,
      annotation_rationale:
        "Codex provisional semantic review accepted both atomic evidence roles; project-owner review remains required.",
      review: {
        status: "codex_provisional",
        reviewer_id: "codex-gpt5-primary-reviewer",
        reviewer_type: "ai_primary_reviewer_not_independent_human",
        independent_blinded_or_clinical_review: false,
        retrieval_outcomes_observed: false,
        r2_10_outcomes_used: false,
      },
    },
  ];
});

const validationErrors = validateR211DevelopmentLedger(records);
if (validationErrors.length > 0) {
  throw new Error(`Provisional ledger invalid: ${JSON.stringify(validationErrors)}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
const reviewText = `${reviewRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const ledgerText = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
await writeFile(path.join(OUTPUT_DIR, "semantic_review.jsonl"), reviewText, "utf8");
await writeFile(
  path.join(OUTPUT_DIR, "provisional_annotations.jsonl"),
  ledgerText,
  "utf8",
);
await writeFile(
  path.join(OUTPUT_DIR, "MANIFEST.json"),
  `${JSON.stringify(
    {
      schema_version: "v5-r2.11-codex-reviewed-physical-activity-manifest-1",
      status: "codex_provisional_owner_review_required",
      reviewed_candidate_count: reviewRows.length,
      accepted_provisional_count: records.length,
      rejected_count: reviewRows.length - records.length,
      semantic_review_sha256: sha256(reviewText),
      provisional_annotations_sha256: sha256(ledgerText),
      validation_error_count: validationErrors.length,
      project_owner_approval_required: true,
      retrieval_allowed: false,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      reviewed: reviewRows.length,
      accepted_provisional: records.length,
      rejected: reviewRows.length - records.length,
      validation_errors: validationErrors.length,
      provisional_annotations_sha256: sha256(ledgerText),
    },
    null,
    2,
  ),
);
