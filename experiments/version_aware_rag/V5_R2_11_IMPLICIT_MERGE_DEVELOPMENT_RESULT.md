# V5 R2.11 Implicit Merge Development Result

Date: 2026-07-26  
Status: Development gate failed; no promotion

## Frozen execution

The project owner approved all remaining 51 records with the checksum-bound
statement `核准全部 51 筆`. Together with the five earlier approvals, the
frozen ledger contains 56 records: 16 `conditional_merge`, 16
`compatible_history`, 12 `current_only`, and 12 `hard_negative_current`.
Validation against 64 prior Validation/fresh-test lineage exclusions returned
zero errors.

Retrieval ran exactly once using 56 role-neutral queries, 98 role-neutral
candidate items, one shared BM25 Top-20 pool per query, and 11 frozen systems.
Judgments were read once, only after all 616 query-system retrieval calls were
complete. No external model API was used. A local cross-encoder was omitted
because no exact reproducible local revision and file checksum were installed.

## Result

The selected Development system was `implicit_merge_r0.2_g0.5`.

| Endpoint | Recency | Selected |
|---|---:|---:|
| Conditional-merge required micro Recall@3 | 0.2500 | 0.3438 |
| Compatible-history required micro Recall@3 | 0.1563 | 0.2188 |
| Combined implicit both-evidence coverage | 0.0000 | 0.0625 |
| Current-only required micro Recall@3 | 0.9167 | 0.9167 |
| Hard-negative-current required micro Recall@3 | 0.5833 | 0.6667 |
| Overall unsafe Top-3 hit rate | 0.0536 | 0.0536 |
| Required candidate micro Recall@20 | 0.8864 | 0.8864 |

The paired mean query Recall@3 difference was `+0.0625`; the 10,000-sample
paired bootstrap 95% interval was `[0.0179, 0.1161]`. The exact paired sign
test had 6 wins, 0 losses, 50 ties, and two-sided `p=0.03125`.

Seven of eight preregistered checks passed. The required candidate micro
Recall@20 check failed because `0.8864 < 0.90`. The execution guard is locked
at count one with status `development_gate_failed_locked`.

## Claim boundary

This is a negative Development-cycle promotion decision. It is not Validation
evidence, fresh held-out test evidence, clinical-effectiveness evidence, or
evidence of overall Version-Aware superiority. R2.10 was not rerun; its 22
archived checksum entries were independently verified.
