# V7 Fresh Confirmatory Test Plan

1. 另建未開封 query set；V6 的 96 題只作 development，不重複當 confirmatory test。
2. 在看 V7 gold/outcome 前凍結 overlap-aware labeling protocol，並對 required、unsafe、relation endpoints 一致套用。
3. 凍結 router patterns（含 `former`）、V5-aligned tokenizer、corpus-global recency normalization。
4. 凍結目前 relation-enriched shared Top-20 candidate generator；六個 systems 必須共用候選池，V7 不再修改 Unicode、stemming、bigram 或否定詞規則。
5. 使用 V6 development 選定唯一 candidate K 與 boost，寫入 hash manifest；V7 不再調參。
6. preflight 必須驗證：router fixtures、非 Top-1 endpoint pair activation、兩端 positive gate、E=B untriggered、C=F、gold/unsafe overlap aliases。
7. V7 runner 零次讀取 gold，僅執行一次並封存 raw output；之後才解封評估。
8. 主要指標：E−B explicit-history paired Recall@3；共同安全指標：current-only/hard-negative unsafe query-hit@3 差值與 unique forbidden introductions。
9. 同時報 BM25、Recency、Router-only、Always-pair、Version-aware、Router-only replicate（A–F），以及 Recall@5/10/20 candidate diagnostics。
10. 論文將研究範圍明定為 RAG pipeline 的 retrieval stage，不主張 answer generation quality。
