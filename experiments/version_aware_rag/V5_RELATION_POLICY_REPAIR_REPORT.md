# V5 Relation-Aware Policy and Citation Repair

Date: 2026-07-22

## Outcome

The V4 fresh-test failure has two implementation causes, both now repaired for
future V5 work. The frozen V4 test, outputs, and gate decision remain unchanged.

1. The V4 experimental runners used relation endpoints but ignored
   `relation_type`. They expanded both endpoints, propagated scores in both
   directions, and forced pair coverage for every edge. This incorrectly promoted
   deprecated or forbidden retained passages in `v4fresh-008`, `v4fresh-036`, and
   `v4fresh-040`.
2. Answer generation requested exact `[chunk_id]` citations but accepted output
   without enforcing that contract. Gemma could therefore emit `[1]` or
   `[Evidence 1]`, which the automatic audit correctly classified as invalid.

The production `VersionAwareRetriever` was not the source of the first defect:
its compatibility expansion already restricts expansion to complementary and
conditional relations. The defect was in the simplified V4 experiment runners.

## Implemented repair

`src/retrieval/relation_aware_pair_policy.ts` now applies directional semantics:

- `complementary`: bidirectional expansion and pair coverage;
- `conditional_difference`: bidirectional expansion and pair coverage only after
  explicit condition/population applicability is established;
- `superseded` and `conflicting`: retained evidence is unsafe, expansion is only
  from retained/old to current/new, and retained evidence cannot be pair-forced;
- `duplicate`: no automatic pair coverage; an explicit deprecated/forbidden
  policy label removes the retained endpoint.

Every edge decision emits a reasoned trace. Unsafe filtering occurs before Top-K
selection.

`src/generation/citation_validator.ts` now rejects ordinal, evidence-label,
unknown, and uncited material claims. `AnswerGenerator` safely falls back to a
deterministic extractive answer containing only exact retrieved chunk IDs when an
LLM response violates the citation contract.

## Verification

- All 99 unit tests pass.
- New synthetic regressions cover superseded, conflicting, complementary, and
  conditional behavior and prove that changing relation type changes retrieval.
- Citation tests reject `[1]`, `[Evidence 1]`, unknown IDs, and uncited claims.
- Cached-score replay made zero model calls, performed no tuning, and did not
  read or rerun the V4 fresh test.
- Development and validation target-stratum coverage gates pass. The repaired
  policy preserves all existing V4 Top-3 selections on the 16 development and 8
  validation expansion queries.

Detailed replay metrics and input hashes are stored in
`results/v5/relation_policy_repair/V5_DEVVAL_REPLAY.json` and
`results/v5/relation_policy_repair/V5_DEVVAL_REPLAY.md`.

## Claim boundary and remaining work

This repair does not retroactively make V4 pass and is not new held-out evidence.
It establishes that the known implementation failure is fixed and that the
target-stratum Development/Validation gains are preserved. Before another overall
comparison, V5 must freeze the repaired policy, relation detector, model, prompt,
citation contract, endpoints, and checksums, then construct a new untouched
held-out test. Safety improvement must be confirmed there exactly once.

