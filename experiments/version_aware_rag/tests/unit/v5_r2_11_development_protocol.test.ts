import { describe, expect, test } from "bun:test";
import {
  R211_MINIMUM_STRATUM_COUNTS,
  validateR211DevelopmentLedger,
} from "../../src/annotation/validate_r2_11_development";

function evidence(itemId: string, role: "current" | "retained" | "deprecated" | "forbidden") {
  return {
    item_id: itemId,
    role,
    document_id: `doc-${itemId}`,
    atomic_claim_text: `Atomic official-source claim for ${itemId}.`,
    official_record_url: "https://www.who.int/publications/example",
    official_pdf_url: "https://iris.who.int/example.pdf",
    local_path: `data/sources/${itemId}.pdf`,
    source_sha256: "a".repeat(64),
    locator: { chunk_id: `chunk-${itemId}` },
  };
}

function record(
  id: string,
  stratum:
    | "conditional_merge"
    | "compatible_history"
    | "current_only"
    | "hard_negative_current",
  approved = false,
) {
  const needsRetained =
    stratum === "conditional_merge" || stratum === "compatible_history";
  return {
    schema_version: "v5-r2.11-development-annotation-1",
    query_id: `q-${id}`,
    split: "development",
    stratum,
    lineage_group_id: `lineage-${id}`,
    topic_id: `topic-${id}`,
    query_text: needsRetained
      ? "How do the applicable intake target and the present implementation constraint combine?"
      : "What recommendation currently applies to the target population?",
    required_current_evidence: [evidence(`${id}-current`, "current")],
    required_retained_evidence: needsRetained
      ? [evidence(`${id}-retained`, "retained")]
      : [],
    deprecated_evidence:
      stratum === "hard_negative_current"
        ? [evidence(`${id}-deprecated`, "deprecated")]
        : [],
    forbidden_evidence: [],
    implicit_retained_rationale: needsRetained
      ? "The current passage supplies only the implementation constraint, while the retained passage supplies the still-applicable target."
      : undefined,
    annotation_rationale:
      "Evidence roles were assigned from official source passages before retrieval.",
    review: {
      status: approved ? "project_owner_approved" : "codex_provisional",
      reviewer_id: "test-reviewer",
      reviewer_type: "test",
      independent_blinded_or_clinical_review: false,
      retrieval_outcomes_observed: false,
      r2_10_outcomes_used: false,
    },
  };
}

describe("R2.11 Development annotation contract", () => {
  test("accepts a valid implicit conditional-merge record", () => {
    const errors = validateR211DevelopmentLedger([
      record("cm-valid", "conditional_merge"),
    ]);
    expect(errors).toEqual([]);
  });

  test("rejects explicit history cues in implicit strata", () => {
    const invalid = record("cm-year", "conditional_merge");
    invalid.query_text = "How does the 2012 target combine with the current implementation constraint?";
    const errors = validateR211DevelopmentLedger([invalid]);
    expect(errors.some((error) => error.type === "ImplicitIntent")).toBe(true);
  });

  test("does not mistake the population phrase older adults for a history cue", () => {
    const valid = record("older-adults", "conditional_merge");
    valid.query_text =
      "How should older adults combine an applicable intensity principle with the current balance recommendation?";
    const errors = validateR211DevelopmentLedger([valid]);
    expect(errors.some((error) => error.type === "ImplicitIntent")).toBe(false);
  });

  test("rejects prior Validation or fresh-test lineage reuse", () => {
    const invalid = record("prior", "compatible_history");
    const errors = validateR211DevelopmentLedger([invalid], {
      forbiddenLineageIds: new Set([invalid.lineage_group_id]),
    });
    expect(errors.some((error) => error.type === "PriorEvaluationLeakage")).toBe(true);
  });

  test("rejects hard negatives without an unsafe distractor", () => {
    const invalid = record("hard", "hard_negative_current");
    invalid.deprecated_evidence = [];
    const errors = validateR211DevelopmentLedger([invalid]);
    expect(errors.some((error) => error.type === "StratumContract")).toBe(true);
  });

  test("freeze gate requires all minimum counts and owner approval", () => {
    const records = [];
    for (const [stratum, count] of Object.entries(R211_MINIMUM_STRATUM_COUNTS)) {
      for (let index = 0; index < count; index++) {
        records.push(record(`${stratum}-${index}`, stratum as keyof typeof R211_MINIMUM_STRATUM_COUNTS, true));
      }
    }
    expect(
      validateR211DevelopmentLedger(records, { requireFreezeReady: true }),
    ).toEqual([]);

    records[0].review.status = "codex_provisional";
    const errors = validateR211DevelopmentLedger(records, {
      requireFreezeReady: true,
    });
    expect(errors.some((error) => error.type === "ReviewStatus")).toBe(true);
  });
});
