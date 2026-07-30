# V4 Final Research Status

## Decision

The **overall Version-Aware superiority hypothesis is rejected** on the fresh test because the preregistered safety gate failed. Oracle lineage expansion improved retained-evidence coverage, but it also introduced deprecated/forbidden passages.

## Retrieval evidence

| Stage / endpoint | Recency | Oracle |
|---|---:|---:|
| Fresh conditional-merge required micro Recall@3 | 0.05 | 0.3 |
| Fresh compatible-history required micro Recall@3 | 0.15 | 0.3 |
| Fresh retained required micro Recall@3 | 0 | 0.2 |
| Current-only deprecated hit rate@3 | 0 | 0.033333 |
| Hard-negative forbidden hit rate@3 | 0 | 0.066667 |

Unsafe/deprecated Oracle queries: v4fresh-008, v4fresh-036, v4fresh-040.

## Predicted graph

Post-test diagnostic only: accuracy 0.3, macro-F1 0.196486. The frozen runner ignores relation type, so a distinct Predicted retrieval comparison is not identifiable.

## Answer evaluation

120 frozen answers and a leakage-checked blinded packet are complete. Automatic citation metrics are diagnostic proxies only. Two independent human evaluators and adjudication remain incomplete, so publication-grade answer claims are blocked.

## Allowed conclusion

Version-aware lineage expansion improves historical/retained evidence coverage in the targeted strata, but the current pair-coverage implementation has an unresolved safety tradeoff and is not deployable. Any relation-type-aware repair belongs to V5 and requires a new held-out test.
