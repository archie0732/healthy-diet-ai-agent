# V6 Policy Freeze Report

- Frozen corpus：20 documents、1,601 pages、3,535 chunks。
- Query count：96；required evidence groups：133。
- Systems：A–F，共用 BM25 Top‑20 candidate pool。
- BM25：k1=1.2、b=0.75；primary output k=3。
- Recency lambda：0.75，沿用已開封 V5 Development/Validation policy。
- Pair boost：0.5；由 `0, 0.25, 0.5, 0.75, 1.0, 1.5` 中選取。
- Selection：0.5、0.75、1.0、1.5 同分，依預先規則選最小值。
- Router：重用 V5 `explicit_temporal_history_intent_v1`，未依 V6 題目調整。
- Pairing：僅限共享 Top‑20 內；mate raw BM25 必須大於 0；不得 out-of-pool expansion。
- Safety margin：E−B unsafe query-hit rate 絕對差不得超過 0.05，且不得新增 forbidden query。
- Statistics：exact paired sign-flip；10,000 次 lineage-clustered bootstrap，seed 20260801。
- Preflight：所有 hashes、runner gold isolation 與 7 個 invariant tests 均通過。
- Single-use execution：已於 2026-08-01 消耗，execution count=1；禁止調參或重跑。
