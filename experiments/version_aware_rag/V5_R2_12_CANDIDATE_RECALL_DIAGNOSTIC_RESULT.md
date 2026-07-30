# V5 R2.12 Candidate-Recall Diagnostic Result

Date: 2026-07-26  
Status: diagnostic repair selected; new confirmation set required

## Scope

R2.12A used the outcome-exposed R2.11 Development data only for failure
diagnosis. It did not rerun R2.11 retrieval, access Validation or fresh-test
outcomes, or produce promotion evidence. All four variants were frozen before
the diagnostic execution, and all 224 ordered candidate pools were completed
before the sealed R2.11 judgments were read once.

## Result

| Candidate generator | Required Recall@20 | Missing required items | All-required query rate |
|---|---:|---:|---:|
| Whole-query BM25 | 0.8864 (78/88) | 10 | 0.8214 |
| Clause RRF | 0.8636 (76/88) | 12 | 0.7857 |
| BM25 group expansion, seed 14 | **0.9659 (85/88)** | **3** | **0.9464** |
| Clause RRF plus group expansion | 0.9432 (83/88) | 5 | 0.9107 |

The selected diagnostic repair is `bm25_group_expand_seed14`. It retains the
first 14 whole-query BM25 candidates, adds candidates connected through
predeclared role-neutral version-group edges in original BM25 rank order, and
then fills the pool to 20.

The selected pool's mean deprecated/forbidden candidate count increased from
`0.1429` to `0.1786`. This is only a candidate-pool diagnostic; it does not
measure Top-3 safety. The new confirmation run must therefore retain the
preregistered unsafe Top-3 non-increase gate.

## Remaining failures

Three required items remain outside Top-20:

- one conditional-merge sodium environmental-change passage;
- one compatible-history sodium clinical-exceptions passage;
- one hard-negative lower-sodium-salt-substitute outcome-gap passage.

The first two lacked a connected group seed within the frozen first 14 BM25
items. The hard-negative item is a single-current-evidence failure and cannot
be repaired through paired-neighbor expansion.

## Decision

The repair is suitable for a new Development confirmation test, but the
observed `0.9659` is not confirmatory. At least 32 new lineage-disjoint,
required-evidence-disjoint annotations must be constructed, project-owner
approved, physically separated, and frozen before one confirmation execution.
