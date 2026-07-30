# Plan 08D: Lineage-Aware Historical Evidence Recovery

## Scope

This development-only plan follows 08C's negative focused result. It keeps the
same BM25 Top-20 candidate pool for Recency and Oracle. The Oracle may use its
relation graph only after that shared pool is established. No held-out split,
predicted graph, answer generation, or parameter freeze is permitted.

## Hypothesis

For an explicit historical query, a high-scoring in-pool seed can identify a
target-year relation neighbor whose lexical score is too weak to enter Top-20.
Adding that neighbor through an Oracle lineage-expansion policy can recover
required historical evidence without giving relation data to Recency.

## Intervention

1. Add an opt-in `enableHistoricalLineageExpansion` feature flag.
2. Only for `temporalIntent=historical`, inspect relations of shared-pool
   candidates and add target-year neighbors. Superseded/conflicting edges are
   allowed because the user explicitly requests the historical version.
3. Record seed, relation, target, score, and acceptance in the existing
   expansion trace. No query ID, judgment ID, or required chunk may be used.
4. Where a historical seed is an adjacent passage on the same source page,
   evaluate a bounded document-context expansion as a separate policy feature.
   This supports multi-passage evidence without using gold labels.
5. Retain the historical intent score as an independent ablation. It must not
   be selected merely because it reduces stale exposure.

## Decision protocol

Select on development only. Promote the rule for a future frozen protocol only
if it improves historical candidate/required micro recall and does not reduce
conditional-merge or compatible-history required micro recall, with no stale
rate increase. Validation is a confirmation report only.

## Required diagnostics

- q-031: relation-backed historical expansion must identify whether the missing
  required evidence is reachable from a shared-pool seed.
- q-037: distinguish evidence-reachability from final-rank failure.
- q-030: verify conditional-merge retrieval remains intact.
- Per-query shared pool hashes must be identical for Recency and Oracle.

## V4 sample expansion specification

Before a new V4 test is created, add at least 12 independent lineage groups to
each of `conditional_merge` and `compatible_history` development/validation
inventories. Annotators must require one current and one retained evidence item
for conditional merge, and document why a purely recency-ranked result is
insufficient. Fresh-test lineages remain separate and unopened.
