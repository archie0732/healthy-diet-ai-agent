# V4 Fresh Held-Out Test Protocol

## Scope

This protocol governs the final 40-query retrieval test created only after the
development and one-shot validation gates passed. It does not authorize model,
prompt, policy, threshold, weight, candidate-budget, or endpoint tuning.

## Deterministic test construction

The pre-freeze candidate inventory is
`data/annotations_v4/candidate_relation_pairs_v4.jsonl`. Only records with
`origin=v4_new`, a test-eligible intent, and no V3 held-out query reuse are
eligible. Sort by `candidate_pair_id`, then select the first ten unique
`leakage_group_id` values in each stratum:

- `current_only`
- `conditional_merge`
- `compatible_history`
- `hard_negative`

The resulting 40 records must have unique query IDs, evidence signatures, and
leakage groups. Query wording and evidence judgments must be reviewed before
the test retrieval guard is unlocked.

## Frozen systems and endpoints

The primary retrieval comparison is Recency versus Version-Aware Oracle using
the exact validation-selected `oracle_cross_0.5` configuration. Both systems
receive the same ordered BM25 Top-20 pool; Oracle may expand only through the
frozen global relation graph. Top-k is three.

Preregistered retrieval endpoints:

1. `conditional_merge_required_micro_recall_at_3`
2. `compatible_history_required_micro_recall_at_3`
3. `retained_required_micro_recall_at_3`
4. `current_only_deprecated_or_forbidden_hit_rate_at_3`
5. `hard_negative_forbidden_hit_rate_at_3`

No endpoint may be removed after opening the test.

## Answer evaluation

After retrieval, all systems use one frozen answer model and prompt. Answer
packets randomize system aliases and expose only question, answer, and cited
passages. Codex/project-owner labels are explicitly provisional workflow
reviews, not independent blinded human or clinical evaluation. Publication-
grade answer claims still require two independent evaluators and adjudication.

## Guards

- Test retrieval executes once and supports resume only from checksummed model
  calls belonging to that same logical execution.
- Test results cannot change the frozen configuration.
- Predicted relation generation cannot read test judgments or Oracle labels.
- Oracle, Predicted, and answer artifacts remain physically separate.
- Every source URL, local file, model call, result, and manifest is checksummed.

