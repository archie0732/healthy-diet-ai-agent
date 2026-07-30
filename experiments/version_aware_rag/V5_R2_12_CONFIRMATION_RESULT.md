# V5 R2.12 Development Confirmation Result

Date: 2026-07-26  
Status: confirmation gate failed; no promotion

The project owner approved all 32 checksum-bound confirmation annotations.
The ledger contained 10 conditional-merge, 10 compatible-history, 6
current-only, and 6 hard-negative-current records, with zero overlap against
prior required evidence.

The confirmation retrieval ran exactly once and is locked. Required candidate
micro Recall@20 improved from `50/52 = 0.9615` to `51/52 = 0.9808`, confirming
that role-neutral group expansion can recover an additional required candidate.
That candidate improvement did not translate to Top-3 improvement:

| Endpoint | Whole-query BM25 | Group expansion |
|---|---:|---:|
| Conditional-merge required Recall@3 | 0.50 | 0.45 |
| Compatible-history required Recall@3 | 0.30 | 0.30 |
| Combined both-evidence coverage | 0.20 | 0.15 |
| Current-only required Recall@3 | 0.50 | 0.50 |
| Hard-negative required Recall@3 | 0.50 | 0.50 |
| Unsafe Top-3 rate | 0.00 | 0.00 |

Five of eight gates passed. The three failed gates were strict
conditional-merge Top-3 improvement, strict compatible-history Top-3
improvement, and strict both-evidence-coverage improvement. R2.12 therefore
remains Development-only. No Validation or fresh test was run.
