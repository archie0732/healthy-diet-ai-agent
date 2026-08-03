# V6-R 修復診斷報告

## 結論

原始 V6 的 raw output 對「已凍結實作」有效，但沒有實際測到預定的 lineage-pairing treatment：explicit-history 的 pair activation 是 0/32。因此原始負結果不能解讀成版本配對機制無效。

V6-R 是開封資料上的 post-hoc development diagnostic，不是新的 confirmatory experiment，也不覆寫任何 V6 frozen/raw artifact。

## 已修正問題

1. 將同頁、相鄰且重複同一 recommendation anchor 的 boundary-overlap chunks 納入同一 evidence group；共 52 個 group 增加 52 個 alias membership。
2. relation endpoint 同樣支援 overlapping chunk aliases；19 個 endpoint 各增加一個 alias。
3. pair seed 改為 Top-K 內「兩端皆存在且 BM25 > 0」的最高總分完整 relation pair，不再要求全域 Top-1 恰好是 canonical endpoint。
4. router 新增 `former`，explicit-history 由 28/32 修正為 32/32，且 64 個非歷史題為 0 false positive。
5. tokenizer stopwords 與先前 V5 boost development/validation 對齊。
6. recency 改為固定 corpus-global 2005–2026 normalization，不再依每題 Top-20 的年份範圍改變。
7. 六個 systems 共用 relation-enriched Top-20：relation index 只使用事前建立且可稽核的 lineage ID、relation facets、relation basis 與 source metadata；取得 relation 後保留兩端 passage。
8. Relation lookup 加入 Unicode 正規化、單複數正規化、bigram 與有限否定詞處理，以區分 `protein-first`／`protein-not-first`、`no-protein` 等相近 lineage。

## 完整 reference repair（共用 relation-enriched Top-20、boost=0.5）

- pair activation：32/32（原始 V6 為 0/32）
- 選中正確 query gold lineage：32/32
- E−B explicit-history mean Recall@3：+0.5234375
- improved / tied / regressed：26 / 6 / 0
- overlap-aware candidate macro Recall@20：0.927951
- B 與 E unsafe query-hit@3：皆為 0.03125；差值 0
- invariants：E=B when untriggered、C=F，皆通過

此設定保留 Top-20 與事前選定 boost=0.5；候選方法是在已開封 V6 上完成的修復，因此仍是 development diagnostic，不能當成 confirmatory result。

## 敏感度與剩餘瓶頸

原始純 BM25 pool 的敏感度顯示 Top-20 candidate recall 0.558160、Top-50 為 0.676215、Top-100 為 0.796007。修正版 relation-enriched Top-20 達 0.927951，說明修復確實處理了 candidate bottleneck，而不是靠放大 K 掩蓋問題。

Relation disambiguation 在這 32 題達 32/32，但相關正規化是在已開封資料上排錯完成，可能存在 development-set overfitting。V7 必須原封不動凍結這些規則，使用全新題目驗證。

## 論文處理

- 原始 V6 應報告為 implementation/treatment-delivery failure，而不是方法無效的 confirmatory evidence。
- V6-R 只能放在 error analysis / post-hoc diagnostic，清楚標註 opened-data analysis。
- 不應繼續宣稱 unsafe hit rate 為零；overlap-aware 值為 2/64 = 0.03125，但 E−B 差值仍為零。
- 正式主張需另做 V7 fresh evaluation，且在執行前凍結 tokenizer、router、global recency、relation selection、overlap-aware gold 與 candidate generator。
