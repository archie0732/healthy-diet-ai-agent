# Version-Aware RAG Source Catalog

This is the canonical traceability record for source documents used by, or
considered for, the Version-Aware RAG experiments. A source must have an
official record URL, local path, retrieval date, and checksum before it can be
used in an experiment.

Last reviewed: 2026-07-23

## A. Frozen V3 corpus sources

| Document ID | Edition / publication | Official record | Local evidence and SHA-256 | Status |
|---|---|---|---|---|
| `dga-2015` | *Dietary Guidelines for Americans, 2015-2020*, Dec 2015 | [ODPHP archive](https://health.gov/our-work/food-nutrition/previous-dietary-guidelines/2015) | `data/corpus_v3/chunks.jsonl`; `6eedb515bdb4bf307a3a337f32c71fd9fd1edcbace4dc9046c79104b5796ed2d` | Frozen V3 input |
| `dga-2020` | *Dietary Guidelines for Americans, 2020-2025*, Dec 2020 | [Official PDF](https://www.dietaryguidelines.gov/sites/default/files/2020-12/Dietary_Guidelines_for_Americans_2020-2025.pdf) | `data/corpus_v3/chunks.jsonl`; `5c64f2d4b4f2a30254868952e2fd0a3032a50c32cfcbdf2320cdf26826c812ad` | Frozen V3 input |
| `dga-2025` | *Dietary Guidelines for Americans, 2025-2030*, Jan 2026 | [Official PDF](https://www.dietaryguidelines.gov/sites/default/files/2026-01/Dietary_Guidelines_for_Americans_2025-2030.pdf) | `data/corpus_v3/chunks.jsonl`; `1fd2c0153bb10e3e08c0919487af1fb03577f380e76d51d050ae433ecca88114` | Frozen V3 input |

## B. V4 development/validation source corpus

All eight documents below were downloaded from WHO or WHO IRIS on 2026-07-21.
They are isolated from the V4 fresh-test inventory. Their extracted text is in
`data/corpus_v4_devval_draft/chunks.jsonl`; the document-to-chunk mapping and
download endpoints are in `data/corpus_v4_devval_draft/source_manifest.json`.

| Document ID | Publication | Official record | Local PDF | SHA-256 | Status |
|---|---|---|---|---|---|
| `who-potassium-2012` | *Guideline: potassium intake for adults and children*, 25 Dec 2012 | [WHO record](https://www.who.int/publications/i/item/9789241504829) | `data/sources_v4/who/who_potassium_2012.pdf` | `c2b221752f81604faf748e1a33420db8bdb8b7eb3b8f33ac8310c712982c4d0d` | Ingested into draft dev/val corpus |
| `who-sodium-2012` | *Guideline: sodium intake for adults and children*, 25 Dec 2012 | [WHO record](https://www.who.int/publications/i/item/9789241504836) | `data/sources_v4/who/who_sodium_2012.pdf` | `1f42c807c29ae255b31554afafaed683d5598414a1e5cc2a4b89190c72e2f369` | Ingested into draft dev/val corpus |
| `who-sugars-2015` | *Guideline: sugars intake for adults and children*, 4 Mar 2015 | [WHO record](https://www.who.int/publications/i/item/9789241549028) | `data/sources_v4/who/who_sugars_2015.pdf` | `0e81d49cffe12469c184a9d377c9ff80fa26f1f08d66b42fed40f1054b67b209` | Ingested into draft dev/val corpus |
| `who-nss-2023` | *Use of non-sugar sweeteners: WHO guideline*, 15 May 2023 | [WHO record](https://www.who.int/publications/i/item/9789240073616) | `data/sources_v4/who/who_non_sugar_sweeteners_2023.pdf` | `eac9098f235dc4b3a6079865aadf9515990d415974f864e8593b6096a6b7d0e3` | Ingested into draft dev/val corpus |
| `who-carbohydrate-2023` | *Carbohydrate intake for adults and children*, 17 Jul 2023 | [WHO record](https://www.who.int/publications/i/item/9789240073593) | `data/sources_v4/who/who_carbohydrate_2023.pdf` | `81548c804ebf031aa06a71f762c4ed72f680d4cb2caba44b011459fe5c841cd0` | Ingested into draft dev/val corpus |
| `who-total-fat-2023` | *Total fat intake for prevention of unhealthy weight gain*, 17 Jul 2023 | [WHO record](https://www.who.int/publications/i/item/9789240073654) | `data/sources_v4/who/who_total_fat_2023.pdf` | `a9f12218be0b1720c9be4f0dee79c2dbdcbd13fb44cd3e0d751bf04b5fa63381` | Ingested into draft dev/val corpus |
| `who-sat-trans-fat-2023` | *Saturated fatty acid and trans-fatty acid intake*, 17 Jul 2023 | [WHO record](https://www.who.int/publications/i/item/9789240073630) | `data/sources_v4/who/who_saturated_trans_fat_2023.pdf` | `767c24d20e90357e71831e3e19813f79c84457c8a24ddbca931237a58bd3d503` | Ingested into draft dev/val corpus |
| `who-lsss-2025` | *Use of lower-sodium salt substitutes*, 27 Jan 2025 | [WHO record](https://www.who.int/publications/i/item/9789240105591) | `data/sources_v4/who/who_lower_sodium_salt_substitutes_2025.pdf` | `e7111969908bbf588c20b457b6f5f26ce16e6d9e023e7e179d8a9c1b54a318a0` | Ingested into draft dev/val corpus |

The attempted 2003 WHO TRS 916 legacy URL returned a 755-byte redirect page,
not a PDF. It is preserved as
`data/sources_v4/who/who_trs_916_2003.download-error.html` and is not part of
the corpus or any judgment.

## C. Annotation and model provenance

| Artifact | Location | Status |
|---|---|---|
| Source-to-chunk manifest | `data/corpus_v4_devval_draft/source_manifest.json` | 8 PDFs, 1,392 source chunks |
| Expansion review ledger | `data/annotations_v4/devval_expansion_draft/review_ledger.jsonl` | 24 Gemini-assisted drafts; all `needs_user_review` |
| Codex-reviewed provisional ledger | `data/annotations_v4/devval_expansion_codex_reviewed/review_ledger.jsonl` | 24 records: 12 accepted unchanged, 12 revised then accepted; development-only exploratory use |
| Project-owner-approved ledger | `data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl` | 24 user-approved records; validation labels eligible but validation execution remains sealed until development selection |
| Project-owner signoff | `data/annotations_v4/devval_expansion_user_approved/project_owner_signoff.json` | User acceptance statement, scope, source/approved checksums, and gate conditions |
| Per-call Gemini responses | `results/v4/devval_expansion/model_calls/` | Model ID, prompt/response hashes, latency and usage retained |
| Model-call manifest | `data/annotations_v4/devval_expansion_draft/model_call_manifest.json` | 24 calls; no credential stored |
| Coverage audit | `results/v4/devval_expansion/coverage_audit.json` | 12 conditional-merge and 12 compatible-history groups; zero fresh-test overlap |
| Codex semantic review report | `results/v4/devval_expansion/CODEX_REVIEW_REPORT.md` | Provisional review decisions, revisions, checksums, and independence limitation |
| Codex review audit | `results/v4/devval_expansion/CODEX_REVIEW_AUDIT.json` | 24 unique lineage/evidence signatures; zero fresh-test overlap; validation remains blocked |
| Project-owner signoff report | `results/v4/devval_expansion/PROJECT_OWNER_SIGNOFF.md` | Human project-owner approval; does not represent independent blinded or clinical review |
| Project-owner signoff audit | `results/v4/devval_expansion/PROJECT_OWNER_SIGNOFF_AUDIT.json` | Approved-ledger checksum verified; 8 validation records remain sealed |
| Gemini connectivity manifest | `results/v4/model_registry/gemini-3.5-flash.manifest.json` | API connectivity verified |
| Frozen dev/validation split manifest | `data/annotations_v4/devval_expansion_user_approved/splits/split_manifest.json` | 16 development records; 8 validation records physically separated and sealed |
| Expanded development model-selection report | `results/v4/dev_model_selection/DEVELOPMENT_MODEL_SELECTION_REPORT.gemma-4-31b-it.md` | Complete Recency, Oracle lineage, Oracle + embedding, and Oracle + Gemma cross-encoder comparison |
| Expanded development raw retrieval | `results/v4/dev_model_selection/raw_retrieval_results.gemma-4-31b-it.jsonl` | 160 recomputable rows using identical per-query BM25 Top-20 pools |
| Expanded development audit | `results/v4/dev_model_selection/DEVELOPMENT_MODEL_SELECTION_AUDIT.json` | Complete cross-encoder run, zero validation overlap, independently recomputed metrics and candidate-pool hashes |
| Embedding model documentation | [Google Gemini API embeddings](https://ai.google.dev/gemini-api/docs/embeddings) | `gemini-embedding-001`, 768 dimensions, `QUESTION_ANSWERING` / `RETRIEVAL_DOCUMENT` tasks |
| Cross-encoder model documentation | [Google Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) | Stable model ID and capability record; full 16-query run pending explicit export approval |
| Gemini thinking configuration | [Google Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) | `thinkingLevel=minimal` preregistered for reranking latency control |
| Development model registries | `results/v4/dev_model_selection/model_registry*.json` | Provider descriptor responses and SHA-256 hashes; provider does not expose weights hashes |
| Reranker model comparison | `results/v4/dev_model_selection/RERANKER_MODEL_COMPARISON.md` | Gemma 4 complete 16/16; Gemini 3.5 Flash partial latency artifact excluded from selection |
| Model-specific artifact checksums | `results/v4/dev_model_selection/ARTIFACT_CHECKSUMS.gemma-4-31b-it.sha256` | Frozen checksums for the complete development cross-encoder run |
| Development safety owner signoff | `data/annotations_v4/dev_safety_user_approved/project_owner_signoff.json` | Project owner approved all 78 provisional labels on 2026-07-22; not independent blinded or clinical review |
| Development promotion gate | `results/v4/dev_model_selection/DEVELOPMENT_PROMOTION_GATE.json` | All four preregistered development gates passed; selected `oracle_cross_0.5` |
| Frozen validation configuration | `data/configs/v4_validation_frozen/FROZEN_VALIDATION_CONFIG.json` | Gemma 4 31B IT, alpha 0.5, BM25 Top-20, Recency lambda 0.75, fixed policy and endpoints |
| Validation execution guard | `data/configs/v4_validation_frozen/FREEZE_MANIFEST.json` | One validation execution completed; fresh test remains locked |
| Validation confirmation | `results/v4/validation_confirmation/VALIDATION_CONFIRMATION.md` | One-shot effectiveness and full project-owner-approved promotion gate passed |
| Validation raw retrieval | `results/v4/validation_confirmation/raw_retrieval_results.jsonl` | 16 recomputable rows for 8 validation queries and two frozen systems |
| Validation model calls | `results/v4/validation_confirmation/model_calls/` | Per-query frozen prompt, model response, scores, usage and latency |
| Validation safety packet | `results/v4/validation_confirmation/SAFETY_LABEL_REVIEW_PACKET.md` | Deterministically randomized candidate order; readable packet hides system identity |
| Validation Codex safety review | `results/v4/validation_confirmation/CODEX_SAFETY_REVIEW.md` | 33 citation-safe, 7 neither, 0 stale, 0 forbidden; subsequently approved by project owner |
| Validation safety owner signoff | `data/annotations_v4/validation_safety_user_approved/project_owner_signoff.json` | Project owner approved all 40 validation safety labels; not independent blinded or clinical review |
| Validation confirmation audit | `results/v4/validation_confirmation/VALIDATION_CONFIRMATION_AUDIT.json` | Raw rows, shared candidate pools, independently recomputed metrics, guards, and checksums verified |
| Frozen fresh-test package | `data/configs/v4_fresh_test_frozen/FROZEN_FRESH_TEST_PACKAGE.json` | Policy, model, prompts, parameters, construction rule, corpora, endpoints, and source-code checksums frozen before final test creation |
| Fresh-test protocol | `V4_FRESH_TEST_PROTOCOL.md` | One-shot retrieval, no tuning, predicted-graph isolation, answer blinding, and claim boundaries |
| Fresh source-window corpus | `data/corpus_v4_fresh_frozen/manifest.json` | 160 test-only windows deterministically derived from exact offsets in the frozen official DGA corpus; parent provenance and checksums retained |
| Fresh source-window provenance | `data/corpus_v4_fresh_frozen/provenance.jsonl` | Parent chunk, source checksum, exact evidence/window offsets, excerpt, and derived-text checksum |
| Fresh-test design amendments | `FRESH_TEST_DESIGN_AMENDMENT_01.md`, `FRESH_TEST_DESIGN_AMENDMENT_02.md`, `FRESH_TEST_DESIGN_AMENDMENT_03.md` | Pre-outcome corrections for pseudo-replication and weak generic retained evidence; zero retrieval calls at amendment time |
| Fresh-test Codex-reviewed ledger | `data/annotations_v4/fresh_test_codex_reviewed/fresh_test_ledger.jsonl` | 40 records, four strata × 10, 40 unique lineage/evidence signatures; project-owner review required before execution |
| Fresh-test review packet | `results/v4/fresh_test_construction/FRESH_TEST_REVIEW_PACKET.md` | Questions, required/deprecated/forbidden IDs, and current/retained excerpts; no retrieval results |
| Fresh-test sealed ledger | `data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl` | 40 project-owner-approved records; SHA-256 `dfa963cea17a60dcc4a974eafd26417e93166100e70428f1d784b40a4df09bdf` |
| Fresh retrieval result | `results/v4/fresh_test_retrieval/FRESH_TEST_RETRIEVAL_RESULT.md` | One frozen execution; coverage endpoints improved but full gate failed on deprecated/forbidden hits |
| Fresh retrieval audit | `results/v4/fresh_test_retrieval/FRESH_TEST_RETRIEVAL_AUDIT.json` | 40 records, 80 raw rows, shared Top-20 pools, independent metric recomputation, checksums, and execution guard verified |
| Fresh safety failures | `results/v4/fresh_test_retrieval/FRESH_TEST_SAFETY_FAILURES.md` | Three Oracle queries with deprecated or forbidden Top-3 hits |
| Post-test predicted graph | `results/v4/predicted_graph_posttest/relations.predicted.jsonl` | Genuine zero-shot Gemma predictions generated without queries, judgments, Oracle labels, scores, or metrics; diagnostic only |
| Predicted graph evaluation | `results/v4/predicted_graph_posttest/PREDICTED_GRAPH_EVALUATION.json` | Accuracy 0.30, macro-F1 0.196486; frozen runner ignores relation type, so distinct Predicted retrieval is not identifiable |
| Frozen answer generation | `results/v4/answer_generation/ANSWER_GENERATION_MANIFEST.json` | 120 Gemma answers across Append-only, Recency, and Oracle using one frozen prompt/model |
| Blinded answer packet | `results/v4/answer_generation/BLINDED_ANSWER_REVIEW_PACKET.md` | Per-query randomized system aliases; no system/model/rank/score/gold leakage detected |
| Automatic citation proxy | `results/v4/answer_generation/AUTOMATIC_GOLD_CITATION_PROXY.json` | Diagnostic only; explicitly not a human judgment or primary answer endpoint |
| Answer-generation audit | `results/v4/answer_generation/ANSWER_GENERATION_AUDIT.json` | 40 queries, 120 calls/answers, blinding and checksums verified; independent human evaluation incomplete |
| V5 relation-policy repair report | `V5_RELATION_POLICY_REPAIR_REPORT.md` | Root-cause analysis, directional relation semantics, citation-contract repair, verification, and claim boundaries |
| V5 Development/Validation replay | `results/v5/relation_policy_repair/V5_DEVVAL_REPLAY.json` | Cached-score replay only; input SHA-256 values retained, zero model calls, no fresh-test read/rerun, no tuning |
| V5 replay checksums | `results/v5/relation_policy_repair/ARTIFACT_CHECKSUMS.sha256` | SHA-256 checksums for V5 replay JSONL, JSON, and Markdown artifacts |
| V5 detector freeze-readiness audit | `V5_DETECTOR_FREEZE_READINESS.md` | V3 label defects, Development safety-gate failure, provider/model availability, and freeze blocker |
| V5 detector Development selection | `results/v5/relation_detector_development/DEVELOPMENT_SELECTION.json` | Gemma, Gemini 3.1 Flash-Lite, and fail-closed consensus; no candidate passed the safety gate; Validation remained sealed |
| V5 relation gold-label review packet | `results/v5/relation_detector_review/RELATION_GOLD_REVIEW_PACKET.md` | 40 official-source pairs unused by V4 fresh test; source URLs, local chunk locations, and old/new context retained |
| V5 relation review ledger | `data/annotations_v5/relation_detector_review/review_ledger.jsonl` | Balanced 10/10/10/10 draft labels; all remain ineligible until semantic review |
| V5 relation second-opinion triage | `results/v5/relation_detector_review/SECOND_OPINION_REVIEW.md` | Label-blind Gemini 3.1 Flash-Lite review: 9/40 agreement and 31 priority-review pairs; triage only, not adjudication |
| V5 Codex-mined atomic relation pairs | `data/annotations_v5/codex_mined_relation_pairs/reviewed_pairs.jsonl` | 22 exact claim-span pairs with official URLs, local Markdown line ranges, evidence hashes, rationale, and explicit AI-primary-reviewer provenance |
| V5 atomic-pair split | `data/configs/v5_codex_mined_detector/SPLIT_MANIFEST.json` | Evidence-hash connected-component split; Development/Validation evidence overlap is zero and Validation remains sealed |
| V5 Codex-mined detector result | `V5_CODEX_MINED_DETECTOR_RESULT.md` | Development safety selection passed; one-shot five-pair Validation failed and was locked against retuning; post-validation label limitation documented |
| V5 detector Validation artifact | `results/v5/codex_mined_detector_validation/VALIDATION_RESULT.json` | One execution, no invalid model outputs, full gate failed; not freeze-eligible |
| WHO/FAO TRS 916 source manifest | `data/sources_v5/who_fao/MANIFEST.json` | Official FAO catalog/PDF URLs, WHO record URL, local paths, PDF/page verification, SHA-256 values, and rejected HTML downloads |
| WHO/FAO TRS 916 (2003) evidence part | [FAO official catalog](https://www.fao.org/4/AC911E/AC911E00.htm), [official PDF part 2](https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf), [WHO IRIS record/PDF endpoint](https://iris.who.int/bitstream/handle/10665/42665/WHO_TRS_916.pdf?sequence=1) | `data/sources_v5/who_fao/WHO_FAO_TRS_916_2003_part2.pdf`; SHA-256 `f7d8b51b455f4853354b1b86339797da689426f440bc3fa62304eaa4b3d29429`; 93 pages; evidence pages visually verified |
| V5 R2 action split | `data/configs/v5_r2_action_detector/SPLIT_MANIFEST.json` | 22 balanced Development pairs and 12 newly sealed WHO/FAO validation pairs; zero cross-split evidence-hash overlap |
| V5 R2 correction ledger | `data/annotations_v5/r2_action_detector/CORRECTION_LEDGER.jsonl` | Preserves the original `v5claim-006`; records the post-validation correction as R2 Development-only |
| V5 R2 action detector result | `V5_R2_ACTION_DETECTOR_RESULT.md` | Three Development-only formulations tested; no safe detector passed recall/safety gate; validation execution count remains zero |
| V5 R2 Codex action audit | `data/annotations_v5/r2_codex_action_audit/audit_ledger.jsonl` | 22 Development decisions reviewed without model API; 5 action labels revised in a derivative while originals remain unchanged |
| V5 R2.4 atomic claims | `data/configs/v5_r2_4_atomic_action_detector/development.jsonl` | 44 normalized atomic claims with preserved parent passages, URLs, locators, and hashes |
| V5 R2.5 official-source expansion | `data/annotations_v5/r2_5_official_action_expansion/development_expansion.jsonl` | 20 new WHO Development pairs; 42 total pairs and 42 lineage groups; sealed validation unchanged |
| V5 local/no-API continuation | `V5_R2_LOCAL_NO_API_CONTINUATION.md` | Codex audit plus local logistic/tree ablations; no external model calls; all Development gates failed and validation remained locked |
| V5 R2.6 query-conditioned split | `data/configs/v5_r2_6_query_conditioned_action_detector/SPLIT_MANIFEST.json` | Fixed 30/12 lineage-disjoint split for query + atomic OLD + atomic CURRENT; no external model API |
| V5 R2.6 Development result | `V5_R2_6_QUERY_CONDITIONED_RESULT.md` | Safe recall reached 5/11 (0.4545), below the 0.5 gate; Validation remained unexecuted |
| V5 R2.6 label audit | `data/annotations_v5/r2_6_query_conditioned_development_audit/audit_ledger.jsonl` | Complete post-prediction audit; two inherited pair-only labels require revision, so retroactive promotion is prohibited |
| V5 R2.7 pre-audited cross-version split | `data/configs/v5_r2_7_preaudited_cross_version/SPLIT_MANIFEST.json` | 24 WHO/FAO 2003-to-2012/2025 lineages; 12 preserve/12 block; labels audited before prediction; 16/8 frozen split |
| V5 R2.7 explicit historical router | `V5_R2_7_EXPLICIT_HISTORICAL_ROUTER_RESULT.md` | Development and one-shot Validation passed with zero false preserves; promotion scope is explicit historical-intent routing only |
| V5 R2.8 shared-pool retrieval protocol | `R2_8_SHARED_POOL_RETRIEVAL_PROTOCOL.md` | Development-only shared BM25 Top-20 comparison; Recency λ=0.75; stratified gates frozen before retrieval |
| V5 R2.8 shared-pool retrieval result | `V5_R2_8_SHARED_POOL_RETRIEVAL_RESULT.md` | Explicit-history required micro Recall@3 improved from 0.3750 to 0.9375 with no current-only safety regression; Development evidence only |
| V5 R2.9 retrieval Validation protocol | `R2_9_RETRIEVAL_VALIDATION_PROTOCOL.md` | Frozen R2.8 policy, 12 newly authored lineages, separated inputs/judgments, and one-shot promotion gates |
| V5 R2.9 retrieval Validation result | `V5_R2_9_RETRIEVAL_VALIDATION_RESULT.md` | Explicit-history Recall@3 improved from 0.3333 to 0.7500 and both-evidence coverage from 0 to 0.6667; all gates passed without current-only regression |
| V5 R2.10 frozen policy | `data/configs/v5_r2_10_frozen_policy/FROZEN_POLICY_PACKAGE.json` | R2.8/R2.9 detector, BM25, Top-20/Top-3, λ=0.75, pair boost 0.75, endpoints, claim scope, and source-code checksums frozen before fresh-test construction |
| V5 R2.10 fresh-test review packet | `results/v5/r2_10_fresh_test_construction/R2_10_FRESH_TEST_REVIEW_PACKET.md` | 16 new lineages across four strata; official source URLs and locators included; checksum-bound project-owner approval recorded on 2026-07-24 |
| V5 R2.10 one-shot fresh retrieval | `results/v5/r2_10_fresh_test/FRESH_TEST_RESULT.json` | Frozen Recency and Version-Aware policies evaluated once on the approved packet; raw rows in `results/v5/r2_10_fresh_test/raw_retrieval_results.jsonl`, independent recomputation in `INDEPENDENT_AUDIT.json`, and execution remains locked at one |
| Gemini thinking configuration | https://ai.google.dev/gemini-api/docs/thinking | Official API reference used to configure Gemini 3 minimal thinking and diagnose hidden-thinking token exhaustion |

### Recorded protocol deviation

During a local format inspection on 2026-07-22, one sealed validation record was
displayed after the development model had already been selected, but immediately
before the freeze manifest was written. No validation retrieval score existed and
no selected parameter changed. The deviation is retained in
`data/configs/v4_validation_frozen/FREEZE_MANIFEST.json` and
`results/v4/validation_confirmation/VALIDATION_CONFIRMATION.json`; therefore this
validation run must not be described as completely pristine held-out evaluation.
The not-yet-created fresh V4 test was not exposed.

## D. Rules

1. Preserve the official record URL, direct download URL, retrieval date,
   local path, byte length, page count, and SHA-256 for every ingested source.
2. Keep V3, V4 development/validation, and V4 fresh-test corpora physically and
   logically separate.
3. A model-generated query or evidence label remains a draft until a reviewer
   accepts, revises, or rejects it in the review ledger.
4. Do not run validation, promotion gates, predicted-graph evaluation, or
   answer-level evaluation against `needs_user_review` records.
5. Never use judgments as a reranker feature.
6. Codex provisional review permits development-only exploratory evaluation;
   it is not independent human adjudication and cannot unlock validation or
   promotion without user or independent reviewer signoff.
7. Project-owner signoff makes the labels eligible for the planned workflow,
   but validation execution stays sealed until development-only model selection
   is frozen. It does not unlock promotion or a fresh test.
