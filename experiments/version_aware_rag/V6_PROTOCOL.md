# V6 Confirmatory Retrieval Protocol

Status: `CORE RETRIEVAL COMPLETE — NEGATIVE CANDIDATE-LIMITED RESULT`  
Protocol date: 2026-08-01  
Fresh retrieval allowed: **no**

## 1. Research scope

V6 evaluates query-intent-driven version-aware retrieval inside a RAG pipeline. Retrieval is the primary experimental endpoint. A fixed-generator answer study may be reported only as AI-only exploratory evidence.

The study assumes that auditable version relations exist in the knowledge base. It does not claim to automatically discover correct evidence lineages.

## 2. Prior evidence and separation

- V3, V4, V5, R2.10, and subsequent Development/Confirmation artifacts remain unchanged.
- The R2.10 16-query test is pilot evidence and is not pooled into the V6 primary analysis.
- Every query-bearing artifact enumerated by `scripts/v6/build_v6_exclusion_inventory.mjs` is excluded conservatively.
- Exclusion is checked at query ID, normalized query hash, lineage ID, chunk ID, source-page key, atomic-claim hash, and required-evidence-signature levels.

## 3. Dataset target

- Target: 96 new queries, 32 per stratum.
- Minimum: 72 queries, 24 per stratum.
- Strata: `explicit_history`, `current_only`, `hard_negative_current`.
- Minimum unique lineages: 60; target 96.
- Maximum two queries per lineage. Repeated-lineage queries require lineage-clustered inference.
- No topic family may exceed 25% of a stratum.
- At least eight topic families are required; 10–12 are preferred.

Failure to meet these gates changes the study to a targeted replication and prohibits a full benchmark-validation claim.

## 4. AI-only benchmark construction

New V6 records will not receive nutritionist or other human-expert item-by-item adjudication.

1. A candidate-mining model receives only official passages and the natural-language stratum definition.
2. Three isolated source-grounded review runs are performed, including a user-operated Gemini pass through Antigravity. Exact interface, model metadata, and session identifiers are reported; the runs are not described as three independent model families when two use GPT-family deployments.
3. Judges do not see router rules, boost values, retrieval scores, system identity, gold IDs, or each other's output.
4. All three must agree that the query is answerable, the stratum is correct, and every required/unsafe evidence label is source-supported.
5. Any source-support objection returns the record for revision or exclusion; simple 2/3 voting is insufficient.
6. Prompt, provider, model ID, model version, timestamp, raw response, parser result, and input/output hashes are retained.

### 4.1 Gemini handoff rule

- When a candidate batch is ready for Gemini review, Codex stops before that pass and tells the user explicitly that the Antigravity run is required.
- Codex prepares a sealed Gemini handoff package containing the frozen prompt, source excerpts, candidate records, schema, batch hash, and import instructions.
- The user runs Gemini in Antigravity and returns the untouched raw output plus any available model/version metadata.
- Codex validates the returned batch hash and schema before importing it. Codex does not fill missing Gemini judgments, regenerate them with another provider, or label any substitute output as Gemini.
- ChatGPT/Codex judgments and retrieval outcomes remain hidden from the Gemini handoff package so that the pass stays isolated.

The resulting labels are described as `AI-triangulated, source-grounded annotations`, not human, nutritionist, clinical, or expert consensus.

### 4.2 Removed conditional-merge stratum

The proposed `conditional_merge` stratum was removed before retrieval. Isolated adjudication found that the operative documents already stated the complete current rule, so the older pages were comparative rather than necessary evidence. Retaining those labels would have manufactured cross-version evidence requirements through query wording. The 24 affected slots were redistributed evenly across the three retained strata, and the superseded four-stratum allocation was archived with its original hashes.

## 5. Systems

All systems share the same corpus, query, tokenization, BM25 parameters, candidate budget, and deterministic tie-breaking.

| ID | System |
|---|---|
| A | BM25 |
| B | BM25 + Recency |
| C | Explicit intent + disable Recency, without lineage boost |
| D | Always-on lineage pairing |
| E | Conditional Version-Aware retrieval |
| F | Conditional Version-Aware without pair boost |

The primary comparison is E versus B.

## 6. Parameter selection

Only inspected Development/Validation data may be used to compare pair boosts `0, 0.25, 0.5, 0.75, 1.0, 1.5`. If configurations tie on the predefined effectiveness and safety criteria, select the smallest boost.

All policy parameters, router rules, source manifests, prompts, metrics, and code hashes must be frozen before fresh-test execution.

## 7. Outcomes

### 7.1 Primary effectiveness outcome

Per-query required-evidence Recall@3 difference between E and B in `explicit_history`.

Report:

- mean paired difference and absolute hit counts;
- improved/tied/regressed query counts;
- lineage-clustered paired bootstrap 95% confidence interval;
- exact paired permutation test or another frozen paired test.

A positive confirmatory claim requires a positive estimated effect, two-sided `p < 0.05`, and a 95% confidence interval whose lower bound is greater than zero. Otherwise, report the effect descriptively without a conventional-significance claim.

### 7.2 Co-primary safety gate

Across `current_only` and `hard_negative_current`, E's query-level deprecated/forbidden hit rate may not exceed B by more than an absolute `0.05`. In addition, no medically material forbidden evidence introduced uniquely by E is allowed.

Both query-level and retrieved-slot-level denominators must be reported. This margin is frozen before V6 test construction and may not be changed after results are observed.

### 7.3 Secondary diagnostics

- Macro per-query and micro required-evidence Recall@1/3/5.
- Both-evidence coverage.
- Candidate Recall@5/10/20.
- MRR and nDCG@3.
- Router precision, recall, F1, and confusion matrix.
- Per-stratum and per-topic-family results.
- Deprecated and forbidden hit rates at query and slot levels.

Secondary tests are exploratory unless a multiplicity correction is frozen before test execution.

## 8. Candidate-recall interpretation

Candidate Top-20 exists to separate candidate generation from final reranking. It is not a deployment-efficiency claim. If V6 candidate Recall@20 is below 0.90, the result remains reportable but must be interpreted as candidate-limited; the fresh test may not be rerun after repairing retrieval.

## 9. Freeze and execution order

1. Complete exclusion and source-capacity audit.
2. Acquire and freeze official sources.
3. Mine, review, and freeze relations.
4. Freeze queries and AI-adjudicated judgments in separate files.
5. Freeze corpus, candidate generator, systems A–F, router, parameters, metrics, statistics, and execution guard.
6. Validate format and hashes without running retrieval or reading sealed judgments.
7. Run all systems once while judgments remain inaccessible.
8. Seal raw output.
9. Unlock judgments for evaluation.
10. Independently recompute all metrics from raw output.

Negative and null results are retained. No query may be removed because it lowers the proposed system's score.

## 10. Current gate

Phases 0–7 of the core retrieval study are complete. The frozen corpus contains 20 official PDFs, 1,601 pages, and 3,535 deterministic page-bounded chunks. The 96 query contracts contain 133 required-evidence groups. Pair boost `0.5` was selected from the predeclared grid using previously opened V5 Development/Validation data; `0.5`, `0.75`, `1.0`, and `1.5` tied, so the smallest value was selected. Seven synthetic implementation invariants and the gold-isolation preflight passed before the single-use run.

The only V6 fresh retrieval was executed on 2026-08-01 and produced 576 A–F rows without reading judgments. The confirmatory result was negative: E minus B mean per-query required-evidence Recall@3 in `explicit_history` was `-0.03125` (95% lineage-clustered bootstrap CI `[-0.078125, 0]`; exact paired sign-flip `p = 0.5`; improved/tied/regressed `0/30/2`). The safety gate passed with no B or E unsafe hits, but E was definitionally identical to B for untriggered queries. Candidate Recall@20 was only `0.4812`, so the result is candidate-limited. Post-test attribution found 43 missing explicit-history required groups, four router false negatives, and zero actual E pair-boost activations among explicit-history queries. No tuning or confirmatory rerun is allowed. Any repaired candidate generator or chunk-to-lineage mapping must be evaluated as a new exploratory analysis or on a separately constructed V7 fresh test.
