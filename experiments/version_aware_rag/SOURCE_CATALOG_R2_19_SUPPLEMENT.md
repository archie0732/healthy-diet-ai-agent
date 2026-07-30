# Version-Aware RAG Source Catalog - R2.19 Supplement

Created: 2026-07-28  
Status: Development-only source-capacity expansion

The canonical `SOURCE_CATALOG.md` remains immutable because it is covered by
the R2.10 checksum archive. This supplement records only new R2.19 draft
sources. None of these documents is Validation, fresh-test, or promotion
evidence.

## New official-source registry

| Document ID | Publication | Official record | Official PDF | Pages | Intended gap |
|---|---|---|---|---:|---|
| `who-potassium-adverse-effects-review-2012` | *Effect of increased potassium intake on blood pressure, renal function, blood lipids and other potential adverse effects* | `https://www.who.int/publications/i/item/9789241504881` | `https://iris.who.int/server/api/core/bitstreams/e8f65240-5330-4b79-a390-46226bb4e37e/content` | 122 | potassium metabolism, renal function, adverse-effect evidence |
| `who-potassium-drinking-water-background-2009` | *Potassium in drinking-water: background document for development of WHO Guidelines for Drinking-water Quality* | `https://www.who.int/teams/environment-climate-change-and-health/water-sanitation-and-health/chemical-hazards-in-drinking-water` | `https://cdn.who.int/media/docs/default-source/wash-documents/wash-chemicals/potassium-background.pdf?sfvrsn=4542eda3_4` | 12 | hyperkalaemia, impaired excretion, high-risk groups and interacting medicines |
| `who-nss-systematic-review-2022` | *Health effects of the use of non-sugar sweeteners: a systematic review and meta-analysis* | `https://www.who.int/publications/i/item/9789240046429` | `https://iris.who.int/server/api/core/bitstreams/cc660df6-e1b1-4a31-b918-42e8c7fe5701/content` | 210 | short-term randomized evidence versus long-term observational evidence |
| `who-physical-activity-web-annex-2020` | *WHO guidelines on physical activity and sedentary behaviour: Web Annex. Evidence profiles* | `https://iris.who.int/handle/10665/336657` | `https://iris.who.int/server/api/core/bitstreams/2e41f4b8-b47f-4e46-824a-a0b5b3b7000e/content` | 535 | population-specific evidence for chronic conditions, disability and pregnancy |

## Integrity checks

All four local files have a `%PDF-` header, are unencrypted, and permit text
extraction. Poppler and pypdf independently reproduced page counts. The
following representative PDF pages were rendered and visually inspected:

- potassium adverse-effects review: PDF page 10;
- potassium drinking-water background: PDF page 10;
- non-sugar-sweetener systematic review: PDF page 56;
- physical-activity web annex: PDF page 468.

Exact file sizes and SHA-256 values are generated in
`data/corpus_v5_r2_19_draft/source_manifest.json`. Draft chunks remain
unreviewed and cannot become required evidence until semantic review,
lineage/evidence-signature exclusion, and project-owner approval.

## Source-use boundary

Supporting reviews and evidence profiles must not be presented as independent
guidelines. An annotation may pair a review with a guideline only when the
relation is explicitly labelled as supporting or complementary evidence.
No single source document may supply more than one quarter of any future
confirmation stratum.
