# Paper Handoff after R2.21

Date: 2026-07-28

## Experiment status

- R2.10 remains the locked scope-limited fresh-test result; verify its 22-file
  archive only and do not rerun it.
- R2.19 selected equal-weight BM25-MiniLM RRF on outcome-exposed Development
  data (`50/52`, Recall@20 `0.9615`).
- R2.20 tested the neural-hybrid system on 32 new owner-approved,
  lineage-disjoint Development records. Candidate Recall@20 was `51/52`
  (`0.9808`), conditional Recall@3 improved `0.65 -> 0.75`, compatible-history
  Recall@3 improved `0.40 -> 0.50`, and combined implicit both-evidence coverage
  improved `0.25 -> 0.45`. Current-only Recall@3 decreased `1.00 -> 0.8333`;
  the complete gate therefore failed.
- R2.21 showed that lexical:dense RRF weights of 2:1 and 3:1 do not recover the
  current-only loss. No repair was selected.

## Safe paper claim

On Development data, offline neural-hybrid candidate retrieval substantially
improved candidate recall and implicit two-evidence retrieval relative to the
lexical control, but introduced a current-only ranking trade-off and did not
pass the complete preregistered promotion gate.

## Claims to avoid

- Do not call R2.19 or R2.21 independent confirmation.
- Do not state that R2.20 passed.
- Do not claim Validation, fresh-test replication, production readiness, or
  clinical effectiveness for the neural-hybrid repair.
- Do not tune further on R2.20 and present the result as unbiased evidence.

## Recommended manuscript work now

1. Use R2.10 as the locked held-out result for the earlier scope-limited
   version-aware policy claim.
2. Present R2.19–R2.21 as a Development ablation and negative-result sequence.
3. Include the R2.20 comparison table and explicitly report the failed
   current-only noninferiority constraint.
4. Add a limitation that exact-evidence annotations can penalize semantically
   relevant same-guideline passages, while remaining necessary for provenance.
5. Freeze experimental work unless reviewers require another independent
   confirmation; prioritize manuscript tables, methods, limitations, and
   reproducibility appendix.
