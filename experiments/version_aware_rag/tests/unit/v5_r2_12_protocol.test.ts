import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

describe("V5 R2.12 candidate-recall repair protocol", () => {
  test("locks one diagnostic execution without changing R2.11", () => {
    const guard = JSON.parse(
      readFileSync(
        path.join(
          BASE,
          "data/configs/v5_r2_12_candidate_recall_diagnostic/DIAGNOSTIC_GUARD.json",
        ),
        "utf8",
      ),
    );
    const r211Guard = JSON.parse(
      readFileSync(
        path.join(
          BASE,
          "data/configs/v5_r2_11_frozen_development/EXECUTION_GUARD.json",
        ),
        "utf8",
      ),
    );
    expect(guard.status).toBe("diagnostic_complete_locked");
    expect(guard.diagnostic_execution_count).toBe(1);
    expect(guard.r2_11_rerun_allowed).toBe(false);
    expect(r211Guard.status).toBe("development_gate_failed_locked");
    expect(r211Guard.retrieval_execution_count).toBe(1);
  });

  test("reproduces the diagnostic selection and claim boundary", () => {
    const result = JSON.parse(
      readFileSync(
        path.join(
          BASE,
          "results/v5/r2_12_candidate_recall_diagnostic/DIAGNOSTIC_RESULT.json",
        ),
        "utf8",
      ),
    );
    const audit = JSON.parse(
      readFileSync(
        path.join(
          BASE,
          "results/v5/r2_12_candidate_recall_diagnostic/AUDIT.json",
        ),
        "utf8",
      ),
    );
    expect(result.selected_diagnostic_variant).toBe(
      "bm25_group_expand_seed14",
    );
    expect(
      result.summaries.find(
        (summary: { variant: string }) =>
          summary.variant === "whole_query_bm25",
      ).required_micro_recall_at_20,
    ).toBe(78 / 88);
    expect(
      result.summaries.find(
        (summary: { variant: string }) =>
          summary.variant === "bm25_group_expand_seed14",
      ).required_micro_recall_at_20,
    ).toBe(85 / 88);
    expect(result.promotion_evidence).toBe(false);
    expect(result.confirmation_required).toBe(true);
    expect(audit.status).toBe("audit_pass");
  });

  test("predeclares role-neutral confirmation groups with zero overlap", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_12_predeclared_candidate_groups",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const groupBytes = readFileSync(
      path.join(directory, "candidate_groups.predeclared.jsonl"),
    );
    const groups = groupBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(groups).toHaveLength(56);
    expect(manifest.candidate_item_count).toBe(112);
    expect(sha256(groupBytes)).toBe(manifest.candidate_groups_sha256);
    expect(manifest.required_evidence_overlap_with_exclusions).toBe(0);
    expect(
      groups.every(
        (group) =>
          group.annotation_role_assigned === false &&
          group.query_authored === false &&
          group.retrieval_outcomes_used === false &&
          group.r2_11_outcomes_used === false &&
          group.r2_12_diagnostic_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("constructs a balanced validator-clean provisional confirmation ledger", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_12_confirmation_codex_reviewed",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const ledgerBytes = readFileSync(
      path.join(directory, "provisional_annotations.jsonl"),
    );
    const records = ledgerBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(32);
    expect(manifest.stratum_counts).toEqual({
      conditional_merge: 10,
      compatible_history: 10,
      current_only: 6,
      hard_negative_current: 6,
    });
    expect(sha256(ledgerBytes)).toBe(
      manifest.provisional_annotations_sha256,
    );
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
          record.review.r2_11_outcomes_used === false &&
          record.review.r2_12_diagnostic_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("binds owner approval and freezes separated confirmation inputs", () => {
    const directory = path.join(
      BASE,
      "data/configs/v5_r2_12_frozen_confirmation",
    );
    const signoff = JSON.parse(
      readFileSync(path.join(directory, "PROJECT_OWNER_SIGNOFF.json"), "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "FROZEN_MANIFEST.json"), "utf8"),
    );
    const guard = JSON.parse(
      readFileSync(path.join(directory, "EXECUTION_GUARD.json"), "utf8"),
    );
    const queries = readFileSync(
      path.join(directory, "runtime_queries.role_neutral.jsonl"),
      "utf8",
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(signoff.owner_statement).toBe("核准全部 32 筆");
    expect(signoff.approved_record_count).toBe(32);
    expect(signoff.retrieval_outcomes_observed).toBe(false);
    expect(manifest.record_count).toBe(32);
    expect(manifest.candidate_item_count).toBe(112);
    expect(manifest.validation_errors).toEqual([]);
    expect(guard.status).toBe("confirmation_failed_locked");
    expect(guard.retrieval_execution_count).toBe(1);
    expect(
      queries.every(
        (query) =>
          Object.keys(query).sort().join(",") === "runtime_query_key,text",
      ),
    ).toBe(true);
  });

  test("keeps the one confirmation execution failed-and-locked", () => {
    const result = JSON.parse(
      readFileSync(
        path.join(
          BASE,
          "results/v5/r2_12_confirmation/CONFIRMATION_RESULT.json",
        ),
        "utf8",
      ),
    );
    const audit = JSON.parse(
      readFileSync(
        path.join(BASE, "results/v5/r2_12_confirmation/AUDIT.json"),
        "utf8",
      ),
    );
    expect(result.gate_passed).toBe(false);
    expect(result.summaries[0].required_micro_recall_at_20).toBe(50 / 52);
    expect(result.summaries[1].required_micro_recall_at_20).toBe(51 / 52);
    expect(
      Object.values(result.gate_checks).filter((value) => value === false),
    ).toHaveLength(3);
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_rerun_performed).toBe(false);
  });
});
