# V5 Relation-Aware Policy Repair — Development/Validation Replay

This replay uses only cached V4 development and validation scores. It makes zero model calls, performs no tuning, and does not read or rerun the frozen V4 fresh test.

| Split / endpoint | Recency | V5 Oracle replay |
|---|---:|---:|
| Development conditional merge required micro Recall@3 | 0.125 | 0.6875 |
| Development compatible history required micro Recall@3 | 0.25 | 0.75 |
| Development retained required micro Recall@3 | 0 | 0.6875 |
| Validation conditional merge required micro Recall@3 | 0.222222 | 0.555556 |
| Validation compatible history required micro Recall@3 | 0.111111 | 0.777778 |
| Validation retained required micro Recall@3 | 0 | 0.625 |

Coverage gate: **PASS**. V4 selected Top-3 was preserved for 16/16 development and 8/8 validation queries.

Safety repair is established by unit fixtures for superseded/conflicting edges. It is not a new held-out estimate. A future V5 test must be constructed and sealed only after this policy and citation contract are frozen.
