# V4 Research Plan: Answer-Grounded Version-Aware RAG

## Status and scope

This document is the forward-looking plan for the next experiment version. It
does not alter the frozen v3 corpus, annotations, parameters, held-out results,
or their interpretation. V3 remains a pilot and a negative-result record:
its Oracle Version-Aware condition did not outperform the Recency-Only
baseline on the inspected eight-query test split.

V4 will test the following question:

> Can a version- and applicability-aware evidence policy improve the final
> answer's evidence-grounded correctness, version correctness, and preservation
> of population/condition boundaries relative to Append-Only and Recency-Only
> RAG?

The study is not designed to claim that newer evidence is always correct, nor
that a version-aware policy is successful merely because it filters evidence.

## Causal model and success criteria

The experiment treats retrieval as an intermediate cause and the generated
answer as the user-facing outcome.

```text
question -> retrieval policy -> retrieved evidence -> fixed answer generator
         -> citations and answer -> blinded evaluation
```

The primary comparison is Version-Aware RAG versus Recency-Only RAG. Append-
Only RAG is retained as an additional baseline. The primary endpoint is the
mean *version-grounded answer correctness* on the unopened V4 test split. An
answer counts as successful only when it is correct for the question and does
not present deprecated, superseded, forbidden, or inapplicable evidence as
current guidance.

The co-primary safety endpoint is *conditional-boundary preservation*: an
answer must retain material population, age, health-condition, or other
applicability limitations required by the evidence. A higher general answer
score cannot compensate for failing either primary safety endpoint.

The following are required before a positive deployment-oriented claim:

1. Oracle Version-Aware RAG must improve or at least not materially degrade
   the primary endpoints versus Recency-Only RAG.
2. Predicted Version-Aware RAG must use genuine detector output, not oracle or
   adjudicated labels, and its gap from Oracle must be reported.
3. Blinded human evaluation and agreement/adjudication must be complete.

If Oracle does not outperform Recency-Only, the conclusion is a policy or
coverage limitation, not detector error. If Oracle succeeds but Predicted does
not, the conclusion is detector-limited deployment readiness.

## Experimental conditions

All systems must use the same corpus version, query text, candidate budget,
top-k, answer-generation model, generation prompt, temperature, token limit,
and citation format. Only the retrieval/evidence policy may differ.

| ID | Retrieval policy | Relation source | Purpose |
|---|---|---|---|
| A | Append-Only | None | Lexical retrieval baseline without version policy. |
| B | Recency-Only | Publication recency only | Strong temporal-ranking baseline. |
| C | Version-Aware Oracle | Adjudicated V4 relation graph | Tests the policy's attainable value. Not deployable. |
| D | Version-Aware Predicted | Detector-generated V4 graph | Tests the deployable pipeline and error propagation. |

Oracle and Predicted must be generated into separate, checksummed artifacts.
The Predicted artifact must record detector model, prompt hash, input hashes,
timestamp, raw output, parsed output, confidence, latency, token use, and cost.
It must never contain `annotator_id: "oracle"` or adjudicated labels as its
prediction source.

## Dataset and split protocol

1. Preserve `corpus_v3/chunks.jsonl` as the starting corpus unless a corpus
   revision is explicitly versioned and frozen.
2. Create V4 relation annotations that expand coverage across version changes,
   compatible history, and population/condition-specific differences. The
   target is roughly 70--90 additional relation pairs as identified by the V4
   coverage audit.
3. Create a candidate pool before selecting final queries. Include four
   strata: `current_only`, `compatible_history`, `conditional_merge`, and
   `hard_negative` (a newer but irrelevant passage must not win merely through
   recency).
4. Create and adjudicate evidence judgments before running the final test.
   Each judgment must distinguish required, compatible, preferred, deprecated,
   forbidden, and citation-safe chunks.
5. Use separate development, validation, and fresh held-out test partitions.
   Target at least 80 V4 queries with a 20 / 20 / 40 split. Split checks must
   prevent query, evidence, and lineage leakage.
6. Freeze corpus, relations, queries, judgments, splits, prompts, policy
   parameters, and detector configuration before opening the test split.

All V3 held-out questions are considered inspected and must not be re-used as
the V4 held-out set.

## Development sequence

### Phase 1: diagnose the Oracle policy

Use only V4 development and validation data to trace each query through these
stages: base-candidate recall, deprecated filtering, relation retention,
compatibility expansion, condition matching, diversification, and final top-k.
For every Oracle loss against Recency-Only, record the first stage that removed
or down-ranked required evidence. Fix policy, graph coverage, or base retrieval
only when a diagnosis supports the change.

### Phase 2: select and freeze the policy

Tune only on development and validation data. Evaluate the existing ablations
(`filter_only`, retain boost, compatibility expansion, condition matching, and
diversification) plus any new policy rule. Select one configuration before the
test run; do not select on answer results from the held-out test.

### Phase 3: build a real predicted graph

Run the rule baseline, zero-shot detector, and few-shot detector on relation
pairs without exposing adjudicated labels to the detector. Report per-class
precision/recall/F1, macro-F1, invalid-output rate, calibration, latency,
tokens, and cost. Select the deployable detector on validation data, freeze it,
then generate the V4 predicted graph.

### Phase 4: fixed-generator answer evaluation

For every held-out query, run A--D with an identical answer generator and
prompt. The generator may only answer from supplied chunks, must cite each
material factual claim, and must state uncertainty or abstain when evidence is
insufficient or conflicting. Store prompts, model ID, decoding settings,
retrieved chunk IDs, answer text, and parsed citations for reproducibility.

## Evaluation plan

### Retrieval and evidence metrics (secondary diagnostics)

- Recall@k, Precision@k, MRR, nDCG@k
- required-evidence recall and citation-safe evidence recall
- stale / deprecated / forbidden evidence rate
- unsafe chunk count and per-stratum results

These metrics explain *why* answer quality changed; they are not substitutes
for the answer endpoints.

### Answer metrics (primary outcomes)

Every system answer receives the following blinded human ratings:

| Metric | Scale | Definition |
|---|---:|---|
| Version-grounded answer correctness | 0 / 0.5 / 1 | Correct answer with no material version/applicability error. |
| Conditional-boundary preservation | 0 / 0.5 / 1 | Required population and condition limitations are retained. |
| Completeness | 0 / 0.5 / 1 | Includes the material parts needed to answer the question. |
| Citation entailment | 0 / 0.5 / 1 | Citations support the claims they are attached to. |
| Unsupported claim | 0 / 1 | Any material claim lacks supporting supplied evidence. |
| Appropriate abstention | 0 / 1 | Correctly refuses or qualifies when evidence is insufficient/conflicting. |

Automatic citation-grounded metrics may be reported as diagnostics, but must be
labelled `automatic_gold_citation_proxy`. They cannot be renamed as human
judgments or used as a replacement for the primary outcomes.

Two independent evaluators must receive randomized system aliases and only the
question, answer, and citations. They must not receive system names, run IDs,
retrieval ranks/scores, gold evidence, automatic scores, or model metadata.
Report inter-annotator agreement (weighted Cohen's kappa for ordinal metrics;
Cohen's kappa for binary metrics), retain disagreements, and document
adjudication. Nutrition or clinical expertise should review the rubric and
adjudicate medically material disagreements.

### Analysis and reporting

Use paired per-query comparisons, bootstrap confidence intervals, and an
appropriate paired test for ordinal/binary outcomes. Pre-specify the primary
comparison (C vs B for policy potential; D vs B for deployment), apply
multiple-comparison correction to secondary comparisons, and report effect
sizes and all per-stratum results. Report losses and failure cases as fully as
improvements.

## Claim boundaries

Allowed conclusions:

- The policy improves, matches, or degrades the defined answer and safety
  endpoints on this frozen benchmark.
- The observed Oracle-to-Predicted gap quantifies detector sensitivity on this
  benchmark.

Disallowed conclusions:

- A retrieval-metric gain alone proves better final answers.
- An automatic gold-citation proxy is a human or clinical evaluation.
- Oracle performance demonstrates a deployable system.
- A result on the inspected V3 test set validates a newly tuned policy.

## Deliverables before declaring V4 complete

- Frozen corpus, annotation, split, prompt, policy, and detector reports.
- Genuine predicted relation graph and detector comparison report.
- Oracle-stage failure analysis and ablation report.
- Isolated A--D retrieval and answer run artifacts with manifests.
- Blind annotation package, raw annotations, agreement report, and adjudication
  record.
- Retrieval, answer-quality, safety, and statistical tables that clearly label
  metric provenance.
