# V5 R2.13 Top-3 Reranking Diagnostic Result

Date: 2026-07-26  
Status: diagnostic complete; new preregistration and confirmation required

R2.13A used outcome-exposed R2.12 Development data and therefore cannot support
promotion. Five variants produced all 160 Top-3 outputs before judgments were
read once. R2.12 remained locked at one execution.

The preregistered weighted selector chose `pair_quota_g0.5`. It improved
conditional-merge Recall@3 to `0.55`, compatible-history Recall@3 to `0.45`,
and combined both-evidence coverage to `0.40`, but reduced hard-negative
Recall@3 from `0.50` to `0.3333`. It is therefore not gate-feasible.

`pair_score_g2.0` showed the gate-feasible diagnostic pattern:

| Endpoint | R2.12 score | Pair score g2.0 |
|---|---:|---:|
| Conditional-merge Recall@3 | 0.45 | 0.50 |
| Compatible-history Recall@3 | 0.30 | 0.40 |
| Combined both-evidence coverage | 0.15 | 0.25 |
| Current-only Recall@3 | 0.50 | 0.50 |
| Hard-negative Recall@3 | 0.50 | 0.50 |
| Unsafe Top-3 rate | 0.00 | 0.00 |

The selection formula's soft penalty was insufficient to enforce hard-negative
noninferiority. This is recorded as a protocol-selection defect and is not
retroactively corrected. A new protocol must make all safety and noninferiority
checks hard eligibility constraints before selecting a Top-3 repair. Another
lineage-disjoint Development confirmation set is required.
