# R2.14 Gate-Feasible Top-3 Confirmation Protocol

Date preregistered: 2026-07-26  
Scope: new lineage-disjoint Development confirmation  
Status: 32-record provisional ledger constructed; project-owner approval pending

R2.14 will test the fixed `pair_score_g2.0` repair. It uses the R2.12
group-expanded Top-20 generator, recency weight `0.2`, pair-signal weight
`2.0`, and no forced pair quota.

The confirmation ledger must contain at least 32 new project-owner-approved
records: 10 conditional-merge, 10 compatible-history, 6 current-only, and 6
hard-negative-current. Lineages and required evidence must not overlap R2.11,
R2.12, any Validation set, or any fresh test. Candidate-group edges must be
declared before query authoring.

The repaired system is eligible only if every hard constraint holds:

- required candidate micro Recall@20 is at least `0.90`;
- current-only and hard-negative Recall@3 are noninferior;
- unsafe Top-3 rate does not increase;
- all ordered-pool and execution-integrity checks pass.

Only among hard-eligible results are the strict improvement checks evaluated:

- conditional-merge Recall@3 improves;
- compatible-history Recall@3 improves;
- combined implicit both-evidence coverage improves.

There is no weighted fallback: failure of any hard constraint is an automatic
gate failure. The ledger, runtime views, judgments, runner, parameters, and
checksums must be frozen before one execution. Passing remains
Development-only and can only authorize a separately preregistered Validation.

## Construction checkpoint (2026-07-26)

- 70 role-neutral candidate groups were predeclared before query authoring.
- Candidate and required chunk overlap with prior cycles is zero.
- Semantic review retained 41 eligible groups and rejected 29.
- A 32-record provisional ledger was constructed with the preregistered
  `10/10/6/6` stratum counts.
- The construction validator reports zero errors and exactly one expected
  freeze blocker: all 32 records still require project-owner approval.
- R2.14 retrieval, Validation, and fresh-test execution remain blocked.
