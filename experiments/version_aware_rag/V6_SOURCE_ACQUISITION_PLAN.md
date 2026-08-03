# V6 source acquisition plan

Status: active after the Phase 1 capacity gate failed  
Last updated: 2026-08-01

## Purpose

Acquire enough official, auditable, version-related source material to construct a genuinely fresh confirmatory set. Downloaded documents are only mining inputs; they do not automatically qualify as test evidence.

## Tier A: official update or supersession families

| Family | Older/base source | Newer/update source | Current status | Intended use |
|---|---|---|---|---|
| Wasting and nutritional oedema | WHO 2013 severe acute malnutrition | WHO 2023 wasting and nutritional oedema | Both PDFs acquired and validated | Explicit-history, conditional-merge, current-only, and hard-negative candidates, subject to claim-level review |
| Antenatal nutrition | WHO 2016 antenatal care | WHO 2020 MMS, 2020 vitamin D, and 2021 zinc updates | Four PDFs acquired and validated | Multiple update relations within one guideline family; relation semantics must be assigned per recommendation, not by year alone |
| HIV and infant feeding | WHO 2010 guideline | WHO 2016 update | 2016 acquired; valid official 2010 PDF endpoint pending | Version-pair candidates after both sources are available |
| Complementary feeding | 2003 breastfed and 2005 non-breastfed guiding principles | WHO 2023 complementary feeding guideline | Legacy PDFs pending; 2023 source exists in prior development corpus | May yield unused claim-level relations, but no previously used claim, span, or query may enter the confirmatory test |
| School food environment | No predecessor asserted | WHO 2026 guideline | PDF acquired and validated | Current-only and hard-negative controls only; not a version pair unless documentary evidence establishes one |

The document hashes and parser checks are recorded in `data/sources_v6/tier_a/MANIFEST.json`.

## Tier B: feasibility candidates

- WHO nutrition care and support for patients with tuberculosis (2013) versus later consolidated tuberculosis care guidance (2025). Treat only as a semantic-feasibility lead; do not label it as a supersession without explicit documentary or recommendation-level evidence.
- Additional WHO/PAHO guideline families may be added only if they contain an auditable relation such as `supersedes`, `updates`, `narrows_scope`, `expands_scope`, or `compatible_with`.

## Admission workflow

1. Validate file magic, parser readability, page count, byte size, SHA-256, publisher, and publication page.
2. Extract candidate recommendation spans with stable document/page identifiers.
3. Assign a proposed relation and write a short evidence-based rationale.
4. Reject any query, claim, evidence span, lineage, or near-duplicate represented in the V6 exclusion ledger.
5. Run three isolated AI reviews under the frozen rubric; accept only unanimous cases. The Gemini review is a mandatory user-operated Antigravity handoff: Codex prepares the sealed batch, pauses, and asks the user to run it; Codex never invokes or substitutes for Gemini.
6. Count eligible lineages and strata again. Do not generate the fresh test queries until the source-capacity gate passes.

## Gate to proceed

- At least 60 eligible and unused reviewed lineages.
- At least 20 eligible questions in each of the four main strata after caps and exclusions.
- No more than two questions per lineage and no topic family above 25% of the final test.
- Ambiguous relation semantics, invalid downloads, and previously exposed material are rejected rather than repaired inside the sealed test.

## Time estimate from this point

| Work | Estimated elapsed working time |
|---|---:|
| Resolve pending official endpoints and mine Tier A | 1–2 days |
| Triple-AI relation review and deduplication | 1–2 days |
| Capacity re-audit and, if required, Tier B expansion | 1–3 days |
| Generate, adjudicate, freeze, and run 80–100 questions | 3–5 days |
| Statistical analysis, robustness tests, and manuscript revision | 2–4 days |

Expected total: approximately 8–16 focused working days. This is a planning estimate, not a guarantee; source yield is the largest uncertainty.
