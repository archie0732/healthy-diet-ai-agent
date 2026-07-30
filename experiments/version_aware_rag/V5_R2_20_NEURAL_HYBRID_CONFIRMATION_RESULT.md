# V5 R2.20 Neural-Hybrid Confirmation Result

Date executed: 2026-07-28  
Scope: new lineage-disjoint, project-owner-approved Development confirmation  
Decision: gate failed; no Validation or promotion

| Variant | Required Recall@20 | Conditional R@3 | Compatible R@3 | Current-only R@3 | Hard-negative R@3 |
|---|---:|---:|---:|---:|---:|
| BM25 seed-12 + baseline Top-3 | 47/52 = 0.9038 | 0.6500 | 0.4000 | **1.0000** | 0.5000 |
| BM25-MiniLM RRF + Top-6 anchor | **51/52 = 0.9808** | **0.7500** | **0.5000** | 0.8333 | **0.6667** |

The neural-hybrid system passed four of five hard constraints and all three
strict-improvement checks. Combined implicit both-evidence coverage improved
from `0.25` to `0.45`, while the overall unsafe Top-3 rate remained unchanged
at `0.03125`.

The automatic gate failed solely because current-only Recall@3 was not
noninferior: it decreased from 6/6 to 5/6. For `r2.20-confirm-21`, the required
potassium-guideline passage ranked first under the baseline but seventh in the
RRF pool and reranked list. Its displacement had no pair-signal contribution;
the failure is therefore attributable to the fused candidate ordering rather
than the Top-6 pair boost.

One initial invocation stopped during JavaScript parsing before model loading.
It produced zero embeddings, pools, judgment reads, or retrieval executions
and left the guard at count 0. The failure was recorded and checksum-frozen
before the corrected package consumed the one permitted execution.

The independent audit passed, verified all 22 R2.10 archive checksums without
rerunning the fresh test, and confirmed that R2.16 and R2.19 remained locked.
R2.20 is failed-and-locked at retrieval execution count 1.
