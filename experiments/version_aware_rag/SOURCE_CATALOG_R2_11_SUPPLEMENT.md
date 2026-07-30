# Version-Aware RAG Source Catalog — R2.11 Supplement

Created: 2026-07-24  
Status: Development-only supplement; four draft sources ingested

The canonical `SOURCE_CATALOG.md` is frozen by
`results/v5/r2_10_fresh_test_cycle/ARTIFACT_CHECKSUMS.sha256` with SHA-256
`37e00f4432a54b94b60f03b9dca4f2cd9f6d1b1503841640ff8740b43032690b`.
This supplement prevents an R2.11 catalog update from altering that archived
artifact.

## Inherited, locally verified sources

R2.11 may mine new Development-only claims from the eight WHO documents in
`data/corpus_v4_devval_draft/source_manifest.json` and the official 2003
WHO/FAO evidence PDF in `data/sources_v5/who_fao/MANIFEST.json`, subject to the
lineage and evidence-signature exclusions in the R2.11 protocol.

No inherited Validation or fresh-test annotation becomes Development data
merely because its source document is inherited.

## New-source registry

The following PDFs passed header, page-count, text-extraction, checksum, and
representative-page visual checks. They remain draft Development sources until
the annotation ledger is reviewed.

| Document ID | Publication | Official record URL | Official PDF URL | Retrieved | Local path | Bytes | Pages | SHA-256 | Status |
|---|---|---|---|---|---|---:|---:|---|---|
| `who-physical-activity-2010` | *Global recommendations on physical activity for health* (2010) | `https://www.who.int/publications/i/item/9789241599979` | `https://iris.who.int/server/api/core/bitstreams/d0972fd5-8f7d-4c87-b092-889e0f5f4618/content` | 2026-07-24 | `data/sources_v5/r2_11/who_physical_activity_2010.pdf` | 1,898,910 | 60 | `fdece2cd3abc6bf23d26c277211ec72b3df49d9070cd33df7a7a1af55ed72c9f` | draft Development source; page 8 visually verified |
| `who-physical-activity-2020` | *WHO guidelines on physical activity and sedentary behaviour* (2020) | `https://www.who.int/publications/i/item/9789240015128` | `https://iris.who.int/server/api/core/bitstreams/faa83413-d89e-4be9-bb01-b24671aef7ca/content` | 2026-07-24 | `data/sources_v5/r2_11/who_physical_activity_2020.pdf` | 4,041,257 | 104 | `50b66c44e7083cc3752849f301ae1d60d9360d511e34c0c948b39bdf6e13dc88` | draft Development source; page 12 visually verified |
| `who-complementary-feeding-2023` | *WHO guideline for complementary feeding of infants and young children 6-23 months of age* (2023) | `https://www.who.int/publications/i/item/9789240081864` | `https://iris.who.int/server/api/core/bitstreams/5abca011-4db2-4cf1-b959-45b756f7b600/content` | 2026-07-24 | `data/sources_v5/r2_11/who_complementary_feeding_2023.pdf` | 3,647,119 | 96 | `a75cc2c922a2f1c0c8ba7b2bc2ab17cb1981ae6ae9e98da80f81fb1a37c289bf` | draft Development source; pages 13-14 visually verified |
| `who-fao-trs-916-2003-part2` | *Diet, nutrition and the prevention of chronic diseases: population nutrient goals and later chapters* (2003) | `https://www.fao.org/4/AC911E/AC911E00.htm` | `https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf` | 2026-07-22 | `data/sources_v5/who_fao/WHO_FAO_TRS_916_2003_part2.pdf` | 405,106 | 93 | `f7d8b51b455f4853354b1b86339797da689426f440bc3fa62304eaa4b3d29429` | inherited official evidence source added to the deterministic R2.11 corpus; pages 3 and 36 visually verified |

The derived draft corpus is
`data/corpus_v5_r2_11_draft/chunks.jsonl`: 744 chunks, SHA-256
`d30e3e44b06db37c94481cdd5d2da0546005e41303574a3a25f48da9511e3823`.
Its complete provenance is in
`data/corpus_v5_r2_11_draft/source_manifest.json`.

## Candidate acquisition backlog

These official records were discovered for the documented capacity gaps.

| Candidate pair | Earlier official record | Current official record | Intended use | Status |
|---|---|---|---|---|
| Physical activity | `https://www.who.int/publications/i/item/9789241599979` (2010) | `https://www.who.int/publications/i/item/9789240015128` (2020) | age/population controls, updated scope, sedentary-behaviour additions | both PDFs ingested as draft Development sources |
| Complementary feeding | `https://www.who.int/publications/i/item/9275124604` (2003) | `https://www.who.int/publications/i/item/9789240081864` (2023) | retained principles, superseded guidance, infant/child controls | 2023 PDF ingested; 2003 command-line downloads rejected as HTML |

The failed PAHO response is preserved at
`data/sources_v5/r2_11/paho_complementary_feeding_2003.download-error.html`
(425 bytes; SHA-256
`45b795eef2fef393539deca5dedf247da682c07b18b59de67e4cf4147963f363`).
It is not a source or evidence artifact.
