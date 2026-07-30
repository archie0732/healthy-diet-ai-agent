# R2.22 GPT-5.6 Blinded Independent-Context Review Protocol

Date fixed: 2026-07-28  
Scope: the 32 owner-approved R2.20 Development-confirmation questions  
Purpose: secondary AI triangulation of annotation adequacy, not model promotion

## Reviewer isolation

One GPT-5.6 reviewer receives only `BLIND_REVIEW_INSTRUCTIONS.md` and
`BLIND_PACKET.jsonl`. The reviewer must not inspect any other repository file,
prior conversation, gold annotation, stratum, evidence role, retrieval rank,
metric, or R2.20/R2.21 outcome.

This is an independent-context AI review. It is not an independent human,
clinical, or expert review and must not be described as one.

## Blinding

Each packet item contains only:

- a blind item ID;
- the question;
- candidate passages A and B;
- document identifier, page number, and passage text for each candidate.

Original query IDs, strata, gold roles, atomic claims, candidate-group IDs,
retrieval outcomes, and system rankings are omitted. Candidate A/B order is
deterministically swapped from the original pair using a SHA-256 rule, so the
original left/right convention cannot reveal the role.

The packet, instructions, and sealed mapping are checksum-bound before review.
The sealed mapping is not available to the reviewer.

## Fixed one-pass rubric

For every item, the reviewer returns:

- `answerability`: `fully_answerable`, `partially_answerable`, or
  `not_answerable`;
- `evidence_contract`: `both_required`, `a_primary_b_supporting`,
  `b_primary_a_supporting`, `a_only`, `b_only`, or `neither`;
- `candidate_a` and `candidate_b`: `required`, `supporting`,
  `relevant_but_not_required`, `unsafe_or_misleading`, or `irrelevant`;
- `confidence`: integer 1 through 5;
- a concise `rationale` based only on the supplied question and passages.

The reviewer must complete all 32 items once without seeing aggregate results
or revising judgments after comparison with the frozen annotation.

## Post-review analysis

Only after the review file is complete and schema-valid may it be joined to the
sealed mapping and owner-approved R2.20 annotation. Reporting includes:

- completeness and schema validity;
- exact evidence-contract agreement;
- candidate-level role agreement under a preregistered role mapping;
- agreement by R2.20 stratum;
- answerability and confidence summaries;
- all disagreements.

The comparison is agreement with a frozen owner-approved annotation, not
inter-human reliability. It is reported as supplemental robustness evidence.

