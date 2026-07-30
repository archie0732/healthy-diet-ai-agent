# V5 R2.15 Compatible-History Selectivity Diagnostic Result

Date executed: 2026-07-27  
Scope: outcome-exposed R2.14 Development traces only  
Decision: `pair_score_g2.0_top6_anchor` selected for new confirmation

## Result

The diagnostic performed no retrieval calls and did not rerun R2.14. Its
`pair_score_g2.0` control reproduced every frozen R2.14 Top-3 exactly.

| Variant | Conditional Recall@3 | Compatible Recall@3 | Conditional both-evidence | Compatible both-evidence | Unsafe |
|---|---:|---:|---:|---:|---:|
| `pair_score_g2.0` | 0.60 | 0.30 | 0.30 | 0.10 | 0 |
| `base_gate_0.25` | 0.60 | 0.30 | 0.30 | 0.10 | 0 |
| `base_gate_0.50` | 0.55 | 0.35 | 0.30 | 0.10 | 0 |
| `top6_anchor` | 0.60 | 0.35 | 0.40 | 0.10 | 0 |
| `top10_anchor` | 0.65 | 0.30 | 0.40 | 0.10 | 0 |

`pair_score_g2.0_top6_anchor` was selected because it strictly improved
compatible-history Recall@3 while preserving conditional-merge Recall@3,
current-only Recall@3, hard-negative Recall@3, and unsafe rate. Its
conditional both-evidence coverage also improved.

## Claim boundary

This is an outcome-exposed Development diagnostic, not confirmation evidence.
The selected variant may only be tested on a new lineage-disjoint,
project-owner-approved Development confirmation set. It cannot authorize
Validation, fresh-test execution, promotion, or an R2.14 rerun.

The independent audit passed with 160 raw rows, a control reproduction rate of
1.0, zero retrieval calls, and the R2.14 execution count preserved at 1.
