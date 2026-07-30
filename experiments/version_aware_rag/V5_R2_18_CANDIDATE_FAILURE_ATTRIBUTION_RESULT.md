# V5 R2.18 Candidate Failure-Attribution Result

Date executed: 2026-07-28  
Scope: outcome-exposed R2.16 Development data only  
Decision: no eligible lexical or group-closure repair

| Variant | Required Recall@20 | Conditional | Compatible | Current-only | Hard negative |
|---|---:|---:|---:|---:|---:|
| BM25 seed-12 control | 0.8462 | 0.8000 | 0.9000 | 0.6667 | 1.0000 |
| Iterative group closure | 0.8462 | 0.7500 | 0.9500 | 0.6667 | 1.0000 |
| Clause RRF + closure | 0.8269 | 0.7500 | 0.9000 | 0.6667 | 1.0000 |
| Hybrid rank fusion + closure | 0.8269 | 0.7500 | 0.9000 | 0.6667 | 1.0000 |

No variant reached the preregistered `0.90` minimum. Iterative group closure
recovered one compatible-history required item but displaced one
conditional-merge required item, leaving micro recall unchanged. Clause and
hybrid lexical fusion each lost one additional required item. All variants
left current-only recall unchanged at `0.6667`.

The failure is therefore not repairable by seed-count changes, fixed-size
group closure, clause BM25, or their lexical rank fusion on the exhausted
R2.16 corpus. No new confirmation is authorized from this diagnostic.

Before another confirmation, the next development stage must add
lineage-disjoint official-source capacity and evaluate semantic or dense
retrieval against a frozen candidate-recall protocol. R2.16 remains
failed-and-locked at execution count 1. This diagnostic provides no Validation,
fresh-test, or promotion evidence.
