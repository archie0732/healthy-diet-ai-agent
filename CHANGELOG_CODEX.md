# Codex Change Log

## 2026-07-28 18:30 +08:00

- Summary: Added English and Traditional Chinese Word workbooks for the 32-item R2.22 independent human blind review.
- Author: Codex
- Scope:
  - Plain-language reviewer instructions, detailed rating criteria, and worked examples
  - Blind Candidate A/B evidence tables and print/type-friendly response fields
  - Reviewer metadata, declaration, confidence ratings, rationales, and text-quality flags
- Files:
  - `experiments/version_aware_rag/reviewer_packets/R2_22_HUMAN_REVIEW_EN.docx`
  - `experiments/version_aware_rag/reviewer_packets/R2_22_HUMAN_REVIEW_ZH.docx`
  - `experiments/version_aware_rag/data/annotations_v5/r2_22_gpt56_blind_review/PASSAGE_TRANSLATIONS_ZH.jsonl`
  - `experiments/version_aware_rag/scripts/v5/build_r2_22_human_review_docx.py`
- API:
  - Added: none
  - Changed: none
  - Removed: none
- Env:
  - Added: none
  - Changed: none
  - Removed: none
- Notes:
  - Both workbooks contain exactly 32 frozen blind-review items.
  - The Chinese workbook translates the instructions, questions, response fields, and all 64 Candidate A/B passages into Traditional Chinese.
  - Each Chinese passage remains checksum-linked to the frozen English source; ID/A-B ordering, source text, non-empty Chinese content, and numeric-token multisets were audited with zero mismatches.
  - The workbook labels the passages as convenience translations so the English sources remain the research authority.

## 2026-07-28 15:05 +08:00

- Summary: Completed R2.21 lexical-weighted RRF diagnosis and prepared the paper handoff.
- Author: Codex
- Scope:
  - Outcome-exposed RRF weighting diagnostic
  - Locked negative result and independent audit
  - Manuscript-safe claim and limitation boundary
- Files:
  - `experiments/version_aware_rag/R2_21_LEXICAL_WEIGHTED_RRF_DIAGNOSTIC_PROTOCOL.md`
  - `experiments/version_aware_rag/V5_R2_21_LEXICAL_WEIGHTED_RRF_DIAGNOSTIC_RESULT.md`
  - `experiments/version_aware_rag/PAPER_HANDOFF_AFTER_R2_21.md`
- API:
  - Added: none
  - Changed: none
  - Removed: none
- Env:
  - Added: none
  - Changed: none
  - Removed: none
- Notes:
  - No weighted RRF variant repaired the current-only loss; no further confirmation is recommended before manuscript completion.

## 2026-07-28 14:59 +08:00

- Summary: Executed, audited, and locked the one-shot R2.20 neural-hybrid Development confirmation.
- Author: Codex
- Scope:
  - Checksum-bound owner approval and offline MiniLM execution
  - Neural-hybrid candidate retrieval plus Top-6 pair reranking
  - Independent metric recomputation and failed-gate lock
- Files:
  - `experiments/version_aware_rag/V5_R2_20_NEURAL_HYBRID_CONFIRMATION_RESULT.md`
  - `experiments/version_aware_rag/scripts/v5/run_r2_20_neural_hybrid_confirmation.ts`
  - `experiments/version_aware_rag/scripts/v5/audit_r2_20_neural_hybrid_confirmation.ts`
  - `experiments/version_aware_rag/data/configs/v5_r2_20_frozen_confirmation/EXECUTION_GUARD.json`
  - `experiments/version_aware_rag/results/v5/r2_20_confirmation/CONFIRMATION_RESULT.json`
- API:
  - Added: none
  - Changed: none
  - Removed: none
- Env:
  - Added: none
  - Changed: none
  - Removed: none
- Notes:
  - Candidate Recall@20 reached 51/52 and all strict improvements passed.
  - The gate failed only because current-only Recall@3 decreased from 6/6 to 5/6.
  - No Validation, fresh-test execution, or promotion was authorized.

## 2026-07-28 13:01 +08:00

- Summary: Prepared the R2.20 neural-hybrid Development confirmation owner-review packet.
- Author: Codex
- Scope:
  - Lineage-disjoint candidate mining and semantic review
  - Source-balanced 32-record confirmation annotation plan
  - Provisional ledger validation with retrieval locked behind owner approval
- Files:
  - `experiments/version_aware_rag/R2_20_NEURAL_HYBRID_CONFIRMATION_PROTOCOL.md`
  - `experiments/version_aware_rag/R2_20_CONFIRMATION_OWNER_REVIEW_PACKET.md`
  - `experiments/version_aware_rag/scripts/v5/build_r2_20_confirmation_annotations.ts`
  - `experiments/version_aware_rag/src/annotation/validate_r2_20_confirmation.ts`
  - `experiments/version_aware_rag/tests/unit/v5_r2_20_protocol.test.ts`
- API:
  - Added: none
  - Changed: none
  - Removed: none
- Env:
  - Added: none
  - Changed: none
  - Removed: none
- Notes:
  - No R2.20 retrieval has run; project-owner approval is the only expected freeze blocker.
  - R2.10 remains checksum-verification-only, and R2.16/R2.19 are not rerun.

## 2026-07-28 12:53 +08:00

- Summary: Added the R2.19 source-expanded offline neural-hybrid candidate retrieval diagnostic.
- Author: Codex
- Scope:
  - Version-aware RAG Development source capacity
  - Checksum-bound MiniLM q8 candidate retrieval
  - Frozen diagnostic, audit, and test artifacts
- Files:
  - `experiments/version_aware_rag/R2_19_SOURCE_EXPANDED_NEURAL_HYBRID_PROTOCOL.md`
  - `experiments/version_aware_rag/SOURCE_CATALOG_R2_19_SUPPLEMENT.md`
  - `experiments/version_aware_rag/V5_R2_19_NEURAL_HYBRID_DIAGNOSTIC_RESULT.md`
  - `experiments/version_aware_rag/scripts/v5/run_r2_19_neural_hybrid_diagnostic.ts`
  - `package.json`
  - `bun.lock`
- API:
  - Added: none
  - Changed: none
  - Removed: none
- Env:
  - Added: none
  - Changed: none
  - Removed: none
- Notes:
  - Added `@huggingface/transformers@4.2.0` as a development dependency.
  - R2.19 is Development-only and does not authorize Validation, fresh-test execution, or promotion.
## 2026-07-28 17:30 +08:00

- Summary: Added a blinded independent-context GPT-5.6 review of all 32 R2.20 questions.
- Author: Codex
- Scope:
  - Checksum-frozen blind packet with deterministic A/B position masking
  - One-pass isolated-context GPT-5.6 evidence-contract review
  - Schema validation and preregistered agreement analysis
- Files:
  - `experiments/version_aware_rag/R2_22_GPT56_BLIND_REVIEW_PROTOCOL.md`
  - `experiments/version_aware_rag/V5_R2_22_GPT56_BLIND_REVIEW_RESULT.md`
  - `experiments/version_aware_rag/scripts/v5/build_r2_22_gpt56_blind_packet.ts`
  - `experiments/version_aware_rag/scripts/v5/analyze_r2_22_gpt56_blind_review.ts`
  - `experiments/version_aware_rag/tests/unit/v5_r2_22_protocol.test.ts`
- API:
  - Added: none
  - Changed: none
  - Removed: none
- Env:
  - Added: none
  - Changed: none
  - Removed: none
- Notes:
  - The reviewer completed 32/32 items with zero schema errors.
  - Exact contract agreement was 19/32 and role-compatible agreement was 21/32.
  - The result is supplemental AI triangulation, not human or clinical validation.
