# R2.18 Candidate Failure-Attribution Protocol

Date preregistered: 2026-07-28  
Scope: outcome-exposed R2.16 Development data only  
Status: diagnostic not yet executed

R2.17 showed that changing the BM25 seed count alone cannot reach the required
candidate Recall@20 threshold. A read-only miss audit at seed 12 found eight
missing required items: two had their declared group partner in the pool,
while six belonged to groups with no member in the pool.

R2.18 separates group-closure failure from lexical ranking failure. It freezes
four deterministic Top-20 variants:

1. `bm25_seed12_control` — the R2.17 seed-12 pool.
2. `bm25_seed12_iterative_closure` — repeatedly add declared group partners
   from every selected item before filling remaining positions.
3. `clause_rrf_seed12_iterative_closure` — rank by reciprocal-rank fusion of
   the complete query and clauses, then apply iterative closure.
4. `hybrid_rank_fusion_seed12_iterative_closure` — reciprocal-rank fuse the
   whole-query BM25 and clause-RRF rankings, then apply iterative closure.

BM25 uses `k1=1.2`, `b=0.75`; RRF uses `k=60`; pool size is 20. All pools must
be produced before one read of sealed judgments.

A variant is eligible only if required micro Recall@20 is at least `0.90`,
every stratum is noninferior to the seed-12 control, and ordered-pool integrity
is 100%. Selection is highest micro recall, then highest minimum-stratum
recall, then the declared variant order.

This diagnostic cannot alter R2.16 annotations or authorize Validation,
fresh-test execution, promotion, or an R2.16 rerun. A selected mechanism
requires new official-source capacity and a new lineage-disjoint confirmation.
