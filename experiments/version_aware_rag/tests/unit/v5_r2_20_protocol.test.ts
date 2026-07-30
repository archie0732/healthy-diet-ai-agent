import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: Buffer | string) =>
  value.toString().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

describe("V5 R2.20 neural-hybrid confirmation construction", () => {
  test("predeclares source-expanded groups with zero prior-cycle overlap", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_20_predeclared_candidate_groups",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "MANIFEST.json"), "utf8"),
    );
    const bytes = readFileSync(
      path.join(directory, "candidate_groups.predeclared.jsonl"),
    );
    expect(parseJsonl(bytes)).toHaveLength(74);
    expect(manifest.candidate_item_count).toBe(148);
    expect(manifest.excluded_prior_chunk_count).toBe(490);
    expect(manifest.required_or_candidate_chunk_overlap_with_prior_cycles).toBe(0);
    expect(manifest.supporting_source_roles_preserved).toBe(true);
    expect(sha256(bytes)).toBe(manifest.candidate_groups_sha256);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("freezes balanced assignments before query authoring", () => {
    const directory = path.join(
      BASE,
      "data/annotations_v5/r2_20_annotation_authoring_plan",
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
    expect(manifest.source_document_caps_satisfied).toBe(true);
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
      "data/annotations_v5/r2_20_confirmation_codex_reviewed",
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
    expect(manifest.source_document_caps_satisfied).toBe(true);
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
          record.review.r2_19_outcomes_used === false,
      ),
    ).toBe(true);
    expect(manifest.retrieval_allowed).toBe(false);
  });

  test("fixes the selected candidate and Top-3 methods before execution", () => {
    const protocol = readFileSync(
      path.join(BASE, "R2_20_NEURAL_HYBRID_CONFIRMATION_PROTOCOL.md"),
      "utf8",
    );
    expect(protocol).toContain("bm25_minilm_rrf_k60_top20");
    expect(protocol).toContain("pair_score_g2.0_top6_anchor");
    expect(protocol).toContain("There is no weighted fallback.");
    expect(protocol).toContain("R2.16 and R2.19 must not be rerun.");
  });

  test("keeps R2.10 fresh-test archive checksum-verification-only", () => {
    const directory = path.join(BASE, "results/v5/r2_10_fresh_test_cycle");
    const checksumText = readFileSync(
      path.join(directory, "ARTIFACT_CHECKSUMS.sha256"),
      "utf8",
    );
    const rows = checksumText.split(/\r?\n/).filter(Boolean);
    expect(rows).toHaveLength(22);
    for (const row of rows) {
      const match = row.match(/^([a-f0-9]{64})  (.+)$/);
      expect(match).not.toBeNull();
      const [, expected, relativePath] = match!;
      expect(sha256(readFileSync(path.join(BASE, relativePath)))).toBe(
        expected,
      );
    }
  });

  test("locks the single audited confirmation after current-only noninferiority fails", () => {
    const config = path.join(
      BASE,
      "data/configs/v5_r2_20_frozen_confirmation",
    );
    const results = path.join(BASE, "results/v5/r2_20_confirmation");
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
    const initialization = JSON.parse(
      readFileSync(path.join(results, "INITIALIZATION_ATTEMPT.json"), "utf8"),
    );
    expect(signoff.owner_statement).toBe("核准全部 32 筆");
    expect(guard.status).toBe("confirmation_failed_locked");
    expect(guard.retrieval_execution_count).toBe(1);
    expect(result.summaries[1].required_micro_recall_at_20).toBe(51 / 52);
    expect(
      result.hard_constraints
        .current_only_required_micro_recall_at_3_noninferior,
    ).toBe(false);
    expect(Object.values(result.strict_improvement_checks).every(Boolean)).toBe(
      true,
    );
    expect(result.gate_passed).toBe(false);
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_rerun_performed).toBe(false);
    expect(initialization.retrieval_execution_count_after_attempt).toBe(0);
  });
});
