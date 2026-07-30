# R2.21 Lexical-Weighted RRF Diagnostic Protocol

Date preregistered: 2026-07-28  
Scope: outcome-exposed R2.20 Development data only  
Status: written before R2.21 retrieval

R2.20 failed only because one current-only required passage moved from rank 1
under BM25 to rank 7 under equal-weight BM25-MiniLM RRF. Pair signal was zero
for the displaced passage, so R2.21 changes only the label-independent fusion
weight and keeps the q8 MiniLM model, RRF `k=60`, Top-20 size, recency `0.2`,
pair weight `2.0`, and Top-6 anchor fixed.

The frozen variants are:

1. `rrf_lex1_dense1_control`;
2. `rrf_lex2_dense1`;
3. `rrf_lex3_dense1`.

All embeddings, ordered pools, and Top-3 outputs must be completed before the
sealed R2.20 judgments are read once. The equal-weight control must reproduce
the frozen R2.20 repaired outputs exactly.

A variant is eligible only if it passes every R2.20 hard constraint against
the frozen R2.20 BM25 baseline and all three strict-improvement checks. Among
eligible variants, selection order is current-only Recall@3, candidate
Recall@20, combined implicit both-evidence coverage, minimum implicit
Recall@3, then declared order.

This is an outcome-exposed diagnostic, not confirmation evidence. A selected
repair requires a new lineage-disjoint, owner-approved Development
confirmation. R2.10, R2.16, R2.19, and R2.20 must not be rerun. No Validation,
fresh test, or promotion is allowed.
