# V5 R2.10 Fresh Held-Out Retrieval Result

## Decision

The checksum-bound, one-shot fresh retrieval test passed its preregistered
scope-limited gate. The supported claim is:

> On this owner-reviewed fresh atomic-claim test, the frozen Version-Aware
> policy improved retrieval for explicit historical-intent questions over the
> frozen Recency baseline, without reducing the preregistered control-stratum
> endpoints or increasing deprecated-OLD hits.

This is not evidence of overall superiority across query types, implicit
conditional-merge superiority, or answer-level superiority.

## Frozen execution

- Review packet content SHA-256:
  `b3923d62ba18fed6ed70b21cfe80819885768c378ce5afa0e1846c54c7d69ca3`
- Frozen policy SHA-256:
  `4491f19fd3de101022c81e1f5cde8669a4a82ed0d172b11e5627f853a4fd5835`
- Fresh-test executions: `1`
- Post-test tuning: prohibited and not performed
- External model APIs: not used
- Retrieval completed before the sealed judgment file was read

## Results

| Endpoint | Recency | Version-Aware |
|---|---:|---:|
| Overall required micro Recall@3 | 0.6250 | 0.8333 |
| Explicit-history required micro Recall@3 | 0.3750 | 1.0000 |
| Explicit-history both-evidence coverage | 0.0000 | 1.0000 |
| Conditional-merge required micro Recall@3 | 0.5000 | 0.5000 |
| Current-only required micro Recall@3 | 1.0000 | 1.0000 |
| Hard-negative-current required micro Recall@3 | 1.0000 | 1.0000 |
| Overall deprecated-OLD hit rate | 0.0000 | 0.0000 |
| Required candidate micro Recall@20 | 1.0000 | 1.0000 |

All eight preregistered gate checks passed. Both systems received the same
ordered Top-20 pool for every query.

## Statistical and review limitations

All four explicit-history queries improved and none regressed, but the
two-sided exact sign-test p-value is `0.125`. The effect is descriptively large
and replicates the earlier Development and Validation direction, but four fresh
queries are insufficient for a conventional `p < 0.05` claim.

The project owner approved the exact packet before execution. The original
evidence selection and first-pass labels were prepared by Codex, so this is not
an independent blinded or clinical review.

The conditional-merge stratum only tied Recency. Consequently, the current
policy has fresh evidence for explicit temporal-history routing, not for the
broader theoretical claim that it can infer implicit compatible-history needs.
