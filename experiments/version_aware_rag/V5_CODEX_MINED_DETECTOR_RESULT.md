# V5 Codex-Mined Relation Detector Result

Date: 2026-07-22

## Dataset

Codex rebuilt the relation dataset as 22 atomic claim-span pairs from the
official DGA 2015-2020, 2020-2025, and 2025-2030 documents. Every record stores
official URLs, local Markdown line ranges, exact text hashes, scope, rationale,
and reviewer provenance. Codex is recorded as an AI primary reviewer, not an
independent human annotator.

The evidence-hash connected-component split contains 17 Development and five
sealed Validation pairs, with zero shared evidence hashes.

## Development selection

The selected configuration was `fail_closed_consensus_0.8` using
`gemma-4-31b-it` and `gemini-3.1-flash-lite`.

- false unsafe-to-pair expansions: 0
- pair-preserving precision: 1.0
- pair-preserving recall: 0.5
- macro-F1: 0.302857

The configuration is an expansion-authorization safety gate, not a strong
five-class classifier. Disagreement or insufficient confidence maps to no
retained-history expansion.

## One-shot Validation

Validation executed exactly once and failed the frozen gate:

- false unsafe-to-pair expansions: 1
- pair-preserving precision: 0
- pair-preserving recall: 0
- invalid outputs: 0

The execution guard is locked as `validation_failed_no_retuning`; no V5 fresh
test was created.

## Post-validation diagnosis

The unsafe error occurred on `v5claim-006`. Codex had labeled the pair
`duplicate`, but both frozen detectors independently classified it as
`conditional_difference` because the newer saturated-fat recommendation adds
the explicit scope “starting at age 2.” This is a credible gold-label error by
the Codex primary reviewer. It cannot be corrected to rescue this Validation
run after observing the result.

Other failures show that five-way relation identity is stricter than the actual
retrieval action needed: superseded, conflicting, and uncertain all produce the
same safe no-retained-expansion action, while complementary and applicable
conditional relations authorize pair preservation. A future cycle may
preregister an action-level detector endpoint, but must create a new reviewed
Development/Validation split before evaluation.

## Decision

V5 is not freeze-eligible. Oracle results remain attainable-policy evidence.
The next detector cycle must add new atomic pairs, correct the rubric before
splitting, and use a newly sealed Validation set. The failed five-pair
Validation set may only become future Development data and may never be reused
as held-out confirmation.

