# V6 query and gold-contract draft schema

Status: `DRAFT FOR ISOLATED AI REVIEW — NOT SEALED`

`V6_QUERY_DRAFTS.jsonl` contains only fields that may be visible to a retrieval runner:

- `schema_version`
- `query_id`
- `query_text`
- `language`
- `status`

`V6_GOLD_CONTRACT_DRAFTS.jsonl` is kept separate and inaccessible during retrieval. Each record contains:

- allocation metadata: `query_id`, `stratum`, `candidate_id`, `lineage_id`, `family`, and `relation_type`;
- page-level `required_evidence_refs`, `compatible_evidence_refs`, `deprecated_evidence_refs`, `forbidden_evidence_refs`, and `citation_safe_evidence_refs`;
- `relation_evidence_ref` and a private `construction_basis` for source-grounded review;
- `review_status`.

Page-level references are construction-time contracts. They must be resolved to frozen corpus chunk IDs after corpus construction and before sealing. Drafts cannot be used for fresh retrieval or evaluation.

Stratum contract:

- `explicit_history`: query explicitly requests comparison of the earlier and operative guidance; answer-bearing older and current pages are required. A distinct lineage/relation page remains review-only construction evidence and is not counted as required retrieval evidence unless it independently contains an answer-bearing claim.
- `current_only`: current evidence is required; compatible older evidence may be citation-safe but is not required; displaced older evidence is deprecated.
- `hard_negative_current`: current evidence is required and the auditable displaced older evidence is forbidden.

Every draft requires unanimous approval across three isolated review runs for answerability, stratum validity, evidence necessity, unsafe-evidence labeling, non-triviality, leakage, and wording safety. Exact model and session metadata are retained, and no majority vote is allowed. The removed `conditional_merge` contracts remain archived as a negative benchmark-construction result; they are not eligible for retrieval evaluation.
