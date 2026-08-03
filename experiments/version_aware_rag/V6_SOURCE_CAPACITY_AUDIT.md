# V6 Source Capacity Audit

Date: 2026-08-01  
Decision: **FAIL**

## Outcome

The current repository does not yet prove capacity for a new 80–96 query confirmatory test. The audit found 34 structurally non-overlapping candidate lineages across the inspected candidate inventories, but only 34 non-overlapping candidate records have semantic-review status and only 12 were predesignated as fresh-test eligible. Existing inventory also does not provide at least 20 candidates for every required V6 stratum.

This is a conservative planning result, not a claim that every unused source page is unusable. New official sources and new source-grounded lineage mining are required before Phase 2 can pass.

## Exclusion basis

- Excluded query-bearing records: 398
- Used lineage identifiers: 342
- Used/exposed chunk identifiers: 860
- Used atomic-claim hashes: 488
- Used source-page keys: 232

## Existing candidate inventories

| Inventory | Records | No overlap | Reviewed + no overlap | Predesignated fresh eligible + no overlap |
|---|---:|---:|---:|---:|
| v4_candidate_relation_pairs | 131 | 12 | 12 | 12 |
| v5_relation_detector_review | 40 | 12 | 0 | 0 |
| v5_codex_mined_reviewed_pairs | 22 | 22 | 22 | 0 |

## Explicit stratum capacity in existing inventories

Only candidates with an explicit pre-existing stratum label and no exclusion overlap are counted here. Unallocated relation pairs are not guessed into a stratum.

| Required stratum | Existing explicit capacity | Minimum |
|---|---:|---:|
| explicit_history | 0 | 20 |
| conditional_merge | 4 | 20 |
| current_only | 1 | 20 |
| hard_negative_current | 0 | 20 |

## Existing corpora

| Manifest | Documents | Chunks | Development only | Held-out eligible |
|---|---:|---:|---|---|
| `data/corpus_v4_devval_draft/source_manifest.json` | 8 | 1392 | no | no |
| `data/corpus_v5_r2_11_draft/source_manifest.json` | 4 | 744 | yes | no |
| `data/corpus_v5_r2_19_draft/source_manifest.json` | 4 | 1694 | yes | no |

Existing corpora may remain in the retrieval corpus as distractors after a new V6 corpus manifest is frozen, but previously used query lineages, required evidence signatures, chunks, claims, and source-page keys remain excluded from new confirmatory gold records.

## Gate decision

FAIL_PHASE_2_ENTRY: existing inventories do not establish at least 60 unused, semantically reviewed, held-out-eligible lineages with at least 20 candidates in each required stratum.

Required next work:

1. Add official predecessor/current guideline pairs from underrepresented topic families.
2. Mine new atomic relations while hiding router rules and all retrieval outcomes.
3. Apply the three-pass AI source review defined in the V6 plan.
4. Re-run capacity audit until there are at least 60 unique lineages and at least 20 candidates in each stratum.
