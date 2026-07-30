# V5 R2.8 Shared-Pool Retrieval Result

Date: 2026-07-23

## Outcome

R2.8 provides positive Development evidence that Version-Aware retrieval is
better than Recency in the preregistered explicit-history advantage stratum.
It does not establish overall superiority.

| Endpoint at Top-3 | Recency λ=0.75 | Version-Aware | Difference |
|---|---:|---:|---:|
| `PAIR_PRESERVE` required micro recall | 0.3750 | 0.9375 | +0.5625 |
| `PAIR_PRESERVE` both-evidence coverage | 0.0000 | 0.8750 | +0.8750 |
| `BLOCK_RETAINED` required micro recall | 0.7500 | 0.7500 | 0.0000 |
| `BLOCK_RETAINED` deprecated-OLD hit rate | 0.0000 | 0.0000 | 0.0000 |
| Required candidate micro recall at Top-20 | 1.0000 | 1.0000 | 0.0000 |

All six preregistered promotion checks passed. A new retrieval-specific
Validation set may now be constructed, but no existing Validation or test may
be reopened for tuning.

## Fair comparison

Each of the 16 Development queries received one BM25 Top-20 candidate pool.
Recency and Version-Aware received the same ordered IDs, BM25 scores, and pool
hash. Pool identity was 100%.

Retrieval inputs were physically separated from sealed judgments. All 32
retrieval calls completed before the judgment file was read once for metric
calculation. Runtime retrieval did not use action labels, required IDs,
deprecated IDs, reviewer rationale, query ID rules, topics, or model APIs.

## Frozen systems

Recency used the restored `lambda = 0.75` contract:

```text
base_norm + 0.75 * recency_norm
recency_norm = (year - 2015) / (2026 - 2015)
```

For explicit historical intent, Version-Aware disabled the Recency component,
selected the highest-BM25 in-pool seed, and applied a fixed 0.75 boost to that
seed and its declared lineage mate:

```text
base_norm + 0.75 * is_seed_or_lineage_mate
```

Current-only queries used the identical Recency score in both systems.

## Independent recomputation

`INDEPENDENT_AUDIT.json` independently reconstructed required recall,
both-evidence coverage, deprecated-OLD hit rate, candidate recall, and shared
pool hashes from `raw_retrieval_results.jsonl`. Every value matched the report.

## Known failure

One Version-Aware query did not achieve full pair coverage:

`r2.7-24-free-sugar-versus-nss-definition`

BM25 selected a semantically adjacent free-sugar-definition lineage as the
seed. The frozen pair rule consequently boosted that incorrect lineage pair,
while retrieving only the CURRENT item from the required lineage. This result
was retained without tuning. It identifies seed-to-lineage disambiguation as
the next Development problem.

## Claim boundary

Supported:

> On this 16-query Development set with explicit historical intent and a shared
> BM25 Top-20 pool, the fixed Version-Aware pair policy substantially improves
> required historical/current coverage over Recency without degrading the
> current-only safety endpoints.

Not supported:

- overall Version-Aware retrieval superiority;
- implicit semantic conditional-merge superiority;
- generalization beyond explicit historical queries;
- fresh held-out V5 test performance;
- answer-level quality.

## Artifacts

- Protocol: `R2_8_SHARED_POOL_RETRIEVAL_PROTOCOL.md`
- Input preparation:
  `scripts/v5/prepare_r2_8_shared_pool_development.ts`
- Frozen input/judgment split:
  `data/configs/v5_r2_8_shared_pool_development/`
- Retrieval runner:
  `scripts/v5/run_r2_8_shared_pool_development.ts`
- Raw retrieval:
  `results/v5/r2_8_shared_pool_development/raw_retrieval_results.jsonl`
- Development result:
  `results/v5/r2_8_shared_pool_development/DEVELOPMENT_RESULT.json`
- Independent audit:
  `results/v5/r2_8_shared_pool_development/INDEPENDENT_AUDIT.json`
- Protocol tests:
  `tests/unit/v5_r2_8_protocol.test.ts`

