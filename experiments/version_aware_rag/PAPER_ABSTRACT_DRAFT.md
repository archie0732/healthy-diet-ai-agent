# Version-Aware RAG for Evolving Nutrition Guidelines

## 中文摘要（草稿 v0.2）

營養與健康指引會隨新證據持續更新，使檢索增強生成（retrieval-augmented generation, RAG）系統可能同時取回現行、已被取代，或僅適用於特定族群與條件的內容。新近性排序雖能優先呈現較新的文件，卻難以處理需要比較歷史與現行建議的問題；反之，若對所有查詢一律保留舊版證據，也可能排擠更相關的現行資訊。為此，本研究提出選擇性版本感知 RAG（Version-Aware RAG）框架：一般現行問題沿用新近性檢索，當查詢明確表達歷史或跨版本比較意圖時，才依據證據譜系與跨版本關係保留歷史及現行證據。

本研究以版本化營養與健康指引建立可追溯的原子證據資料集，並比較新近性檢索與版本感知檢索。實驗採用雜湊凍結的開發、驗證及一次性新鮮測試流程，確保兩個系統使用相同的候選池，並將檢索輸入與密封標註分離。所有政策與晉級門檻均於測試前固定，測試結果另以獨立程序重新計算，以降低資料洩漏、事後調參與評估偏誤。

在包含 16 題、四種查詢情境的一次性新鮮測試中，版本感知方法將整體必要證據的 micro Recall@3 由 0.625 提升至 0.833。對明確要求歷史與現行資訊的查詢，其 Recall@3 由 0.375 提升至 1.000，歷史與現行證據同時覆蓋率亦由 0 提升至 1.000；在 current-only、conditional-merge 與 hard-negative-current 三個控制情境中，預先設定的檢索指標均未下降，且未增加已淘汰舊證據的命中。由於明確歷史意圖分層僅含 4 題，雙尾精確符號檢定為 p = 0.125，結果應視為具一致方向與明顯描述性效果的初步證據，而非全面性的統計優越結論。

研究結果顯示，版本感知檢索並非新近性檢索的全面替代，而是針對跨版本資訊需求的補充機制。透過查詢意圖路由選擇性啟用版本政策，可在維持一般現行問題檢索表現的同時，改善歷史與現行證據的共同覆蓋。本研究的主要貢獻在於建立一套可稽核、可重現且具明確適用邊界的版本化證據檢索方法，為持續更新的健康知識庫提供兼顧相關性、時間一致性與證據完整性的設計方向。

**關鍵詞：** 檢索增強生成、版本感知檢索、營養與健康指引、查詢意圖、證據溯源、健康人工智慧

## English Abstract (Draft v0.1)

Nutrition and health guidelines evolve as evidence changes, causing retrieval-augmented generation (RAG) systems to retrieve evidence that is current, superseded, or applicable only to specific populations or conditions. Recency-based ranking alone cannot determine whether older evidence should be excluded, retained for historical comparison, or presented together with current guidance. We propose a Version-Aware RAG framework that derives retrieval policies from cross-version evidence relations, applicability conditions, and the temporal intent of a query. The framework was compared with append-only and recency-based retrieval under a staged, checksum-frozen development, validation, and one-shot held-out evaluation protocol. Shared candidate pools, separation of retrieval inputs from sealed judgments, preregistered promotion gates, and independent recomputation were used to reduce leakage and post hoc tuning.

In an early broad-query held-out evaluation (n = 8), the general version policy did not outperform the recency baseline: Recall@3 was 0.208 versus 0.583, with no reduction in stale-hit rate. Following error analysis, the supported hypothesis was narrowed to queries explicitly requesting both historical and current evidence. On a one-shot fresh test (n = 16), Version-Aware RAG increased overall required-evidence micro Recall@3 from 0.625 to 0.833. Within the explicit-history stratum, Recall@3 increased from 0.375 to 1.000 and joint historical–current evidence coverage increased from 0 to 1.000, without degrading preregistered endpoints in three control strata or increasing deprecated-old evidence hits. However, the explicit-history stratum contained only four queries, and the two-sided exact sign test was not statistically significant (p = 0.125). A neural-hybrid candidate retriever further improved Development Recall@20 from 0.9038 to 0.9808 and implicit two-evidence coverage from 0.25 to 0.45, but reduced current-only Recall@3 from 1.000 to 0.833 and therefore failed the complete promotion gate.

These findings define the effective scope of Version-Aware RAG: when queries explicitly require cross-version comparison, combining version relations with temporal intent improves joint coverage of historical and current evidence while preserving retrieval safety in control settings. Implicit and general queries require further advances in candidate ranking and intent recognition. The proposed framework therefore moves beyond simple recency preference toward an auditable evidence-retention mechanism and provides a reproducible approach for measuring trade-offs among safety, relevance, and evidence completeness.

**Keywords:** retrieval-augmented generation; version-aware retrieval; nutrition guidelines; temporal intent; evidence provenance; health artificial intelligence

## 人工審核完成後的更新欄位

- 僅在人工審核完成、解盲及仲裁後，決定是否加入一項精簡的人工作業結果。
- R2.22 的 GPT-5.6 盲審屬補充性 AI triangulation，不得寫成獨立人工、臨床或專家審核。
- 若人工審核對證據契約的結果與現有標註存在重大差異，應先修正限制與討論，不應直接改寫主要留出檢索結果。
- 除非另有真正的答案層級人工評估，摘要不應加入「答案品質全面優於基線」的主張；目前以正向界定方法的有效範圍表達此證據邊界。
