# Predicted Graph Post-Test Diagnostic Protocol

The fresh retrieval gate failed before this detector was fixed. Therefore the
predicted graph is a post-test diagnostic, not a preregistered deployment
validation and cannot rescue the failed overall-superiority claim.

The detector is frozen to `gemma-4-31b-it`, API `v1beta`, temperature 0,
scores-independent zero-shot relation prompt, and the five relation classes
`duplicate`, `superseded`, `conflicting`, `conditional_difference`, and
`complementary`. Inputs contain only old/new passage text and source metadata.
They exclude queries, judgments, required IDs, Oracle labels, retrieval scores,
and test metrics. Predictions and raw calls are written before labels are read
for diagnostic scoring.

