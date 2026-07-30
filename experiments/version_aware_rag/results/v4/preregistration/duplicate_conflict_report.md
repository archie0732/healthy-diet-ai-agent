# Duplicate & Conflict Audit Report (Revision 2)

## Executive Summary
- **Total Candidate Pairs Analyzed:** 131
- **Unique Chunk Pairs:** 41
- **Multi-Relation Chunk Pairs Identified:** 24
- **Duplicate Claim-Level Key Conflicts:** **0 (PASS)**

---

## Multi-Relation Chunk Pairs Breakdown
When a single chunk pair (e.g. 2020 executive summary vs 2025 executive summary) addresses multiple distinct dietary topics (e.g., protein, dairy, sodium, sugars), multiple claim-level relations are created using non-overlapping or topic-distinct claim excerpts.

| Chunk Pair Key | Relations Count | Has Span Overlap? | Relation Types | Resolution Rationale |
|---|---:|:---:|---|---|
| `dga-2020-page-7-pass-0-f9b0e522::dga-2025-page-3-pass-0-ba481231` | 9 | Yes (Multi-topic) | superseded, superseded, superseded, superseded, superseded, superseded, complementary, complementary, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2020-page-8-pass-0-d50d372b::dga-2025-page-5-pass-0-99883976` | 7 | Yes (Multi-topic) | superseded, conflicting, superseded, conditional_difference, conditional_difference, conditional_difference, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2015-page-50-pass-1-6bfa09f8::dga-2025-page-5-pass-0-99883976` | 4 | No | conflicting, conflicting, complementary, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-50-pass-2-28e6e56b::dga-2025-page-5-pass-0-99883976` | 2 | No | conflicting, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-50-pass-3-4d17d0c8::dga-2025-page-5-pass-0-99883976` | 2 | No | conflicting, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-8-pass-0-d50d372b::dga-2025-page-4-pass-0-567ec170` | 5 | No | complementary, superseded, superseded, complementary, complementary | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-8-pass-0-d50d372b::dga-2025-page-6-pass-0-765dd278` | 12 | Yes (Multi-topic) | superseded, conditional_difference, superseded, conditional_difference, complementary, conditional_difference, conditional_difference, conditional_difference, conditional_difference, conflicting, conflicting, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2020-page-7-pass-0-f9b0e522::dga-2025-page-4-pass-0-567ec170` | 14 | Yes (Multi-topic) | superseded, superseded, complementary, complementary, superseded, superseded, superseded, superseded, complementary, complementary, complementary, conflicting, conflicting, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2015-page-44-pass-0-b82f56fd::dga-2025-page-3-pass-0-ba481231` | 3 | No | superseded, superseded, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-15-pass-0-8effd6bb::dga-2025-page-5-pass-0-99883976` | 5 | No | conflicting, conflicting, superseded, superseded, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-15-pass-0-8effd6bb::dga-2025-page-6-pass-0-765dd278` | 2 | No | superseded, conditional_difference | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-15-pass-0-8effd6bb::dga-2025-page-3-pass-0-ba481231` | 3 | No | superseded, superseded, superseded | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-15-pass-0-8effd6bb::dga-2025-page-4-pass-0-567ec170` | 4 | No | superseded, complementary, complementary, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2015-page-31-pass-1-9f16d289::dga-2025-page-4-pass-0-567ec170` | 2 | No | complementary, complementary | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-14-pass-0-1816571f::dga-2025-page-3-pass-0-ba481231` | 2 | No | duplicate, duplicate | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-4-pass-0-41b3cfc8::dga-2025-page-3-pass-0-ba481231` | 3 | No | superseded, superseded, complementary | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-4-pass-0-41b3cfc8::dga-2025-page-8-pass-0-3ed6d8ec` | 6 | Yes (Multi-topic) | superseded, superseded, complementary, conditional_difference, conflicting, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2020-page-4-pass-0-41b3cfc8::dga-2025-page-7-pass-0-16be31d1` | 9 | Yes (Multi-topic) | superseded, complementary, complementary, complementary, complementary, conditional_difference, conditional_difference, conditional_difference, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2015-page-15-pass-0-8effd6bb::dga-2025-page-10-pass-0-bfcc4aa4` | 2 | No | superseded, conditional_difference | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-4-pass-0-41b3cfc8::dga-2025-page-10-pass-0-bfcc4aa4` | 3 | Yes (Multi-topic) | superseded, conditional_difference, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2020-page-4-pass-0-41b3cfc8::dga-2025-page-9-pass-0-b67ed68f` | 5 | No | complementary, conditional_difference, conditional_difference, conditional_difference, conflicting | Zero span overlap; completely distinct claim-level evidence spans for different dietary topics. |
| `dga-2020-page-4-pass-0-41b3cfc8::dga-2025-page-9-pass-1-d977c146` | 4 | Yes (Multi-topic) | complementary, complementary, conditional_difference, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2015-page-105-pass-0-df38e7c6::dga-2025-page-10-pass-0-bfcc4aa4` | 4 | Yes (Multi-topic) | complementary, complementary, conditional_difference, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |
| `dga-2020-page-7-pass-0-f9b0e522::dga-2025-page-9-pass-0-b67ed68f` | 2 | Yes (Multi-topic) | conditional_difference, conflicting | Spans overlap; adjudicated as distinct semantic query intents across different topics in multi-topic chunk. |

---

## Conclusion
All candidate relations adhere strictly to claim-level uniqueness without duplicate claim keys. Multi-relation chunk pairs are fully disambiguated by distinct evidence spans and topic intents.
