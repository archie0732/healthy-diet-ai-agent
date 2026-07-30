# V5 R2.6 Query-Conditioned Action Detector Result

Date: 2026-07-23

## Outcome

R2.6 did **not** select or freeze an action detector. Validation was not executed,
no external model API was called, and no fresh V5 test was created.

The strongest safe Development candidate was a transparent query-necessity rule:

| Endpoint | Result |
|---|---:|
| True `PAIR_PRESERVE` | 5 |
| False preserve | 0 |
| True block | 19 |
| Missed preserve | 6 |
| Preserve precision | 1.0000 |
| Preserve recall | 0.4545 |
| Accuracy | 0.8000 |

The preregistered gate required zero false preserves, precision 1.0, and recall at
least 0.5. The candidate therefore failed. The sealed 12-pair Validation set
remains at execution count zero.

## What was tested

The endpoint was changed from pair-only classification to:

```text
QUERY + atomic OLD + atomic CURRENT
  -> PAIR_PRESERVE or BLOCK_RETAINED
```

Runtime features used only these three text fields. IDs, topic, scope tags,
relation type, action label, judgments, reviewer rationale, and Validation data
were prohibited. Candidate families were:

1. locally trained logistic regression;
2. bounded local decision trees;
3. transparent query-necessity rules based on query-relevant OLD-only content.

Logistic and tree candidates were evaluated using leave-one-lineage-group-out
predictions. Model and threshold selection occurred on Development only.

## Gold-contract defect found

Post-prediction error analysis exposed that query-conditioned labels had been
inherited from the earlier pair-only endpoint without a fresh pre-model audit.
Two of 30 Development labels need revision:

- `r2.6-v5claim-013`: CURRENT already supplies both the general sodium ceiling
  and the highly-active exception requested by the query.
- `r2.6-v5claim-016`: CURRENT directly supplies the requested chronic-disease
  adaptation requirement; OLD adds general customization context that is not
  required by the query.

This audit occurred after Development predictions were visible. Relabeling these
records and reusing the same predictions would bias promotion, even though the
arithmetic recall could improve. R2.6 is consequently marked invalid for
promotion, not retroactively repaired.

## Reproducible artifacts

- Frozen split:
  `data/configs/v5_r2_6_query_conditioned_action_detector/SPLIT_MANIFEST.json`
- Execution guard:
  `data/configs/v5_r2_6_query_conditioned_action_detector/EXECUTION_GUARD.json`
- Development selection:
  `results/v5/r2_6_query_conditioned_development/DEVELOPMENT_SELECTION.json`
- Complete 30-record label audit:
  `data/annotations_v5/r2_6_query_conditioned_development_audit/audit_ledger.jsonl`
- Audit summary:
  `data/annotations_v5/r2_6_query_conditioned_development_audit/AUDIT_SUMMARY.json`
- Builder:
  `scripts/v5/build_r2_6_query_conditioned_split.ts`
- Detector runner:
  `scripts/v5/run_r2_6_query_conditioned_development.ts`
- Audit runner:
  `scripts/v5/audit_r2_6_development_labels.ts`
- Protocol tests:
  `tests/unit/v5_r2_6_protocol.test.ts`

## Scientific interpretation

R2.6 supports the narrower diagnosis that query intent is necessary for deciding
whether compatible history deserves a retrieval slot. It does not establish that
the current local detector is good enough, and it does not establish overall
Version-Aware superiority over Recency.

The next eligible cycle must first create and audit query-conditioned gold before
any prediction is generated. It must use a replacement Development set and a new
untouched Validation set. The present 12-pair Validation set may remain sealed,
but it cannot cure the post-prediction Development-label defect.

