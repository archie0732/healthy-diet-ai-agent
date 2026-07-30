# R2.15 Compatible-History Selectivity Diagnostic Protocol

Date preregistered: 2026-07-27  
Scope: outcome-exposed R2.14 Development traces only  
Status: diagnostic not yet executed

## Motivation

R2.14 passed every hard constraint, improved conditional-merge Recall@3 from
`0.45` to `0.60`, and improved combined implicit both-evidence coverage from
`0.05` to `0.20`. It failed because compatible-history Recall@3 remained
`0.30`.

A read-only trace review found that the stronger pair signal produced both
gains and losses within compatible history. It improved two records but
displaced required evidence in two others. Three of 20 compatible-history
required items were also absent from the frozen Top-20 pools. The diagnostic
therefore targets pair-signal selectivity; it does not reinterpret R2.14 or
claim promotion evidence.

## Frozen diagnostic input

The diagnostic will use only:

- R2.14 role-neutral runtime queries and corpus;
- R2.14 frozen ordered Top-20 pools and score traces;
- R2.14 sealed judgments, read only after every variant Top-3 is produced.

No retrieval call, candidate regeneration, annotation edit, or R2.14 rerun is
allowed.

## Variants

All variants use recency weight `0.2`, pair weight `2.0`, and no forced pair
quota:

1. `pair_score_g2.0` — frozen R2.14 repair control.
2. `pair_score_g2.0_base_gate_0.25` — apply pair signal only when at least one
   member of the candidate group has normalized base score at least `0.25`.
3. `pair_score_g2.0_base_gate_0.50` — same rule with threshold `0.50`.
4. `pair_score_g2.0_top6_anchor` — apply pair signal only when at least one
   group member is among the six highest normalized base scores.
5. `pair_score_g2.0_top10_anchor` — same rule using the ten highest normalized
   base scores.

Tie-breaking remains deterministic by runtime item ID.

## Eligibility and selection

A variant is diagnostically eligible only if, relative to `pair_score_g2.0`:

- current-only Recall@3 is noninferior;
- hard-negative-current Recall@3 is noninferior;
- unsafe Top-3 rate does not increase;
- conditional-merge Recall@3 is noninferior;
- ordered-pool identity and trace integrity are 100%.

Among eligible variants, select lexicographically by:

1. highest compatible-history Recall@3;
2. highest compatible-history both-evidence coverage;
3. highest combined implicit both-evidence coverage;
4. lowest unsafe Top-3 rate;
5. variant name.

If no eligible variant strictly improves compatible-history Recall@3 over
`pair_score_g2.0`, the diagnostic must report no selected repair.

## Claim boundary

This diagnostic uses outcome-exposed Development data. A selected variant is
only a hypothesis for a new, lineage-disjoint, project-owner-approved
confirmation. It cannot authorize Validation, fresh-test execution, promotion,
or a rerun of R2.14.
