# Plan 08C: Focused Version-Aware Policy Development

## Purpose and boundary

This plan follows Plan 08B-R1.  It develops and diagnoses the Oracle policy
only on the inspected V3 development and validation partitions.  It does not
open, retrieve, score, or tune on a V3/V4 held-out test split; it does not
create predicted relations or generate answers.

The target claim is deliberately narrow: a version-aware policy may add value
when an answer requires both current and retained compatible evidence, or when
an explicit historical request must override recency.  Aggregate recall remains
diagnostic, not the sole success criterion.

## Pre-registered development endpoints

All systems use the same query-aware candidate pool and `topK = 3`.

| Endpoint | Population | Definition | Decision use |
|---|---|---|---|
| Conditional-merge required micro recall@3 | `stratum=conditional_merge` | required hits / required chunks | Primary policy-potential endpoint |
| Compatible-history required micro recall@3 | `stratum=compatible_history` | required hits / required chunks | Co-primary retained-evidence endpoint |
| Historical candidate recall@20 | explicit historical queries (`temporal_intent=historical`) | required chunks present in the shared candidate pool / required chunks | Candidate-coverage endpoint |
| Historical required micro recall@3 | explicit historical queries | required hits / required chunks | Reranking endpoint |
| Deprecated/forbidden hit rate@3 | all strata | queries with deprecated or forbidden result / queries | Safety guardrail |

An intervention is promotable only if it improves at least one target endpoint
on development without reducing either target endpoint or increasing the safety
rate on validation.  Validation is confirmation only: it is never used to
select weights or candidate budgets.

## Ordered work

1. **Candidate coverage:** Add a deterministic historical-year backfill.  For
   an explicit historical query, retain the highest BM25-scored target-year
   evidence within the fixed pool by replacing only the pool tail.  Apply this
   before every system, record the displaced item and reason, and make no use
   of judgments.
2. **Policy ranking:** Give exact-year chunks a bounded historical-intent score
   in the Oracle policy.  This makes an explicit 2015 question prefer 2015
   evidence over newer lexical distractors while preserving the ordinary
   current-query behavior.
3. **Retained-evidence evaluation:** Keep compatibility expansion enabled and
   compare the focused rule with R1's frozen Oracle weights.  Record q-030,
   q-031, and q-037 as diagnostic cases, not as hard-coded behavior.
4. **Sample expansion specification:** For V4 development/validation, curate
   at least 12 independent lineage groups per `conditional_merge` and
   `compatible_history` stratum.  Each conditional query must require a
   current chunk plus a distinct retained conditional/compatible chunk.  Each
   compatible-history query must require evidence that recency alone can
   plausibly demote.  Do not select or label V4 fresh-test queries from these
   inspected V3 lineages.
5. **Gate:** Freeze neither Oracle nor parameters in this phase.  If the
   targeted endpoints improve under the guardrails, carry the rule and its
   manifest into a separately frozen V4 protocol; otherwise retain the failure
   diagnosis and continue development.

## Required artifacts

- `focused_policy_preregistration.json`
- `focused_raw_retrieval_results.jsonl`
- `focused_candidate_pool_events.jsonl`
- `focused_endpoint_metrics.json`
- `focused_failure_cases.json`
- `FOCUSED_POLICY_DEVELOPMENT_REPORT.md`
- checksums generated last

## Non-negotiable checks

- Candidate-pool IDs and hashes match across Recency and Oracle per query.
- The judgment file is read only after retrieval; the test split is never read.
- Endpoint calculations are recomputable from raw retrieval and frozen V3
  judgments.
- No query ID, chunk ID, or judgment label is used as a policy special case.
