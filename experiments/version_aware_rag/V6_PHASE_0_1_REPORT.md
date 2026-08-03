# V6 Phase 0–1 report

Date: 2026-08-01  
Decision: **capacity gate failed; source expansion required before fresh-test construction**

## Completed

- Defined the confirmatory-study scope, primary comparison, strata, caps, statistical claims, safety rules, and AI-only adjudication policy in `V6_PROTOCOL.md`.
- Built a machine-readable exclusion ledger from all located V3, V4, V5, and R2 query-bearing artifacts.
- Audited existing candidate lineages and separated structural availability from actual held-out eligibility.
- Documented the limited evidentiary role of the earlier nutritionist exercise pending its reviewer rubric and raw results.
- Began a new official-source collection and validated eight PDFs by PDF magic, parser readability, page count, byte size, and SHA-256.

## Exclusion inventory

| Measure | Count |
|---|---:|
| Raw records | 398 |
| Unique query IDs | 382 |
| Unique normalized queries | 382 |
| Unique lineage IDs | 342 |
| Unique required-evidence signatures | 311 |
| Unique required chunks | 747 |
| Unique required claims | 296 |

The ledger is intentionally conservative: previously exposed queries, lineages, evidence, and claims cannot silently re-enter the new confirmatory test.

## Capacity result

The audit found 193 candidate relation records, but only 46 were structurally non-overlapping, 34 were both reviewed and available, and 12 were predesignated as fresh eligible. Existing predesignated capacity by main stratum was:

| Stratum | Eligible count |
|---|---:|
| Explicit history | 0 |
| Current only | 1 |
| Compatible history | 5 |
| Conditional merge | 4 |
| Hard negative | 2 |

This is below both frozen gates: at least 60 unused reviewed lineages and at least 20 eligible questions per main stratum. Creating 100 questions immediately would therefore produce repeated, development-exposed, or weakly supported material.

## Newly acquired source set

Eight official WHO PDFs across wasting, antenatal nutrition, HIV/infant feeding, and school food environment have been acquired and validated. Acquisition is not eligibility: recommendation-level relations must still be mined, checked against the exclusion ledger, and unanimously approved by three isolated AI reviews.

Three attempted legacy downloads returned HTML/error pages rather than PDFs. They were verified as invalid and removed; their official endpoints remain pending in the manifest.

## Next execution gate

The next phase is source mining, not question writing:

1. Extract recommendation-level version relations from the validated PDFs.
2. Resolve the pending official legacy documents.
3. Run isolated ChatGPT/Gemini/Codex adjudication using the same frozen rubric and accept unanimous cases only. At the Gemini step, Codex must pause and hand a sealed batch to the user for execution through Antigravity; no autonomous Gemini invocation or substitute judgment is permitted.
4. Re-run the capacity audit.
5. Generate and seal the 80–100 question confirmatory test only after the gate passes.

Until then, the existing 16-question result remains a feasibility/pilot result and must not be reframed as a powered benchmark validation.
