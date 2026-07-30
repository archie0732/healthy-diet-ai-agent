import { describe, expect, test } from "bun:test";
import {
  R212_CONFIRMATION_MINIMUM_COUNTS,
  r212EvidenceKey,
  validateR212ConfirmationLedger,
} from "../../src/annotation/validate_r2_12_confirmation";

const hash = "a".repeat(64);
const evidence = (
  id: string,
  role: "current" | "retained" | "deprecated" | "forbidden",
) => ({
  item_id: id,
  role,
  document_id: `doc-${id}`,
  atomic_claim_text: `Official atomic claim for ${id}.`,
  official_record_url: "https://www.who.int/publications/example",
  local_path: `data/${id}.pdf`,
  source_sha256: hash,
  locator: { chunk_id: `chunk-${id}` },
});
function record(
  id: string,
  stratum: keyof typeof R212_CONFIRMATION_MINIMUM_COUNTS,
  approved = false,
) {
  const implicit =
    stratum === "conditional_merge" || stratum === "compatible_history";
  return {
    schema_version: "v5-r2.12-confirmation-annotation-1",
    query_id: `q-${id}`,
    split: "development_confirmation",
    stratum,
    lineage_group_id: `lineage-${id}`,
    topic_id: `topic-${id}`,
    query_text: implicit
      ? "How should the applicable target combine with the present implementation constraint?"
      : "What recommendation applies to the target population?",
    predeclared_candidate_group_id: `group-${id}`,
    candidate_group_manifest_sha256: hash,
    required_current_evidence: [evidence(`${id}-current`, "current")],
    required_retained_evidence: implicit
      ? [evidence(`${id}-retained`, "retained")]
      : [],
    deprecated_evidence:
      stratum === "hard_negative_current"
        ? [evidence(`${id}-unsafe`, "deprecated")]
        : [],
    forbidden_evidence: [],
    implicit_retained_rationale: implicit
      ? "Both independently predeclared passages are needed to answer the two implicit clauses."
      : undefined,
    annotation_rationale:
      "Evidence roles were assigned from official text before retrieval.",
    review: {
      status: approved ? "project_owner_approved" : "codex_provisional",
      reviewer_id: "reviewer",
      reviewer_type: "test",
      independent_blinded_or_clinical_review: false,
      retrieval_outcomes_observed: false,
      r2_10_outcomes_used: false,
      r2_11_outcomes_used: false,
      r2_12_diagnostic_outcomes_used: false,
    },
  };
}

describe("R2.12 confirmation validator", () => {
  test("rejects prior required evidence and undeclared group evidence", () => {
    const value = record("leak", "conditional_merge");
    const key = r212EvidenceKey(value.required_current_evidence[0]);
    const errors = validateR212ConfirmationLedger([value], {
      forbiddenRequiredEvidenceKeys: new Set([key]),
      candidateGroups: new Map([
        [value.predeclared_candidate_group_id, new Set<string>()],
      ]),
      candidateGroupManifestSha256: hash,
    });
    expect(errors.some((error) => error.type === "PriorEvidenceLeakage")).toBe(
      true,
    );
    expect(errors.some((error) => error.type === "CandidateGroup")).toBe(true);
  });

  test("requires minimum counts and project-owner approval at freeze", () => {
    const records = Object.entries(R212_CONFIRMATION_MINIMUM_COUNTS).flatMap(
      ([stratum, count]) =>
        Array.from({ length: count }, (_, index) =>
          record(
            `${stratum}-${index}`,
            stratum as keyof typeof R212_CONFIRMATION_MINIMUM_COUNTS,
            true,
          ),
        ),
    );
    expect(
      validateR212ConfirmationLedger(records, { requireFreezeReady: true }),
    ).toEqual([]);
    records[0].review.status = "codex_provisional";
    expect(
      validateR212ConfirmationLedger(records, {
        requireFreezeReady: true,
      }).some((error) => error.type === "ReviewStatus"),
    ).toBe(true);
  });
});
