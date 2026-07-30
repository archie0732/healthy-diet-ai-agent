# V5 R2 Action Detector Result

Date: 2026-07-22

## Outcome

R2 repaired the evaluation target from five-class relation identity to the
binary retrieval action that the policy actually needs:

- `PAIR_PRESERVE`: retain both passages because they contribute distinct,
  compatible current evidence or an applicable condition/exception.
- `BLOCK_RETAINED`: suppress the older passage because it is duplicated,
  replaced, conflicting, or uncertain.

The data and execution guards are complete, but no tested detector satisfied
the preregistered Development safety gate. Validation was therefore not run,
and no fresh V5 test or policy freeze was created.

## Data repair and split

- All 22 Codex-mined pairs, including all five records from the failed earlier
  validation, are now Development data.
- `v5claim-006` is corrected only in the R2 Development derivative. The
  original record is untouched; the post-validation correction is recorded in
  `data/annotations_v5/r2_action_detector/CORRECTION_LEDGER.jsonl`.
- Development is balanced: 11 `PAIR_PRESERVE`, 11 `BLOCK_RETAINED`.
- A new 12-pair WHO/FAO validation artifact is sealed: 6/6 balanced.
- Development/validation atomic evidence SHA-256 overlap is zero.
- The sealed validation execution count remains zero in R2, R2.1, and R2.2.

The validation evidence includes WHO/FAO TRS 916 (2003), WHO sodium and
potassium guidelines (2012), sugars (2015), carbohydrate, total-fat,
saturated/trans-fat, and non-sugar-sweetener guidelines (2023), and the
lower-sodium salt-substitute guideline (2025). Every record retains an official
URL, local PDF, page number, exact quote, source checksum, and quote checksum.

## Development-only ablations

| Cycle | Decision formulation | Best safe result | Outcome |
|---|---|---:|---|
| R2 | Direct binary action | Precision 1.000; recall 0.182; false preserve 0 | Below useful-recall gate |
| R2.1 | Direct action plus abstract examples | Precision 1.000; recall 0.273; false preserve 0 | Below recall 0.5 gate |
| R2.2 | Decomposed retention status, then deterministic mapping | Best single-model recall 0.727 but 3 false preserves; consensus recall 0.455 with 2 false preserves | Safety gate failed |

The R2.2 Gemma model recovered more compatible history but incorrectly
preserved three unsafe Development pairs. Gemini 3.1 Flash-Lite and consensus
reduced neither unsafe errors nor missed preserve cases enough to pass both
constraints at once.

## Gate decision

Preregistered Development eligibility required all of:

1. false preserve count = 0;
2. pair-preserve precision = 1.0;
3. pair-preserve recall >= 0.5.

No R2.2 configuration passed. Following the recorded stop rule:

- do not execute the sealed R2 validation;
- do not tune against validation;
- do not freeze or promote this predicted action detector;
- do not create or open a fresh V5 test;
- do not claim overall superiority over Recency.

The current positive claim remains narrower: Oracle lineage information can
improve historical/conditional coverage in controlled strata, but the available
predicted detector cannot yet recover that advantage with the required safety.

## Traceability

- R2 split: `data/configs/v5_r2_action_detector/SPLIT_MANIFEST.json`
- R2.1 derivation: `data/configs/v5_r2_1_action_detector/R2_1_DERIVATION.json`
- R2.2 stop rule: `data/configs/v5_r2_2_action_detector/R2_2_DERIVATION.json`
- R2 results: `results/v5/r2_action_detector_development/`
- R2.1 results: `results/v5/r2_1_action_detector_development/`
- R2.2 results: `results/v5/r2_2_action_detector_development/`
- WHO/FAO source manifest: `data/sources_v5/who_fao/MANIFEST.json`

Reviewer limitation: the evidence mining and semantic review were performed by
Codex as the primary AI reviewer, not by an independent blinded human or
clinical expert. This is appropriate for Development diagnosis but not a final
held-out scientific claim.
