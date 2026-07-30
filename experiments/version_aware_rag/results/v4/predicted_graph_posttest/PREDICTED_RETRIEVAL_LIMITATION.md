# Predicted Retrieval Limitation

The predicted graph was genuinely generated without Oracle labels, but the frozen retrieval runner ignores relation type and uses only edge existence and endpoints. All 40/40 predicted edges have the same endpoints as the Oracle edges. Running the frozen retrieval again would therefore reproduce the Oracle system rather than measure a deployable Oracle-to-Predicted gap.

Detector accuracy: 0.3; macro-F1: 0.196486. These are post-test diagnostics only.
