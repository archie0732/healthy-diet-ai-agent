# V5 R2.19 Neural-Hybrid Candidate Diagnostic Result

Date executed: 2026-07-28  
Scope: outcome-exposed R2.16 Development data plus frozen source expansion  
Decision: select BM25-MiniLM reciprocal-rank fusion for a new confirmation

| Variant | Required Recall@20 | Conditional | Compatible | Current-only | Hard negative |
|---|---:|---:|---:|---:|---:|
| BM25 seed-12 control | 0.8462 | 0.8000 | 0.9000 | 0.6667 | 1.0000 |
| MiniLM q8 dense | 0.9423 | 0.9500 | 0.9000 | 1.0000 | 1.0000 |
| BM25 + MiniLM RRF | **0.9615** | **1.0000** | 0.9000 | **1.0000** | 1.0000 |
| BM25 + MiniLM RRF + closure | 0.9423 | 0.9000 | **1.0000** | 0.8333 | 1.0000 |

All three neural variants met the preregistered `0.90` gate and were
noninferior to control in every stratum. The declared selection rule chose
`bm25_minilm_rrf_k60_top20`, which recovered 50 of 52 required items. Adding
fixed-size group closure reduced recall, confirming the R2.18 displacement
finding.

The diagnostic used a checksum-bound q8
`Xenova/all-MiniLM-L6-v2` model at revision
`751bff37182d3f1213fa05d7196b954e230abad9`. All 140 document and 32 query
embeddings were finite, 384-dimensional, and L2-normalized. Remote model
loading was disabled during the diagnostic.

One initialization attempt failed before model loading because of contradictory
offline flags. It created zero embeddings and candidate pools, read zero
judgments, and left the execution guard at count 0. The corrected, frozen
runner then completed the single diagnostic execution and read judgments once.

The source-capacity stage added four verified official PDFs and 1,694
unreviewed Development chunks. They were not added to the exposed R2.16
diagnostic corpus. A new 32-record, lineage-disjoint, owner-approved
confirmation is required before any Validation or promotion claim.
