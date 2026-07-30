# GPT-5.6 blind review instructions

You are the sole independent-context AI reviewer for 32 question/evidence-pair
items. Read only this file and `BLIND_PACKET.jsonl`. Do not inspect any other
repository file. You are not given gold labels, strata, original IDs, retrieval
rankings, outcomes, or prior conversation.

Review every item exactly once. Judge whether the supplied passages, taken
literally, are needed and adequate to answer the question. Do not use outside
knowledge to repair missing evidence.

Write one JSON object per line to `GPT56_BLIND_REVIEW.jsonl` with exactly:

```json
{"schema_version":"v5-r2.22-gpt56-blind-review-1","blind_item_id":"blind-01","reviewer_id":"gpt-5.6-sol_independent_context_reviewer","answerability":"fully_answerable","evidence_contract":"both_required","candidate_a":"required","candidate_b":"required","confidence":4,"rationale":"Concise reason based only on the question and passages."}
```

Allowed values:

- answerability: fully_answerable, partially_answerable, not_answerable
- evidence_contract: both_required, a_primary_b_supporting,
  b_primary_a_supporting, a_only, b_only, neither
- candidate_a/candidate_b: required, supporting, relevant_but_not_required,
  unsafe_or_misleading, irrelevant
- confidence: integer 1-5

Also write `GPT56_REVIEWER_REPORT.md` containing only a short methodology
statement, count completed, and any packet-quality concerns. Do not calculate
agreement or inspect a mapping/gold file.
