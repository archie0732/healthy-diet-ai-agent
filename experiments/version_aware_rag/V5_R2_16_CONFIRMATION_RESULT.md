# V5 R2.16 Top-6-Anchored Confirmation Result

Date executed: 2026-07-28  
Scope: Development confirmation only  
Execution count: 1, locked  
Decision: gate failed; no Validation or promotion

## Result

The fixed `pair_score_g2.0_top6_anchor` repair passed all three strict
improvement checks and four of five hard constraints. It failed the required
candidate Recall@20 hard gate.

| Metric | Baseline | Top-6 anchor | Gate |
|---|---:|---:|---|
| Required candidate micro Recall@20 | 0.8077 | 0.8077 | **fail: below 0.90** |
| Conditional-merge Recall@3 | 0.35 | 0.45 | pass: improved |
| Compatible-history Recall@3 | 0.25 | 0.30 | pass: improved |
| Combined implicit both-evidence coverage | 0.05 | 0.20 | pass: improved |
| Current-only Recall@3 | 0.50 | 0.50 | pass: noninferior |
| Hard-negative-current Recall@3 | 0.8333 | 0.8333 | pass: noninferior |
| Overall unsafe Top-3 rate | 0 | 0 | pass |

All query variants received identical ordered Top-20 pools. Retrieval
completed before the sealed judgments were read. No forced pair quota was
used.

## Decision boundary

The positive Top-3 findings cannot override the preregistered candidate-recall
hard constraint. R2.16 is therefore a failed Development confirmation.
Validation, fresh-test execution, and promotion remain prohibited.

The execution guard is locked at count 1. R2.16 must not be rerun. Any
candidate-recall repair must be developed as a new outcome-exposed diagnostic
and then confirmed on another new lineage-disjoint dataset.

## Audit

The offline audit independently reproduced the result without rerunning
retrieval:

- audit status: `audit_pass`;
- raw rows: 64;
- ordered-pool identity rate: 1.0;
- hard constraints passed: 4/5;
- strict improvements passed: 3/3;
- required candidate Recall@20: 42/52 (`0.8077`).
