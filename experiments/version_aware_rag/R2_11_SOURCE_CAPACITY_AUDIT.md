# R2.11 Source Capacity Audit

Date: 2026-07-26  
Decision: all 56 lineages are owner-approved and frozen; the one allowed
Development retrieval run completed but did not pass the promotion gate

## Inventory

The inherited local official-source inventory contains the eight WHO documents in
`data/corpus_v4_devval_draft/source_manifest.json` (1,392 chunks) plus the 2003
WHO/FAO TRS 916 evidence PDF in `data/sources_v5/who_fao/MANIFEST.json`.
All local source checksums match their manifests.

R2.11 added the WHO 2010 and 2020 physical-activity guidelines, the WHO 2023
complementary-feeding guideline, and the inherited official WHO/FAO TRS 916
evidence part to its deterministic Development corpus. They produce 744 chunks in
`data/corpus_v5_r2_11_draft/chunks.jsonl`. PDF headers, page counts, text
extraction, checksums, and representative recommendation pages were verified.
The PAHO 2003 command-line downloads returned HTML and were rejected.

The earlier V4 approved dev/validation ledger contains:

| Split | Conditional merge | Compatible history |
|---|---:|---:|
| Development | 8 | 8 |
| Sealed Validation | 4 | 4 |

The eight Validation records are exclusions. The 40 V4 fresh-test lineages and
16 R2.10 fresh-test lineages are also exclusions, regardless of whether their
source documents remain locally available.

## Capacity against the R2.11 minimum

Prior Development examples demonstrate that the source collection can express
both target relations, but they do not constitute a new lineage-disjoint
R2.11 dataset. Atomic semantic review of the physical-activity candidates
produced five validator-clean annotations: four `conditional_merge` and one
`compatible_history`. The project owner approved all five on 2026-07-24.
The remaining construction pass produced 51 further validator-clean,
held-out-evidence-disjoint annotations. On 2026-07-26 the project owner
approved all 51 with the checksum-bound statement `核准全部 51 筆`. The
combined ledger passed the frozen-ledger validator with all prior Validation
and fresh-test lineage exclusions:

| Stratum | Required | Owner-approved | Frozen |
|---|---:|---:|---:|
| `conditional_merge` | 16 | 16 | 16 |
| `compatible_history` | 16 | 16 | 16 |
| `current_only` | 12 | 12 | 12 |
| `hard_negative_current` | 12 | 12 | 12 |
| **Total** | **56** | **56** | **56** |

This conservative count prevents prior test material or sealed Validation
material from being relabeled as new Development evidence.

The frozen ledger SHA-256 is
`7e4e7696d268a833befbf4bb3732f837a7ce9ed7fbcc1c7d15bb056f981cd537`.
The retrieval execution count is locked at one. The selected implicit-merge
system improved the target Top-3 endpoints, but shared Top-20 required
candidate micro Recall was `0.8864`, below the preregistered `0.90` threshold.
R2.11 therefore remains Development-only and is not promoted.

## Topic and lineage acquisition plan

The existing documents support candidate mining in these topic families:

- sodium target, clinical exclusions, and lower-sodium salt substitutes;
- potassium target, impaired excretion, and LSSS safety;
- free-sugar thresholds, dental outcomes, and non-sugar sweeteners;
- carbohydrate quality, fibre, age/population scope, and health outcomes;
- total-fat range, minimum intake, unhealthy weight gain, and replacement;
- saturated/trans-fat thresholds, replacement nutrients, and lipid outcomes;
- 2003 population nutrient goals retained, narrowed, or displaced by the
  2012/2015/2023/2025 guidelines.

To reduce source-family pseudo-replication, no topic family should supply more
than one quarter of a stratum. Each new lineage needs a distinct required
evidence signature and a role-neutral candidate set.

Before annotation begins, add official documents for underrepresented control
topics. The first two candidate predecessor/current pairs are:

- WHO 2010 *Global recommendations on physical activity for health*
  (`https://www.who.int/publications/i/item/9789241599979`) and WHO 2020
  *Guidelines on physical activity and sedentary behaviour*
  (`https://www.who.int/publications/b/55518`);
- WHO/PAHO 2003 *Guiding principles for complementary feeding of the
  breastfed child* (`https://www.who.int/publications/i/item/9275124604`) and
  WHO 2023 *Guideline for complementary feeding of infants and young children
  6–23 months of age*
  (`https://www.who.int/publications/i/item/9789240081864`).

The physical-activity pair is now locally available for Development annotation.
The 2023 record explicitly states that it supersedes the earlier complementary
feeding principles, but the PAHO 2003 PDF is not locally available through the
command-line environment. Complementary-feeding cross-version annotation
therefore remains blocked; current-only control mining from the 2023 document
is allowed at the draft stage.

## Catalog decision

`SOURCE_CATALOG.md` is itself covered by the immutable R2.10 checksum manifest.
Editing it would invalidate the archived cycle. R2.11 additions must therefore
be recorded in `SOURCE_CATALOG_R2_11_SUPPLEMENT.md`; a later catalog release
may merge the supplement while preserving the original R2.10 catalog snapshot.
