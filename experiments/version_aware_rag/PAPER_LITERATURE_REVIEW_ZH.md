# 2. 文獻探討

## 2.1 檢索增強生成

檢索增強生成（retrieval-augmented generation, RAG）將語言模型與外部文件檢索結合，使生成內容能使用可更新且可追溯的知識。Lewis 等人 [1] 建立 RAG 的基本架構，後續研究則顯示檢索器、文件切分、重排序及上下文組合均會影響最終表現。由於不同查詢對外部知識的需求並不相同，Su 等人提出 DRAGIN [2]，讓系統依生成過程中的資訊需求決定何時及如何檢索，說明條件式啟用策略可能優於固定檢索流程。

## 2.2 時間感知與版本化檢索

在動態知識方面，FRESHLLMS [3] 以搜尋引擎資訊處理需要最新事實的問題；Re³ [4] 進一步結合相關性與新近性，辨識並抑制過時文件。FaithfulRAG [5] 則在事實層級處理模型知識與檢索內容的衝突。上述方法主要著重取得最新資訊或排除矛盾證據，但舊版內容不一定應被刪除：當查詢要求歷史比較時，舊版與現行證據可能必須共同保留；對一般現行問題，保留舊證據反而可能占用有限的前段檢索位置。因此，本研究將查詢時間意圖與跨版本證據關係結合，判斷何時啟用歷史—現行證據配對，而非對所有查詢套用相同的新近性或版本政策。

## 2.3 健康領域 RAG 與評估

健康 RAG 對來源、時效與適用條件具有較高要求。MedRAG [6] 顯示，不同醫療語料與檢索器組合會明顯影響問答表現，支持將檢索品質與生成能力分開評估。RAGAS [7] 與 ARES [8] 分別從檢索內容相關性、答案忠實性及答案相關性等面向評估 RAG，但自動指標仍不能完全取代人工判斷。

## 2.4 研究缺口

既有研究多著重取得最新資訊、排除矛盾內容或評估答案忠實性，較少探討歷史證據應在何種查詢情境下被保留。本研究因此在版本化營養與健康指引上，分別衡量必要證據召回、歷史—現行共同覆蓋及淘汰證據命中，並以共享候選池、密封標註與一次性留出測試降低資料洩漏及事後調參。相較既有研究，本研究的重點不是單純偏好最新文件，而是建立可稽核的查詢依賴版本保留策略。

## 精簡參考文獻

[1] P. Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks,” *NeurIPS*, 2020.  
[2] W. Su et al., “DRAGIN: Dynamic Retrieval Augmented Generation based on the Real-time Information Needs of Large Language Models,” *ACL*, 2024.  
[3] T. Vu et al., “FRESHLLMS: Refreshing Large Language Models with Search Engine Augmentation,” *Findings of ACL*, 2024.  
[4] J. Cao et al., “Re³: Relevance & Recency Retrieval for Mitigating Temporal Hallucination,” *ACL*, 2026.  
[5] Q. Zhang et al., “FaithfulRAG: Fact-Level Conflict Modeling for Context-Faithful Retrieval-Augmented Generation,” *ACL*, 2025.  
[6] G. Xiong et al., “Benchmarking Retrieval-Augmented Generation for Medicine,” *Findings of ACL*, 2024.  
[7] S. Es et al., “RAGAs: Automated Evaluation of Retrieval Augmented Generation,” *EACL System Demonstrations*, 2024.  
[8] J. Saad-Falcon et al., “ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems,” *NAACL*, 2024.
