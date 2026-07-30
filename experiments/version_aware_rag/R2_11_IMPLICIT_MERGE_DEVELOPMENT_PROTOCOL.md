# R2.11 Implicit Merge Development Protocol

Date preregistered: 2026-07-24  
Scope: Development only  
Status: data construction is blocked until the minimum ledger is complete and
project-owner approved

## Objective and claim boundary

R2.11 tests whether query-conditioned Version-Aware retrieval can improve
implicit `conditional_merge` and `compatible_history` evidence coverage over
Recency without increasing deprecated or forbidden evidence. It does not
reopen, modify, or rerun R2.10 and cannot support a Validation, fresh-test,
answer-quality, clinical, or overall-superiority claim.

R2.10 outcomes, per-query results, query IDs, topics, and lineage IDs are
prohibited as training, detector, reranker, fallback, or data-selection
features. R2.10 artifacts may be read only for archive integrity and exclusion
checks.

## Dataset contract

The R2.11 ledger must contain distinct lineage groups:

| Stratum | Minimum groups | Evidence contract |
|---|---:|---|
| `conditional_merge` | 16 | at least one current and one retained item |
| `compatible_history` | 16 | at least one current and one retained item |
| `current_only` | 12 | current required; retained not required |
| `hard_negative_current` | 12 | current required; at least one deprecated or forbidden distractor |

Every record must use
`src/annotation/r2_11_schema.ts`, cite an official record URL, retain the local
source path and SHA-256, and identify a PDF page or chunk ID. Implicit strata
must explain why retained evidence is necessary even though the query contains
neither a year nor an explicit history cue.

All prior Validation and fresh-test lineage IDs are exclusions. Required
evidence may not be shared across R2.11 lineages. Data authors may inspect
official source text and prior Development annotation structure, but may not
inspect R2.10 retrieval outcomes to choose questions.

## Leakage boundary

The runtime retrieval view contains only:

- query text;
- candidate item ID, role-neutral text, publication year, source locator, and
  declared candidate-lineage edges;
- frozen system configuration.

It excludes required/deprecated/forbidden roles, annotation rationale, review
fields, split, query ID, topic ID, gold lineage ID, and all prior outcomes.
Judgments are physically separated and read only after every system has
written its raw Top-20 and Top-3 output.

## Shared candidate pool

One BM25 pool is constructed per query with `k1=1.2`, `b=0.75`, and Top-20.
The byte sequence of ordered candidate IDs and BM25 scores is hashed. Every
comparison system receives that same ordered pool. Recency remains:

```text
base_norm + 0.75 * ((year - 2015) / (2026 - 2015))
```

No out-of-pool expansion is allowed in the primary comparison.

## Development systems

The minimum comparison is:

1. Recency `lambda=0.75`;
2. frozen R2.10 explicit-history router;
3. deterministic implicit-merge feature baseline;
4. reproducible local embedding reranker;
5. reproducible local cross-encoder reranker, if an exact model ID, revision,
   files checksum, prompt/config, and deterministic settings can be saved.

No Gemini or Gemma API is allowed. A model that cannot be reproduced is
reported as unavailable and omitted; it is not silently replaced.

Detector and reranker inputs are limited to query text and role-neutral
candidate text/metadata. They may not read judgments, query ID, topic,
lineage-gold label, split, or R2.10 per-query outcomes.

## Failure-stage attribution

For each query and required item:

1. absent from shared Top-20: `candidate_recall_failure`;
2. present in Top-20 but absent from Top-3: `reranking_or_policy_failure`;
3. deprecated or forbidden item in Top-3: `safety_failure`;
4. otherwise: `retrieval_success`.

Required candidate micro Recall@20 and required micro Recall@3 are separate
endpoints and must never be combined.

## Preregistered promotion gate

Against Recency, one selected R2.11 system must satisfy all checks:

- conditional-merge required micro Recall@3 strictly improves;
- compatible-history required micro Recall@3 strictly improves;
- implicit two-sided both-evidence coverage strictly improves;
- current-only required micro Recall@3 is noninferior;
- hard-negative-current required micro Recall@3 is noninferior;
- deprecated/forbidden Top-3 hit rate does not increase;
- required candidate micro Recall@20 is at least `0.90`;
- shared-pool ordered ID/score/hash identity is `100%`;
- paired bootstrap confidence intervals and a paired exact test are reported.

Model and weight selection uses Development only. If any gate fails, the cycle
remains in Development.

## Freeze and execution order

1. Complete the source-capacity audit and close every documented gap.
2. Complete all 56 or more annotations without retrieval outcomes.
3. Obtain project-owner approval for every record.
4. Run `scripts/v5/validate_r2_11_development_ledger.ts` with every prior
   Validation/fresh ledger as an exclusion input.
5. Freeze the byte-level ledger SHA-256, exclusion-file hashes, schema,
   validator, corpus, source manifests, systems, parameters, endpoints, and
   runner in a manifest.
6. Only then execute Development retrieval.
7. Save raw scores, ordered Top-20, Top-3, latency, configuration, model
   provenance, stage attribution, metrics, statistical results, and checksums.

No R2.11 ledger is frozen at protocol creation time because the minimum source
and annotation counts are not yet met. Retrieval is therefore blocked by
design.

