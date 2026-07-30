# R2.13 Top-3 Reranking Repair Protocol

Date preregistered: 2026-07-26  
Scope: outcome-exposed Development diagnostic only  
Status: variants frozen before diagnostic execution

R2.12 confirmed candidate Recall@20 above `0.90`, but group expansion did not
improve implicit Top-3 endpoints. R2.13A diagnoses whether stronger
role-neutral pair scoring or a deterministic pair quota can convert candidate
coverage into Top-3 coverage.

R2.12 is locked and will not be rerun. R2.13A cannot support promotion,
Validation, fresh-test, clinical, or overall-superiority claims. Any selected
repair requires another new lineage-disjoint, project-owner-approved
Development confirmation set.

## Runtime boundary

Before diagnostic execution, a sanitizer copies only the following fields from
the locked R2.12 repaired-pool trace: runtime query key, ordered candidate IDs,
base-normalized score, recency-normalized score, and role-neutral pair signal.
It excludes query ID, stratum, required/unsafe roles, judgments, and outcomes.

The runner reads role-neutral queries, role-neutral candidate text/group edges,
the sanitized trace, and frozen parameters. Sealed judgments are read once,
only after every variant has produced Top-3 for every query.

## Frozen variants

All variants use the frozen repaired Top-20 pool and recency weight `0.2`:

1. `pair_score_g0.5`: R2.12 downstream score.
2. `pair_score_g1.0`: pair-signal weight `1.0`.
3. `pair_score_g2.0`: pair-signal weight `2.0`.
4. `pair_quota_g0.5`: score weight `0.5`; for a multi-clause query with
   positive joint-coverage gain, reserve two Top-3 positions for the
   highest-scoring declared pair.
5. `pair_quota_g1.0`: same quota with score weight `1.0`.

Pair selection uses only query terms, candidate text, base/recency scores, and
predeclared group edges. No query-specific hard-coding is allowed.

## Diagnostic selection

Select the highest sum of conditional-merge Recall@3,
compatible-history Recall@3, and combined both-evidence coverage, minus
overall unsafe Top-3 rate and any current-only or hard-negative recall loss
relative to `pair_score_g0.5`. Ties use the lexicographically smaller name.

The selected strategy remains diagnostic. A later confirmation gate must
retain all R2.12 safety, noninferiority, strict implicit-improvement, candidate
Recall@20, paired-statistics, and one-execution requirements.
