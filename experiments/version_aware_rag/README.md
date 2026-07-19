# Version-Aware RAG for Evolving Nutrition Guidelines

## Abstract

This project investigates retrieval-augmented generation (RAG) over evolving health-guideline documents. In domains such as nutrition, medicine, law, and technical standards, highly ranked evidence may be obsolete, superseded, or applicable only to a particular population. Conventional RAG systems generally treat document recency as a ranking signal, but do not explicitly model how statements across versions relate to one another.

We develop a reproducible **Version-Aware RAG** framework that represents cross-version evidence relations and applies a policy layer during retrieval. The framework compares append-only retrieval, recency-only retrieval, retrieval with an oracle relation graph, and retrieval with predicted relations. It includes frozen datasets, checksums, no-oracle execution controls, ablation tests, held-out evaluation, automatic citation-grounded proxy metrics, and a blinded human-evaluation pipeline.

The current held-out evaluation does not show statistical evidence that the proposed policy outperforms a strong recency-only baseline. This result is treated as a substantive finding: imperfect version policies can introduce a measurable safety–relevance trade-off. The project therefore focuses on rigorous evaluation of that trade-off rather than unsupported superiority claims.

---

## 1. Research Motivation

RAG systems retrieve external documents before generating an answer. This improves traceability compared with relying only on model parameters, but retrieval quality remains critical. A common failure case arises when a corpus contains multiple editions of an authoritative document:

- an earlier recommendation has been replaced by a later recommendation;
- two recommendations are both valid, but apply to different populations or conditions;
- an older statement remains topically relevant but is no longer suitable as guidance;
- a newer document is not always preferable when it omits a useful, compatible qualification from an earlier document.

The central problem is therefore not only temporal ranking. It is the interpretation of **version relations**, **applicability conditions**, and **policy consequences** among evidence passages.

This project uses the Dietary Guidelines for Americans (DGA) 2015 and 2025 documents as a controlled case study. The design is intended to generalize to any knowledge source with versioned, evolving, or condition-dependent guidance.

---

## 2. Research Questions

1. How often do conventional retrieval approaches return outdated, deprecated, or conditionally inappropriate evidence in a versioned corpus?
2. Can an explicit relation graph and policy-aware retrieval mechanism reduce stale or unsafe evidence selection?
3. What relevance cost is introduced by policy filtering, compatibility expansion, and condition-aware constraints?
4. How does relation-detection error propagate to retrieval and answer quality?
5. How should automatic evidence-alignment metrics and blinded human answer evaluation be separated in a reproducible RAG study?

---

## 3. System Overview

```text
                 Frozen corpus and annotation dataset
                               │
                               ▼
                      Retrieval (no oracle)
             ┌────────────┬────────────┬────────────┐
             │            │            │            │
       Append-Only   Recency-Only   Version-Aware
                                          │
                                  ┌───────┴────────┐
                                  │                │
                             Oracle graph     Predicted graph
                                  │                │
                                  └───────┬────────┘
                                          ▼
                         Retrieval scoring and statistics
                                          │
                                          ▼
                  Answer generation and citation validation
                          │                         │
                          ▼                         ▼
       Automatic citation-grounded proxies   Blinded human evaluation
```

### 3.1 Corpus representation

The corpus is segmented into traceable chunks. Each chunk retains source-document metadata, page provenance, version information, lineage metadata where available, and condition/population tags. This supports retrieval evaluation at the evidence level rather than only at the generated-text level.

### 3.2 Version relation graph

Annotated chunk pairs represent cross-version relationships. Core relation types include:

| Relation | Interpretation |
|---|---|
| `superseded` | A newer statement replaces an older statement. |
| `deprecated` | An older statement should not be retained as guidance. |
| `compatible` | The passages can be used together. |
| `complementary` | One passage adds useful non-conflicting information to another. |
| `conditional_difference` | The relationship changes according to population, condition, or context. |

Relation annotations may also contain applicability metadata such as target populations, conditions, validity periods, and confidence.

### 3.3 Policy-aware retrieval

The Version-Aware retriever applies policy decisions derived from relation annotations or predicted relations. The policy layer can:

- suppress deprecated or superseded evidence;
- retain compatible evidence where appropriate;
- apply separate boosts for retained relations and condition matches;
- expand a candidate set with compatible evidence under configured thresholds;
- diversify near-duplicate evidence.

All retrieval policy weights are configuration parameters rather than hard-coded constants. Their frozen values are documented in `POLICY_PARAMETER_FREEZE_REPORT_V3.md`.

---

## 4. Experimental Conditions

| System | Description | Relation source |
|---|---|---|
| Append-Only RAG | Baseline lexical/heuristic retrieval without version policy. | None |
| Recency-Only RAG | Baseline with a recency-aware ranking adjustment. | Publication recency |
| Proposed Oracle Graph | Version-aware policy using adjudicated relation annotations. | Oracle relations |
| Proposed Predicted Graph | Version-aware policy using detector outputs. | Predicted relations |

The oracle condition is an analytical upper-bound condition. It is used to isolate the contribution of the policy mechanism when relation information is assumed correct; it is not presented as a deployable system.

---

## 5. Dataset and Reproducibility Controls

### 5.1 Dataset scope

| Resource | Current frozen scope |
|---|---:|
| Corpus chunks | 583 |
| Evaluation queries | 40 |
| Adjudicated relation pairs | 51 |
| Development split | 24 queries |
| Validation split | 8 queries |
| Held-out test split | 8 queries |

The splits are separated to prevent query, evidence, and lineage leakage. The current dataset is a frozen pilot benchmark. The small held-out split is explicitly treated as a limitation of inferential strength.

### 5.2 Freeze artifacts

| Artifact | Purpose |
|---|---|
| `CORPUS_FREEZE_REPORT_V3.md` | Corpus audit, chunking decisions, and corpus SHA-256 checksum. |
| `DATASET_FREEZE_REPORT_V3.md` | Dataset version, split checksums, annotation agreement, and adjudication record. |
| `POLICY_PARAMETER_FREEZE_REPORT_V3.md` | Frozen retrieval-policy parameters and associated input checksums. |
| `EXPERIMENT_CONTRACT_V3.md` | Information-access rules, no-oracle restrictions, and test-split protocol. |

The frozen corpus checksum is:

```text
ee4f1c5bddb6b7f255aa4cd497614812bb1933e545c4f0dc3e45986b3a624af7
```

### 5.3 No-oracle execution contract

The experiment runner uses two explicitly separated phases:

1. **Retrieval phase:** loads only the corpus and queries, then retrieves evidence for every query.
2. **Scoring phase:** only after all retrieval is complete, loads judgments and computes metrics.

The runner emits observable ordering events, and integration tests assert that judgments and their checksum are not read before retrieval finishes. This prevents gold labels from influencing candidate selection or ranking.

---

## 6. Evaluation Methodology

### 6.1 Retrieval metrics

The project evaluates retrieval using:

- Recall@3
- Precision@3
- Mean Reciprocal Rank (MRR)
- nDCG@3
- Stale Hit Rate
- Unsafe Chunk Count

Continuous or ranked metrics use paired bootstrap confidence intervals and Wilcoxon signed-rank testing. Binary paired outcomes use McNemar testing. Multiple comparisons are corrected with Holm–Bonferroni adjustment.

### 6.2 Relation-detection evaluation

Relation detection reports accuracy, macro-F1, per-class precision/recall/F1, confusion matrix, invalid-output rate, latency, token use, and estimated cost. Detector caches are keyed by model, prompt hash, and both source-text hashes to ensure that relevant changes invalidate stale predictions.

### 6.3 Automatic citation-grounded proxy metrics

Automatic answer metrics are calculated from frozen gold evidence sets and citation validation. They provide a deterministic indication of evidence alignment, including completeness, version correctness, unsupported-citation risk, and citation entailment proxies.

These files are explicitly marked with:

```json
{
  "metric_provenance": "automatic_gold_citation_proxy",
  "scoring_method": "deterministic_rules_from_gold_chunk_sets"
}
```

They are not presented as human judgments or semantic expert evaluation.

### 6.4 Blinded human answer evaluation

Human evaluation is handled independently from automatic metrics. The blinded package contains 24 items (three anonymized systems × eight held-out queries). Each item includes only:

- a stable blind item identifier;
- the question;
- an anonymized system alias (`System_A`, `System_B`, or `System_C`);
- the generated answer;
- answer citations.

It excludes real system names, run identifiers, prompts, model metadata, timing, token counts, retrieval ranks, retrieval scores, gold judgments, and automatic metric values.

The evaluation rubric uses the following dimensions:

| Dimension | Scale |
|---|---|
| Answer correctness | 0 / 0.5 / 1 |
| Completeness | 0 / 0.5 / 1 |
| Version correctness | 0 / 0.5 / 1 |
| Conditional-boundary preservation | 0 / 0.5 / 1 |
| Unsupported claim | 0 / 1 |
| Citation entailment | 0 / 0.5 / 1 |

Two independent reviewers can be compared with Cohen's kappa for binary labels and weighted Cohen's kappa for ordinal labels. Disagreements are retained and resolved through a documented adjudication process. Until this process is complete, paper tables label the human-evaluation section as pending.

---

## 7. Current Held-Out Results and Interpretation

The current held-out test set contains eight queries. Retrieval results are:

| System | Recall@3 | nDCG@3 | Stale Hit Rate |
|---|---:|---:|---:|
| Append-Only RAG | 20.8% | 0.350 | 12.5% |
| Recency-Only RAG | 58.3% | 0.670 | 12.5% |
| Proposed Oracle Graph | 20.8% | 0.350 | 12.5% |
| Proposed Predicted Graph | 20.8% | 0.350 | 12.5% |

On this frozen test set, the proposed policy does not demonstrate an advantage over Recency-Only retrieval. No stale-hit reduction is observed, while relevance metrics are lower for the proposed configurations. Oracle and predicted relation conditions produced identical retrieval results in this evaluation; consequently, the observed performance loss should not be attributed to detector propagation error in this run.

This outcome motivates the project's current research interpretation: version-aware filtering must be evaluated not only for safety intent, but also for its potential to over-filter relevant evidence. The appropriate conclusion is a **safety–relevance trade-off analysis**, not a superiority claim.

---

## 8. Repository Layout

```text
experiments/version_aware_rag/
├── README.md                                  # This document
├── EXPERIMENT_CONTRACT_V3.md                  # Evaluation and no-oracle contract
├── CORPUS_FREEZE_REPORT_V3.md                 # Corpus audit and checksum
├── DATASET_FREEZE_REPORT_V3.md                # Dataset freeze and annotation evidence
├── POLICY_PARAMETER_FREEZE_REPORT_V3.md       # Frozen policy parameters
├── WALKTHROUGH_V3.md                          # Implementation and validation record
├── configs/v3/                                # Baseline and proposed YAML configurations
├── data/
│   ├── corpus_v3/chunks.jsonl                  # Frozen corpus
│   └── annotations_v3/                         # Queries, judgments, relation annotations
├── src/                                       # Retrieval, versioning, generation, evaluation code
├── scripts/v3/
│   ├── run_experiment.ts                       # Controlled experiment runner
│   ├── run_heldout_pipeline.ts                 # Held-out retrieval and artifact pipeline
│   ├── run_statistics.ts                       # Paired statistical analysis
│   ├── build_paper_tables.ts                   # Markdown/LaTeX paper tables
│   ├── export_blind_answer_annotation_package.ts
│   └── import_and_adjudicate_answer_annotations.ts
├── tests/                                     # Unit and integration tests
└── results/v3/
    ├── <run-id>/                               # Isolated manifests and run artifacts
    ├── paper/                                  # Tables, statistics, and public research artifacts
    └── private/                                # Git-ignored alias mapping; never distribute
```

---

## 9. Reproducing the Experiment

Run commands from the repository root.

### Verify the test suite

```powershell
bun test experiments/version_aware_rag/tests/unit experiments/version_aware_rag/tests/integration
```

The current expected result is 62 passing tests and zero failures. The suite covers no-oracle execution order, policy behavior, detector isolation, statistical guards, blind-package leakage checks, and human-annotation import validation.

### Run one controlled experiment

```powershell
bun experiments/version_aware_rag/scripts/v3/run_experiment.ts `
  --config experiments/version_aware_rag/configs/v3/baseline_recency_only.yaml `
  --split development
```

### Run the held-out pipeline

```powershell
bun experiments/version_aware_rag/scripts/v3/run_heldout_pipeline.ts
```

The held-out split must not be used for parameter selection. After a test split has been inspected, new tuning must occur only on development/validation data or on a newly created, independently frozen evaluation dataset.

### Export blinded answer-review packages

```powershell
bun experiments/version_aware_rag/scripts/v3/export_blind_answer_annotation_package.ts
```

Packages are written to:

```text
experiments/version_aware_rag/results/v3/paper/blind_review/
```

### Import human evaluations and compute agreement

```powershell
bun experiments/version_aware_rag/scripts/v3/import_and_adjudicate_answer_annotations.ts `
  --annotator1 <annotator-1-results.json> `
  --annotator2 <annotator-2-results.json> `
  --adjudication <adjudication-results.json>
```

The importer rejects incomplete submissions, duplicate item IDs, invalid rubric values, altered item identity fields, and automatic metrics presented as human annotations.

---

## 10. Limitations and Planned Extension

The current benchmark is intentionally frozen, but its held-out test split is small (`n=8`). It is sufficient for pipeline validation and pilot trade-off analysis, but not for strong general claims. A future dataset version should expand the query pool while preserving the current v3 corpus and results as a historical pilot benchmark.

The most valuable extension is a new, independently frozen evaluation set with more version-conflict and condition-sensitive queries. Any such expansion should use separate development, validation, and unopened test partitions; it must not merge new questions into the already inspected v3 held-out split.

---

## 11. Research Contributions

1. A version-aware RAG framework that models evidence relations and applicability constraints rather than relying on recency alone.
2. A reproducible experimental contract with checksums, isolated manifests, configuration validation, and a no-oracle retrieval/scoring boundary.
3. A controlled comparison between oracle and predicted relation graphs.
4. A policy-ablation framework that tests filtering, relation boosts, compatibility expansion, and diversification separately.
5. A principled separation between automatic citation-grounded evidence proxies and blinded human answer evaluation.
6. An empirically grounded negative-result analysis showing that version policies may reduce relevance when relation and policy calibration are insufficient.
