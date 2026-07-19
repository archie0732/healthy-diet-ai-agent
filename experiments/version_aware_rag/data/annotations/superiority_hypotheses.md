# Version-Aware RAG Superiority Hypotheses

This document defines the hypotheses for the next experiment stage. The credibility-repaired evaluation showed that Recency-Only and Proposed can tie on simple current-version retrieval. The superiority suite must therefore target cases where recency alone is structurally insufficient.

## H1: Compatible History

When an older guideline remains valid because the relation is `complementary` or `conditional_difference`, Recency-Only may over-prefer newer chunks and miss the older still-valid evidence. Version-Aware RAG should retain compatible historical chunks.

Expected signal:

- Proposed retrieves both current and compatible historical evidence.
- Recency-Only retrieves only newer chunks or noisy newer chunks.
- Proposed improves compatible-hit behavior without increasing deprecated retrieval.

## H2: Conditional Exceptions

When a newer guideline adds an exception instead of replacing the general rule, answers may require both the newer exception and the older/general rule. Version-Aware RAG should retrieve both when policy is `retain`.

Expected signal:

- Proposed retrieves the exception and the general rule together.
- Recency-Only may retrieve the newest exception but miss older compatible context.
- The final answer should preserve condition boundaries instead of flattening the recommendation.

## H3: Newer-But-Irrelevant Noise

When a newer chunk mentions the same topic but does not answer the query, Recency-Only may rank it above a more relevant retained older chunk. Version-Aware RAG should not blindly prefer the newest chunk.

Expected signal:

- Recency-Only ranks newer but lower-answer-quality chunks.
- Proposed ranks retained compatible evidence when the policy state says it remains valid.
- Required-hit and compatible-hit rates expose the difference.

## H4: Deprecated Suppression

When old chunks are semantically similar but policy-marked `deprecate`, Version-Aware RAG should suppress them while Append-Only retrieves them.

Expected signal:

- Append-Only retrieves deprecated chunks.
- Proposed does not retrieve deprecated chunks.
- Recency-Only may also suppress stale chunks by age, so H4 alone is not enough to prove superiority over Recency-Only.

## Candidate Mapping

| Hypothesis | Existing Pair Candidates | Needs Synthetic/Additional Query? |
| :--- | :--- | :---: |
| H1 | Dietary Cholesterol Limit | Yes |
| H2 | Sodium Intake Limit | Yes |
| H3 | Cholesterol, Sodium, Sweeteners | Yes |
| H4 | Dairy, Added Sugars, Alcohol, Whole Grains, Vegetables/Fruits | No |

## Claim Boundary

This suite may support a bounded claim: Version-Aware RAG handles retained historical or conditional knowledge better than Recency-Only in version-sensitive guideline retrieval. It should not be used to claim global superiority across all RAG settings.
