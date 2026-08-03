# V7 review-packet v1 invalidation

The first Gemini review and second GPT review used a packet that displayed only the lexicographically first acceptable overlap chunk for each evidence group. Several displayed excerpts began or ended at chunk boundaries and omitted answer-bearing table or recommendation text.

Those outputs remain preserved as an audit trail but do not count toward the three required isolated reviews. The replacement packet uses the complete page excerpts that had already been used for the pre-query isolated relation review. No retrieval output was generated or inspected.

Three query defects identified during the invalidated reviews were also corrected before restarting review:

- `v7q-eh-002`: removed wording that disclosed the comprehensive-policy answer.
- `v7q-eh-019`: specified the under-6-month population.
- `v7q-hn-001`: specified the under-6-month population.

## Packet-v2 follow-up

The first page-level replacement still exposed flattened PDF tables and non-ASCII text through the Antigravity transfer path. That review is also preserved but invalidated. The final packet revision:

- uses ASCII-safe query and evidence text;
- retains complete source pages for narrative recommendations;
- includes the pre-query, visually verified structured relation support and visual-review note;
- removes flattened-table lineages from the 20-query explicit-history primary stratum;
- uses 20 distinct explicit-history lineages, while current-only and hard-negative queries act as safety controls over those frozen lineages.

No retrieval output was generated or inspected during any packet repair.
