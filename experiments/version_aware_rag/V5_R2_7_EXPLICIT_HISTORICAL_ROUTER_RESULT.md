# V5 R2.7 Explicit Historical-Intent Router

Date: 2026-07-23

## Outcome

R2.7 successfully validated a narrow deterministic router for queries that
explicitly request historical guidance. It did not validate a general semantic
conditional-merge detector and did not test whether overall Version-Aware
retrieval is superior to Recency.

| Split | Preserve TP | False preserve | True block | Missed preserve | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|
| Development | 8 | 0 | 8 | 0 | 1.0000 | 1.0000 |
| Validation | 4 | 0 | 4 | 0 | 1.0000 | 1.0000 |

Validation was executed once. The guard is now locked against retuning.

## What changed from R2.6

R2.6 inherited pair-only labels before defining its query-conditioned endpoint.
Its label defects were found only after predictions, invalidating promotion.

R2.7 reversed that order:

1. Construct 24 cross-version WHO lineages.
2. Write the query and atomic OLD/CURRENT claims.
3. Audit the action label against the query-conditioned contract.
4. Freeze a balanced 16/8 Development/Validation split.
5. Run Development.
6. Execute sealed Validation once only after the Development gate passed.

The 24 current WHO chunks were not used in prior R2 cycles. Development and
Validation have no lineage, current-chunk, or normalized OLD-excerpt overlap.

## Sources and provenance

OLD evidence comes from:

- WHO/FAO, *Diet, nutrition and the prevention of chronic diseases*, Technical
  Report Series 916 (2003).
- Official FAO catalog:
  <https://www.fao.org/4/AC911E/AC911E00.htm>
- Official PDF part:
  <https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf>
- WHO record/PDF endpoint:
  <https://iris.who.int/bitstream/handle/10665/42665/WHO_TRS_916.pdf?sequence=1>
- Local verified PDF:
  `data/sources_v5/who_fao/WHO_FAO_TRS_916_2003_part2.pdf`
- SHA-256:
  `f7d8b51b455f4853354b1b86339797da689426f440bc3fa62304eaa4b3d29429`

Each OLD record stores the PDF page, printed page, normalized excerpt, excerpt
hash, atomic claim, catalog URL, PDF URL, WHO endpoint, and complete PDF hash.
The normalized excerpt is a page-level locator, not a byte-offset quotation.

CURRENT evidence comes from official WHO guidelines published from 2012 through
2025. Every record stores the WHO record URL, direct official PDF endpoint,
document checksum, PDF page, chunk ID, complete source chunk, and atomic claim.

## Frozen detector

`explicit_temporal_history_intent_v1` is a deterministic query-only router. It
preserves retained history when the query contains explicit temporal cues such
as `2003`, `historical`, `previous`, or an explicit change-from/to-current
construction. It does not read evidence IDs, topics, relation labels, judgments,
or model-generated features.

No Gemini, Gemma, embedding, cross-encoder, or other external model API was used.

## Critical limitation

All positive R2.7 queries contain an explicit historical cue, while all negative
queries lack one. The clean result therefore confirms explicit temporal routing,
not semantic inference. Development and Validation were also authored and
audited by the same Codex reviewer; Validation is lineage-disjoint but is not
independently authored or blinded.

The supported claim is:

> Explicit historical questions can be safely routed to retained version history
> in this pre-audited cross-version set.

The following claims remain unsupported:

- general conditional-merge detection is solved;
- compatible history should be preserved without explicit temporal intent;
- Version-Aware retrieval has higher overall Recall@3 than Recency;
- this result is fresh held-out V5 test evidence.

## Artifacts

- Gold builder:
  `scripts/v5/build_r2_7_preaudited_cross_version_split.ts`
- Pre-model audit:
  `data/annotations_v5/r2_7_preaudited_cross_version/pre_model_audit_ledger.jsonl`
- Frozen split:
  `data/configs/v5_r2_7_preaudited_cross_version/SPLIT_MANIFEST.json`
- Execution guard:
  `data/configs/v5_r2_7_preaudited_cross_version/EXECUTION_GUARD.json`
- Development result:
  `results/v5/r2_7_temporal_intent_development/DEVELOPMENT_SELECTION.json`
- Validation result:
  `results/v5/r2_7_temporal_intent_validation/VALIDATION_RESULT.json`
- Protocol test:
  `tests/unit/v5_r2_7_protocol.test.ts`

