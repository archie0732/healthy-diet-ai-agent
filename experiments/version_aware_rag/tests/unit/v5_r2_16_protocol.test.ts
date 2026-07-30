import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: Buffer | string) =>
  value.toString().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

describe("V5 R2.16 Top-6-anchored confirmation construction", () => {
  test("predeclares 70 new groups with zero prior-cycle overlap", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_16_predeclared_candidate_groups",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const bytes = readFileSync(
      path.join(directory, "candidate_groups.predeclared.jsonl"),
    );
    expect(parseJsonl(bytes)).toHaveLength(70);
    expect(manifest.candidate_item_count).toBe(140);
    expect(manifest.excluded_prior_chunk_count).toBe(350);
    expect(manifest.required_or_candidate_chunk_overlap_with_prior_cycles).toBe(0);
    expect(sha256(bytes)).toBe(manifest.candidate_groups_sha256);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("freezes balanced group assignments before query authoring", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_16_annotation_authoring_plan",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const rows = parseJsonl(
      readFileSync(path.join(directory, "authoring_plan.frozen.jsonl")),
    );
    expect(rows).toHaveLength(32);
    expect(manifest.stratum_counts).toEqual({
      conditional_merge: 10,
      compatible_history: 10,
      current_only: 6,
      hard_negative_current: 6,
    });
    expect(
      rows.every(
        (row) =>
          row.query_authored === false &&
          row.evidence_roles_assigned === false &&
          row.retrieval_outcomes_used === false,
      ),
    ).toBe(true);
  });

  test("builds a validator-clean owner-review packet", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_16_confirmation_codex_reviewed",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const bytes = readFileSync(
      path.join(directory, "provisional_annotations.jsonl"),
    );
    const records = parseJsonl(bytes);
    expect(records).toHaveLength(32);
    expect(manifest.validator_error_count).toBe(0);
    expect(manifest.required_evidence_overlap_count).toBe(0);
    expect(sha256(bytes)).toBe(manifest.provisional_annotations_sha256);
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
          record.review.r2_14_outcomes_used === false &&
          record.review.r2_15_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("prepares the fixed Top-6-anchor runner behind owner approval", () => {
    const runner = readFileSync(
      path.join(BASE, "scripts/v5/run_r2_16_confirmation.ts"),
      "utf8",
    );
    const freezer = readFileSync(
      path.join(BASE, "scripts/v5/freeze_r2_16_confirmation.ts"),
      "utf8",
    );
    expect(runner).toContain('"pair_score_g2.0_top6_anchor"');
    expect(runner).toContain("repaired_anchor_rank");
    expect(runner).toContain("anchorIds");
    expect(freezer).toContain(
      '"b940e48401a849cef494345712c4b4c93b387d74d6d93ceb4b23c1e14d0bb0e1"',
    );
    expect(freezer).toContain(
      '"6983a757cb5d24c5aa0307f24068994aaa91bab039f9a1b29183203603117c28"',
    );
    expect(freezer).toContain('const OWNER_STATEMENT = "核准全部 32 筆"');
    expect(freezer).toContain("repaired_anchor_rank: 6");
  });

  test("locks the single confirmation after the candidate-recall hard-gate failure", () => {
    const config = path.join(BASE, "data/configs/v5_r2_16_frozen_confirmation");
    const results = path.join(BASE, "results/v5/r2_16_confirmation");
    const signoff = JSON.parse(
      readFileSync(path.join(config, "PROJECT_OWNER_SIGNOFF.json"), "utf8"),
    );
    const guard = JSON.parse(
      readFileSync(path.join(config, "EXECUTION_GUARD.json"), "utf8"),
    );
    const result = JSON.parse(
      readFileSync(path.join(results, "CONFIRMATION_RESULT.json"), "utf8"),
    );
    const audit = JSON.parse(
      readFileSync(path.join(results, "AUDIT.json"), "utf8"),
    );
    expect(signoff.owner_statement).toBe("核准全部 32 筆");
    expect(guard.status).toBe("confirmation_failed_locked");
    expect(guard.retrieval_execution_count).toBe(1);
    expect(result.hard_eligible).toBe(false);
    expect(
      result.hard_constraints
        .required_candidate_micro_recall_at_20_at_least_0_90,
    ).toBe(false);
    expect(
      Object.values(result.strict_improvement_checks).every(Boolean),
    ).toBe(true);
    expect(result.gate_passed).toBe(false);
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_rerun_performed).toBe(false);
  });
});
