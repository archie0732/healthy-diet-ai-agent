# V5 R2.14 Gate-Feasible Top-3 Confirmation Result

Date executed: 2026-07-27  
Scope: Development confirmation only  
Execution count: 1, locked  
Decision: gate failed; no Validation or promotion

## Result

The fixed `pair_score_g2.0` repair passed every preregistered hard constraint
but failed one of the three required strict-improvement checks.

| Metric | `pair_score_g0.5` | `pair_score_g2.0` | Gate |
|---|---:|---:|---|
| Required candidate micro Recall@20 | 0.9423 | 0.9423 | pass |
| Conditional-merge Recall@3 | 0.45 | 0.60 | pass: improved |
| Compatible-history Recall@3 | 0.30 | 0.30 | **fail: no strict improvement** |
| Combined implicit both-evidence coverage | 0.05 | 0.20 | pass: improved |
| Current-only Recall@3 | 0.8333 | 0.8333 | pass: noninferior |
| Hard-negative-current Recall@3 | 0.50 | 0.6667 | pass: noninferior |
| Overall unsafe Top-3 rate | 0 | 0 | pass |

All 32 query pairs received byte-identical ordered Top-20 pools. The runner
completed all retrieval calls before reading the sealed judgments. No forced
pair quota was used.

## Decision boundary

R2.14 is a failed Development confirmation because compatible-history
Recall@3 did not strictly improve. The positive conditional-merge and
both-evidence results cannot override that preregistered requirement.
Validation and fresh-test execution remain prohibited.

The execution guard is locked at count 1. Any next repair must be treated as a
new Development diagnostic or a separately preregistered confirmation; R2.14
must not be rerun.

## Audit

The offline audit independently reproduced all metrics and the gate decision
from the frozen raw results without rerunning retrieval:

- audit status: `audit_pass`;
- raw rows: 64;
- ordered-pool identity rate: 1.0;
- hard constraints passed: 5/5;
- strict improvements passed: 2/3;
- prior-cycle execution counts preserved.
