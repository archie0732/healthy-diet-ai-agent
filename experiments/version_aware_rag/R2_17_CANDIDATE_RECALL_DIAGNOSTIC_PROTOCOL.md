# R2.17 Candidate-Recall Diagnostic Protocol

Date preregistered: 2026-07-28  
Scope: outcome-exposed R2.16 Development data only  
Status: diagnostic not yet executed

## Motivation

R2.16 confirmed the Top-6-anchored reranker pattern at Top-3: conditional and
compatible Recall@3 and combined both-evidence coverage all strictly improved,
with no control or unsafe regression. The gate failed because the shared
candidate pool recovered only 42 of 52 required items at Top-20 (`0.8077`).

R2.17 therefore diagnoses candidate generation only. It cannot reinterpret
R2.16 or provide promotion evidence.

## Frozen variants

Using the outcome-exposed R2.16 queries, corpus, and candidate-group edges,
compare deterministic group-expanded Top-20 generators with BM25 seed counts
`8`, `10`, `12`, and the frozen control `14`. BM25 parameters remain
`k1=1.2`, `b=0.75`; pool size remains 20. No Top-3 reranking decision will be
used to select the generator.

Selection requires:

- required candidate micro Recall@20 at least `0.90`;
- no stratum has lower candidate Recall@20 than the seed-14 control;
- deterministic ordered-pool hashes and zero judgment access until all
  candidate pools are complete.

Among eligible variants, select highest micro Recall@20, then highest minimum
stratum Recall@20, then the larger seed count. If none is eligible, report no
repair.

## Claim boundary

This is an outcome-exposed Development diagnostic. A selected generator must
be confirmed together with the fixed `pair_score_g2.0_top6_anchor` reranker on
a new lineage-disjoint, project-owner-approved Development set. R2.16 must not
be rerun. Validation, fresh-test execution, and promotion remain prohibited.
