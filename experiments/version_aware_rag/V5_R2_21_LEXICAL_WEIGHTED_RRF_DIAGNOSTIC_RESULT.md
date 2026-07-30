# V5 R2.21 Lexical-Weighted RRF Diagnostic Result

Date executed: 2026-07-28  
Scope: outcome-exposed R2.20 Development data  
Decision: no eligible repair; stop confirmation cycling

| Variant | Required Recall@20 | Conditional R@3 | Compatible R@3 | Current-only R@3 |
|---|---:|---:|---:|---:|
| Lexical 1 : dense 1 | 51/52 | 0.75 | 0.50 | 5/6 |
| Lexical 2 : dense 1 | 51/52 | 0.75 | 0.50 | 5/6 |
| Lexical 3 : dense 1 | 50/52 | 0.75 | 0.55 | 5/6 |

The equal-weight control exactly reproduced R2.20. Increasing the lexical RRF
weight did not recover the displaced current-only passage. A 3:1 weight also
reduced candidate recall. No variant met the current-only noninferiority gate,
so no repair was selected and another confirmation is not justified by this
diagnostic.

For the paper, R2.19–R2.21 support a bounded conclusion: offline neural-hybrid
retrieval materially improves candidate recall and implicit two-evidence
retrieval, but introduces a current-only ranking trade-off and does not pass
the complete promotion gate. Validation and fresh-test claims remain
unauthorized.
