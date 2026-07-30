# R2.16 Top-6-Anchored Pair-Score Confirmation Protocol

Date preregistered: 2026-07-27  
Scope: new lineage-disjoint Development confirmation  
Status: data construction not yet started

R2.16 will test the fixed `pair_score_g2.0_top6_anchor` repair selected by the
outcome-exposed R2.15 diagnostic. It uses the R2.12 group-expanded Top-20
generator, recency weight `0.2`, pair-signal weight `2.0`, and no forced pair
quota. Pair signal is applied to a candidate group only when at least one
member of that group ranks within the six highest normalized base scores in
the frozen Top-20 pool.

The confirmation ledger must contain at least 32 new project-owner-approved
records: 10 conditional-merge, 10 compatible-history, 6 current-only, and 6
hard-negative-current. Lineages and required evidence must not overlap R2.11,
R2.12, R2.14, any Validation set, or any fresh test. Candidate-group edges
must be declared before query authoring.

The repaired system is eligible only if every hard constraint holds:

- required candidate micro Recall@20 is at least `0.90`;
- current-only and hard-negative Recall@3 are noninferior;
- unsafe Top-3 rate does not increase;
- all ordered-pool and execution-integrity checks pass.

Only among hard-eligible results are the strict improvement checks evaluated:

- conditional-merge Recall@3 improves;
- compatible-history Recall@3 improves;
- combined implicit both-evidence coverage improves.

There is no weighted fallback. Failure of any hard constraint or strict
improvement check is an automatic gate failure. The ledger, runtime views,
judgments, runner, parameters, and checksums must be frozen before one
execution.

Passing remains Development-only and can authorize only a separately
preregistered Validation. R2.14 and R2.15 must not be rerun.
