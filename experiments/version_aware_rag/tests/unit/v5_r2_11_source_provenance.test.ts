import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { validateR211DevelopmentLedger } from "../../src/annotation/validate_r2_11_development";

const ROOT = process.cwd();
const BASE = path.join(ROOT, "experiments/version_aware_rag");
const MANIFEST_PATH = path.join(
  BASE,
  "data/corpus_v5_r2_11_draft/source_manifest.json",
);
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

describe("V5 R2.11 source provenance", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

  test("keeps all new sources Development-only and out of held-out tests", () => {
    expect(manifest.schema_version).toBe("v5-r2.11-source-manifest-1");
    expect(manifest.status).toBe("draft_source_corpus_not_gold");
    expect(manifest.development_only).toBe(true);
    expect(manifest.held_out_test_eligible).toBe(false);
    expect(manifest.document_count).toBe(4);
  });

  test("binds each source to a real PDF and exact checksum", () => {
    for (const document of manifest.documents) {
      const bytes = readFileSync(path.join(ROOT, document.local_path));
      expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(bytes.length).toBe(document.byte_length);
      expect(sha256(bytes)).toBe(document.sha256);
      expect(document.pdf_header_verified).toBe(true);
      expect(document.text_extraction_verified).toBe(true);
      expect(document.visually_verified_pdf_pages.length).toBeGreaterThan(0);
    }
  });

  test("binds the deterministic chunk corpus and excludes failed HTML", () => {
    const chunkBytes = readFileSync(
      path.join(BASE, "data/corpus_v5_r2_11_draft/chunks.jsonl"),
    );
    const chunks = chunkBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    expect(chunks.length).toBe(744);
    expect(sha256(chunkBytes)).toBe(manifest.chunks_sha256);
    expect(
      chunks.every((chunk) =>
        manifest.documents.some(
          (document: { document_id: string }) =>
            document.document_id === chunk.document_id,
        ),
      ),
    ).toBe(true);

    expect(manifest.rejected_downloads).toHaveLength(1);
    const rejected = manifest.rejected_downloads[0];
    const rejectedBytes = readFileSync(path.join(ROOT, rejected.local_path));
    expect(rejectedBytes.subarray(0, 5).toString("ascii")).not.toBe("%PDF-");
    expect(sha256(rejectedBytes)).toBe(rejected.sha256);
  });

  test("keeps mined evidence pairs outside the annotation ledger", () => {
    const candidateManifest = JSON.parse(
      readFileSync(
        path.join(
          BASE,
          "data/annotations_v5/r2_11_candidate_mining/MANIFEST.json",
        ),
        "utf8",
      ),
    );
    const ledgerBytes = readFileSync(
      path.join(ROOT, candidateManifest.ledger_path),
    );
    const records = ledgerBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    expect(candidateManifest.status).toBe(
      "candidate_mining_only_not_annotation_gold",
    );
    expect(candidateManifest.retrieval_allowed).toBe(false);
    expect(candidateManifest.candidate_count).toBe(8);
    expect(candidateManifest.unique_evidence_chunk_count).toBe(16);
    expect(sha256(ledgerBytes)).toBe(candidateManifest.ledger_sha256);
    expect(
      records.every(
        (record) =>
          record.eligible_for_r2_11_annotation_ledger === false &&
          record.retrieval_outcomes_observed === false &&
          record.r2_10_outcomes_used === false,
      ),
    ).toBe(true);
  });

  test("preserves the checksum-bound Codex provisional review packet", () => {
    const reviewedDir = path.join(
      BASE,
      "data/annotations_v5/r2_11_physical_activity_codex_reviewed",
    );
    const reviewedManifest = JSON.parse(
      readFileSync(path.join(reviewedDir, "MANIFEST.json"), "utf8"),
    );
    const records = readFileSync(
      path.join(reviewedDir, "provisional_annotations.jsonl"),
      "utf8",
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);

    expect(reviewedManifest.status).toBe(
      "codex_provisional_owner_review_required",
    );
    expect(reviewedManifest.accepted_provisional_count).toBe(5);
    expect(reviewedManifest.rejected_count).toBe(3);
    expect(reviewedManifest.project_owner_approval_required).toBe(true);
    expect(reviewedManifest.retrieval_allowed).toBe(false);
    expect(validateR211DevelopmentLedger(records)).toEqual([]);
    expect(
      validateR211DevelopmentLedger(records, { requireFreezeReady: true }).some(
        (error) =>
          error.type === "MinimumCount" || error.type === "ReviewStatus",
      ),
    ).toBe(true);
  });

  test("binds owner approval to exactly five records without unlocking retrieval", () => {
    const approvedDir = path.join(
      BASE,
      "data/annotations_v5/r2_11_physical_activity_owner_approved",
    );
    const approvedManifest = JSON.parse(
      readFileSync(path.join(approvedDir, "MANIFEST.json"), "utf8"),
    );
    const signoffBytes = readFileSync(
      path.join(approvedDir, "PROJECT_OWNER_SIGNOFF.json"),
    );
    const signoff = JSON.parse(signoffBytes.toString("utf8"));
    const ledgerBytes = readFileSync(
      path.join(approvedDir, "approved_annotations.jsonl"),
    );
    const records = ledgerBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);

    expect(signoff.owner_statement).toBe("OK I finish all");
    expect(signoff.approval_scope).toBe(
      "all_five_annotations_in_review_packet",
    );
    expect(signoff.review_packet_sha256).toBe(
      "c86a2df74050f1f450d25898c8e408f9c2aab2323673aa3e51476d5d0dc2a86f",
    );
    expect(sha256(ledgerBytes)).toBe(
      approvedManifest.approved_annotations_sha256,
    );
    expect(sha256(signoffBytes)).toBe(approvedManifest.owner_signoff_sha256);
    expect(records).toHaveLength(5);
    expect(
      records.every(
        (record) =>
          record.review.status === "project_owner_approved" &&
          record.review.retrieval_outcomes_observed === false &&
          record.review.r2_10_outcomes_used === false,
      ),
    ).toBe(true);
    expect(validateR211DevelopmentLedger(records)).toEqual([]);
    expect(
      validateR211DevelopmentLedger(records, { requireFreezeReady: true }).some(
        (error) => error.type === "MinimumCount",
      ),
    ).toBe(true);
    expect(approvedManifest.full_ledger_frozen).toBe(false);
    expect(approvedManifest.retrieval_allowed).toBe(false);
  });

  test("builds the remaining 51 records without held-out evidence overlap", () => {
    const remainingDir = path.join(
      BASE,
      "data/annotations_v5/r2_11_remaining_codex_reviewed",
    );
    const remainingManifest = JSON.parse(
      readFileSync(path.join(remainingDir, "MANIFEST.json"), "utf8"),
    );
    const remainingBytes = readFileSync(
      path.join(remainingDir, "provisional_annotations.jsonl"),
    );
    const remaining = remainingBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    const existing = readFileSync(
      path.join(
        BASE,
        "data/annotations_v5/r2_11_physical_activity_owner_approved/approved_annotations.jsonl",
      ),
      "utf8",
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);

    expect(sha256(remainingBytes)).toBe(
      remainingManifest.provisional_annotations_sha256,
    );
    expect(remaining).toHaveLength(51);
    expect(remainingManifest.combined_record_count).toBe(56);
    expect(remainingManifest.combined_stratum_counts).toEqual({
      conditional_merge: 16,
      compatible_history: 16,
      current_only: 12,
      hard_negative_current: 12,
    });
    expect(remainingManifest.excluded_required_chunk_overlap_count).toBe(0);
    expect(validateR211DevelopmentLedger(remaining)).toEqual([]);
    expect(
      validateR211DevelopmentLedger([...existing, ...remaining], {
        requireFreezeReady: true,
      }),
    ).toEqual([
      {
        type: "ReviewStatus",
        id: "ledger",
        message: "51 records are not project_owner_approved.",
      },
    ]);
    const packetBytes = readFileSync(
      path.join(BASE, remainingManifest.owner_review_packet_path),
    );
    expect(sha256(packetBytes)).toBe(
      remainingManifest.owner_review_packet_sha256,
    );
    expect(remainingManifest.retrieval_allowed).toBe(false);
  });

  test("freezes all 56 owner-approved records behind role-neutral runtime views", () => {
    const frozenDir = path.join(
      BASE,
      "data/configs/v5_r2_11_frozen_development",
    );
    const manifestBytes = readFileSync(
      path.join(frozenDir, "FROZEN_MANIFEST.json"),
    );
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const signoff = JSON.parse(
      readFileSync(
        path.join(frozenDir, "PROJECT_OWNER_SIGNOFF_REMAINING_51.json"),
        "utf8",
      ),
    );
    const ledgerBytes = readFileSync(
      path.join(frozenDir, "development.frozen.jsonl"),
    );
    const ledger = ledgerBytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    const runtimeQueries = readFileSync(
      path.join(frozenDir, "runtime_queries.role_neutral.jsonl"),
      "utf8",
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    const runtimeCorpus = readFileSync(
      path.join(frozenDir, "candidate_corpus.role_neutral.jsonl"),
      "utf8",
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);

    expect(signoff.owner_statement).toBe("核准全部 51 筆");
    expect(signoff.approved_record_count).toBe(51);
    expect(signoff.retrieval_outcomes_observed).toBe(false);
    expect(manifest.record_count).toBe(56);
    expect(manifest.stratum_counts).toEqual({
      conditional_merge: 16,
      compatible_history: 16,
      current_only: 12,
      hard_negative_current: 12,
    });
    expect(sha256(ledgerBytes)).toBe(manifest.frozen_ledger_sha256);
    expect(
      ledger.every(
        (record) =>
          record.review.status === "project_owner_approved" &&
          record.review.retrieval_outcomes_observed === false &&
          record.review.r2_10_outcomes_used === false,
      ),
    ).toBe(true);
    expect(
      validateR211DevelopmentLedger(ledger, { requireFreezeReady: true }),
    ).toEqual([]);
    expect(runtimeQueries).toHaveLength(56);
    expect(
      runtimeQueries.every(
        (query) =>
          Object.keys(query).sort().join(",") === "runtime_query_key,text",
      ),
    ).toBe(true);
    expect(
      runtimeCorpus.every(
        (item) =>
          !("required_role" in item) &&
          !("deprecated_role" in item) &&
          !("forbidden_role" in item) &&
          !("query_id" in item) &&
          !("stratum" in item),
      ),
    ).toBe(true);
    expect(manifest.validation_allowed).toBe(false);
    expect(manifest.fresh_test_allowed).toBe(false);
    expect(manifest.r2_10_rerun_allowed).toBe(false);
  });

  test("keeps the single audited retrieval execution failed-and-locked", () => {
    const frozenDir = path.join(
      BASE,
      "data/configs/v5_r2_11_frozen_development",
    );
    const resultDir = path.join(BASE, "results/v5/r2_11_development");
    const guard = JSON.parse(
      readFileSync(path.join(frozenDir, "EXECUTION_GUARD.json"), "utf8"),
    );
    const result = JSON.parse(
      readFileSync(path.join(resultDir, "DEVELOPMENT_RESULT.json"), "utf8"),
    );
    const audit = JSON.parse(
      readFileSync(path.join(resultDir, "AUDIT.json"), "utf8"),
    );

    expect(guard.status).toBe("development_gate_failed_locked");
    expect(guard.retrieval_execution_count).toBe(1);
    expect(result.gate_passed).toBe(false);
    expect(result.selected_system).toBe("implicit_merge_r0.2_g0.5");
    expect(
      result.gate_checks
        .required_candidate_micro_recall_at_20_at_least_0_90,
    ).toBe(false);
    expect(result.shared_candidate_pool_identity).toBe(true);
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_rerun_performed).toBe(false);
    expect(audit.r2_10_archive_checksum_entries_verified).toBe(22);
    expect(audit.r2_10_archive_checksum_entry_count).toBe(22);
    expect(audit.promotion_allowed).toBe(false);
  });
});
