import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: Buffer | string) =>
  value
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

describe("V5 R2.14 gate-feasible Top-3 confirmation construction", () => {
  test("predeclares new role-neutral groups without prior-cycle overlap", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_14_predeclared_candidate_groups",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const bytes = readFileSync(
      path.join(directory, "candidate_groups.predeclared.jsonl"),
    );
    const groups = parseJsonl(bytes);
    expect(groups).toHaveLength(70);
    expect(manifest.candidate_item_count).toBe(140);
    expect(sha256(bytes)).toBe(manifest.candidate_groups_sha256);
    expect(manifest.required_or_candidate_chunk_overlap_with_prior_cycles).toBe(0);
    expect(
      groups.every(
        (group) =>
          group.annotation_role_assigned === false &&
          group.query_authored === false &&
          group.retrieval_outcomes_used === false &&
          group.prior_cycle_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("records semantic eligibility before query authoring", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_14_candidate_groups_codex_reviewed",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const reviews = parseJsonl(
      readFileSync(path.join(directory, "semantic_review.jsonl")),
    );
    expect(reviews).toHaveLength(70);
    expect(manifest.eligible_group_count).toBeGreaterThanOrEqual(33);
    expect(
      reviews.every(
        (review) =>
          review.query_authored_at_review_time === false &&
          review.retrieval_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("constructs a balanced, overlap-free provisional ledger", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_14_confirmation_codex_reviewed",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const bytes = readFileSync(
      path.join(directory, "provisional_annotations.jsonl"),
    );
    const records = parseJsonl(bytes);
    expect(records).toHaveLength(32);
    expect(manifest.stratum_counts).toEqual({
      conditional_merge: 10,
      compatible_history: 10,
      current_only: 6,
      hard_negative_current: 6,
    });
    expect(sha256(bytes)).toBe(manifest.provisional_annotations_sha256);
    expect(manifest.validator_error_count).toBe(0);
    expect(manifest.required_evidence_overlap_count).toBe(0);
    expect(manifest.freeze_blockers).toEqual([
      {
        type: "ReviewStatus",
        id: "ledger",
        message: "32 records are not project_owner_approved.",
      },
    ]);
    expect(
      records.every(
        (record) =>
          record.review.status === "codex_provisional" &&
          record.review.retrieval_outcomes_observed === false &&
          record.review.r2_12_outcomes_used === false &&
          record.review.r2_13_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
    expect(manifest.validation_allowed).toBe(false);
    expect(manifest.fresh_test_allowed).toBe(false);
  });

  test("binds owner approval and locks the single failed confirmation", () => {
    const config = path.join(
      BASE,
      "data/configs/v5_r2_14_frozen_confirmation",
    );
    const resultDirectory = path.join(
      BASE,
      "results/v5/r2_14_confirmation",
    );
    const signoff = JSON.parse(
      readFileSync(path.join(config, "PROJECT_OWNER_SIGNOFF.json"), "utf8"),
    );
    const guard = JSON.parse(
      readFileSync(path.join(config, "EXECUTION_GUARD.json"), "utf8"),
    );
    const result = JSON.parse(
      readFileSync(
        path.join(resultDirectory, "CONFIRMATION_RESULT.json"),
        "utf8",
      ),
    );
    const audit = JSON.parse(
      readFileSync(path.join(resultDirectory, "AUDIT.json"), "utf8"),
    );
    expect(signoff.owner_statement).toBe("核准全部 32 筆");
    expect(signoff.approved_record_count).toBe(32);
    expect(signoff.retrieval_outcomes_observed).toBe(false);
    expect(guard.status).toBe("confirmation_failed_locked");
    expect(guard.retrieval_execution_count).toBe(1);
    expect(result.hard_eligible).toBe(true);
    expect(result.gate_passed).toBe(false);
    expect(
      result.strict_improvement_checks
        .compatible_history_required_micro_recall_at_3_strictly_improves,
    ).toBe(false);
    expect(
      result.summaries[0].strata.compatible_history
        .required_micro_recall_at_3,
    ).toBe(0.3);
    expect(
      result.summaries[1].strata.compatible_history
        .required_micro_recall_at_3,
    ).toBe(0.3);
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_rerun_performed).toBe(false);
  });
});
