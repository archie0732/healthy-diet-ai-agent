# R2.20 Neural-Hybrid Top-6-Anchored Confirmation Protocol

Date preregistered: 2026-07-28  
Scope: new lineage-disjoint Development confirmation  
Status: candidate construction; retrieval prohibited

## Fixed system under confirmation

R2.20 combines two components selected on outcome-exposed Development data:

- candidate generation: `bm25_minilm_rrf_k60_top20`, selected by R2.19;
- Top-3 reranking: `pair_score_g2.0_top6_anchor`, tested by R2.16.

The candidate generator uses BM25 (`k1=1.2`, `b=0.75`, seed count 12) and
q8 `Xenova/all-MiniLM-L6-v2` sentence embeddings at revision
`751bff37182d3f1213fa05d7196b954e230abad9`. Embeddings use mean pooling,
L2 normalization, and 384 dimensions. BM25 and dense ranks are fused with
reciprocal-rank fusion at `k=60`.

The Top-3 stage uses recency weight `0.2`, pair-signal weight `2.0`, no forced
pair quota, and applies pair signal only when at least one group member is in
the six highest normalized base scores of the frozen Top-20 pool. No parameter,
fallback, or variant selection is permitted after execution.

## Construction and independence

The ledger must contain exactly 32 new project-owner-approved records:

- 10 `conditional_merge`;
- 10 `compatible_history`;
- 6 `current_only`;
- 6 `hard_negative_current`.

Candidate groups are role-neutral and must be frozen before query authoring.
Semantic eligibility and stratum assignments must then be frozen before
queries or evidence roles are authored. The final provisional ledger requires
project-owner approval before it can be frozen for execution.

No lineage or required evidence may overlap Validation, any fresh test, or
R2.11, R2.12, R2.14, or R2.16. Chunks used by the R2.12, R2.14, and R2.16
predeclared candidate groups are also excluded. No source document may supply
more than one quarter of any stratum.

The four R2.19 source-expansion documents are Development-only supporting
sources. Systematic reviews, background documents, and evidence profiles must
be labelled by their actual role and must not be represented as independent
WHO recommendations.

## Execution boundary

The annotation ledger, role-neutral runtime queries, role-neutral candidate
corpus, sealed judgments, source/model manifests, runner, parameters,
execution guard, and checksums must be frozen before the one permitted
confirmation execution. R2.10 fresh test is checksum-verification-only.
R2.16 and R2.19 must not be rerun.

### Pre-execution syntax correction

The first runner invocation stopped during JavaScript parsing because two
object keys containing decimal points were not quoted. It occurred before
model loading and produced zero embeddings, candidate pools, judgment reads,
or retrieval executions; the execution guard remained at count 0. The failed
attempt is checksum-frozen as an initialization record. The keys were quoted
before the confirmation package was refrozen and before the one permitted
retrieval execution.

## Preregistered gates

Every hard constraint must hold:

- required candidate micro Recall@20 is at least `0.90`;
- current-only and hard-negative Recall@3 are noninferior to the frozen
  BM25-seed-12 plus baseline-Top-3 control;
- unsafe Top-3 rate does not increase;
- each ordered Top-20 pool contains 20 unique items;
- all embedding, checksum, judgment-read, and execution-integrity checks pass.

Only after all hard constraints pass are strict improvement checks evaluated:

- conditional-merge Recall@3 improves;
- compatible-history Recall@3 improves;
- combined implicit both-evidence coverage improves.

There is no weighted fallback. Failure of any hard or strict-improvement check
is an automatic gate failure. Passing is Development-only and may authorize
only a separately preregistered Validation; it cannot authorize a fresh test
or promotion.
