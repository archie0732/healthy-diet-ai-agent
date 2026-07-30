# R2.12 Candidate-Recall Repair Protocol

Date preregistered: 2026-07-26  
Scope: diagnostic Development repair followed by a new lineage-disjoint
Development confirmation set  
Status: diagnostic variants frozen before execution

## Motivation and claim boundary

R2.11 failed one of eight promotion checks because required candidate micro
Recall@20 was `78/88 = 0.8864`, below the preregistered `0.90` threshold.
The other seven checks passed. R2.11 is locked at one retrieval execution and
must not be rerun, rewritten, or promoted.

R2.12A may use the now outcome-exposed R2.11 Development ledger only for
failure diagnosis and repair selection. Its results cannot support promotion,
Validation, fresh-test, clinical, or overall-superiority claims. Any repair
selected from R2.12A must subsequently be frozen and tested once on a new,
lineage-disjoint, project-owner-approved Development confirmation set.

## Leakage boundary

Candidate generation may read only:

- role-neutral query text;
- role-neutral candidate text and publication year;
- opaque, predeclared candidate-group edges;
- frozen algorithm parameters.

It may not read query ID, stratum, required/deprecated/forbidden roles,
annotation rationale, review fields, prior outcomes, or any Validation or
fresh-test artifact. Sealed R2.11 judgments may be opened only after every
diagnostic variant has written an ordered Top-20 pool for all 56 queries.

Candidate-group edges in the future confirmation set must be constructed from
document/version provenance before query authoring and annotation. Gold
evidence roles may not create or modify those edges.

## Frozen diagnostic variants

All variants use BM25 `k1=1.2`, `b=0.75`, ordered Top-20, deterministic
lexicographic tie-breaking, and reciprocal-rank-fusion constant `k=60`.

1. `whole_query_bm25`: unchanged R2.11 lexical candidate generator.
2. `clause_rrf_k60`: RRF over the whole query and deterministic clauses split
   at punctuation or the conjunctions `and`, `while`, `but`, `why`, and
   `which`; clauses with fewer than three retained tokens are discarded.
3. `bm25_group_expand_seed14`: retain the first 14 whole-query BM25 items,
   add role-neutral group neighbors in base-rank order, then fill to 20 from
   the base ranking.
4. `clause_rrf_group_expand_seed14`: retain the first 14 clause-RRF items, add
   role-neutral group neighbors in fused-rank order, then fill to 20.

No query-specific vocabulary, query ID, topic ID, lineage label, or judgment
may affect these variants.

## Diagnostic endpoints and selection

Report:

- required micro Recall@20 overall and by stratum;
- number of required candidate-recall failures;
- number and proportion of queries with all required evidence in Top-20;
- ordered-pool identity and change count versus whole-query BM25;
- deprecated/forbidden candidate presence as a descriptive diagnostic only.

Select the variant with the highest overall required micro Recall@20. Ties are
resolved by: higher implicit-strata Recall@20, fewer changed pool positions,
then lexicographically smaller variant name. Selection remains diagnostic.

## Confirmation gate

The new confirmation set must:

- contain at least 32 new lineage groups: 10 `conditional_merge`, 10
  `compatible_history`, 6 `current_only`, and 6 `hard_negative_current`;
- have no lineage or required-evidence overlap with R2.11, any Validation set,
  or any fresh-test set;
- be project-owner approved before retrieval;
- keep queries, role-neutral candidates, and sealed judgments physically
  separated;
- freeze the selected repair, Recency comparator, parameters, runner, corpus,
  exclusions, metrics, and checksums before one execution.

Promotion planning may begin only if the selected repair, against the frozen
whole-query comparator, satisfies all of:

- required candidate micro Recall@20 at least `0.90`;
- conditional-merge and compatible-history required micro Recall@3 strictly
  improve;
- implicit both-evidence coverage strictly improves;
- current-only and hard-negative-current required micro Recall@3 are
  noninferior;
- deprecated/forbidden Top-3 hit rate does not increase;
- shared ordered candidate-pool identity is 100% within each system comparison;
- paired bootstrap interval and paired exact test are reported.

If any check fails, R2.12 remains Development-only.
