# V5 R2.9 Retrieval-Specific Validation Result

Date: 2026-07-23

## Decision

The frozen R2.8 Version-Aware policy passed one-shot retrieval Validation on 12
new cross-version lineages. The targeted hypothesis is confirmed:

> For explicit historical questions requiring both retained and current
> evidence, Version-Aware lineage pairing improves Top-3 evidence coverage over
> Recency without worsening current-only retrieval safety.

This is not a claim of overall Version-Aware superiority.

## Validation metrics

| Endpoint at Top-3 | Recency λ=0.75 | Version-Aware | Difference |
|---|---:|---:|---:|
| `PAIR_PRESERVE` required micro recall | 0.3333 | 0.7500 | +0.4167 |
| `PAIR_PRESERVE` both-evidence coverage | 0.0000 | 0.6667 | +0.6667 |
| `BLOCK_RETAINED` required micro recall | 0.8333 | 0.8333 | 0.0000 |
| `BLOCK_RETAINED` deprecated-OLD hit rate | 0.0000 | 0.0000 | 0.0000 |
| Required candidate micro recall at Top-20 | 1.0000 | 1.0000 | 0.0000 |

All six preregistered gates passed.

For context, the preceding Development result was:

| Endpoint at Top-3 | Recency λ=0.75 | Version-Aware |
|---|---:|---:|
| `PAIR_PRESERVE` required micro recall | 0.3750 | 0.9375 |
| `PAIR_PRESERVE` both-evidence coverage | 0.0000 | 0.8750 |
| `BLOCK_RETAINED` required micro recall | 0.7500 | 0.7500 |
| `BLOCK_RETAINED` deprecated-OLD hit rate | 0.0000 | 0.0000 |

The direction therefore replicated on newly constructed lineages.

## Protocol integrity

- Validation contained 6 `PAIR_PRESERVE` and 6 `BLOCK_RETAINED` lineages.
- All 12 current chunks were absent from prior R2 datasets.
- Query, evidence, action label, and audit decision were frozen before ranking.
- Retrieval inputs contained no required IDs, deprecated IDs, or action labels.
- All 24 system retrieval calls completed before sealed judgments were read.
- Recency and Version-Aware used byte-identical ordered BM25 Top-20 pools.
- The R2.8 values `Top-20`, `Top-3`, `lambda=0.75`, and pair boost `0.75`
  were unchanged.
- Validation executed once and is locked against retuning.
- No Gemini, Gemma, embedding, cross-encoder, or other external model API ran.
- No fresh V5 test was created or opened.

## Independent audit

The independent audit reconstructed every endpoint and every candidate-pool
hash from the raw JSONL. Reported metrics matched exactly.

Two historical queries remained incomplete. In each case, BM25 selected a
competing but semantically adjacent lineage as the top seed; the frozen pair
rule then boosted the wrong pair. These failures were retained without tuning.
They show that seed-to-lineage disambiguation remains the primary technical
limitation.

## Evidence strength and limitations

R2.9 is materially stronger than the earlier exploratory results because:

1. the advantage endpoints were preregistered;
2. candidate pools were shared;
3. Recency used the frozen lambda;
4. labels were sealed before ranking;
5. Development and Validation used distinct current evidence chunks;
6. the Validation direction replicated Development;
7. current-only safety did not regress.

However:

- queries intentionally contain explicit historical cues;
- all records were authored and audited by Codex rather than independent
  blinded reviewers;
- the corpus is a controlled atomic-claim retrieval set;
- this is not a fresh held-out test;
- implicit conditional-merge and answer-level quality remain unverified.

The defensible claim is targeted historical-intent superiority. An overall
superiority claim still requires a frozen fresh held-out test with a broader,
independently reviewed query distribution.

## Artifacts

- Protocol: `R2_9_RETRIEVAL_VALIDATION_PROTOCOL.md`
- Validation builder: `scripts/v5/build_r2_9_retrieval_validation.ts`
- Frozen package: `data/configs/v5_r2_9_retrieval_validation/`
- Pre-retrieval audit:
  `data/annotations_v5/r2_9_retrieval_validation/pre_retrieval_audit_ledger.jsonl`
- One-shot runner: `scripts/v5/run_r2_9_retrieval_validation.ts`
- Raw retrieval:
  `results/v5/r2_9_retrieval_validation/raw_retrieval_results.jsonl`
- Validation result:
  `results/v5/r2_9_retrieval_validation/VALIDATION_RESULT.json`
- Independent audit:
  `results/v5/r2_9_retrieval_validation/INDEPENDENT_AUDIT.json`
- Protocol test: `tests/unit/v5_r2_9_protocol.test.ts`

