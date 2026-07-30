# V5 Relation Detector Freeze Readiness

Date: 2026-07-22

## Decision

V5 relation-detector freeze is currently **blocked**. No V5 held-out test may be
constructed yet.

## Evidence

- The V4 post-test Gemma detector achieved accuracy 0.30 and macro-F1 0.196486.
- V3 relation annotations contain five endpoint groups where identical old/new
  passages have conflicting gold labels.
- Even after excluding those groups, manual error inspection found materially
  invalid labels, including unrelated passages labeled `duplicate` and an
  explicit population exception labeled `superseded` rather than
  `conditional_difference`.
- On the remaining 21-group Development split, neither Gemma, Gemini 3.1
  Flash-Lite, nor fail-closed consensus met the preregistered safety requirement
  of zero unsafe-to-pair-preserving errors.

The failed gate is retained in
`results/v5/relation_detector_development/DEVELOPMENT_SELECTION.json`. Validation
was not opened.

## Provider audit

- `gemini-3.5-flash`: unavailable because the project quota was exhausted.
- `gemini-3.6-flash`: only 11/21 structured responses completed before a bounded
  stop; repeated responses exhausted output tokens on hidden thinking and
  returned truncated JSON.
- `gemini-2.5-flash`: API returned 404, unavailable to new users.
- `gemini-3-flash-preview`: health probe returned 503 high demand.
- `gemini-2.0-flash`: health probe returned quota 429.
- `gemini-3.1-flash-lite`: health probe and all 21 Development calls succeeded;
  it entered Development selection but failed the safety gate.

Raw successful calls and invalid-output traces are preserved under
`results/v5/relation_detector_development/model_calls/`.

## Required next action

Create a new reviewed detector dataset from official-source pairs that were not
used in the V4 fresh test. Draft labels must be reviewed against the displayed
old/new evidence and corrected before a new endpoint-disjoint Development and
Validation split is created. Until then, Oracle results remain attainable-policy
evidence only and cannot support a deployability or overall-superiority claim.

