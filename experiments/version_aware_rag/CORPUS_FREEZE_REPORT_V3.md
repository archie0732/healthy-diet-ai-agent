# Corpus V3 Verification and Freeze Report (Plan 2 收尾與凍結報告)

本文件記錄對 `corpus_v3/chunks.jsonl` 的人工抽查、數據稽核（Audit）分析、以及 Corpus Checksum 凍結宣告。

---

## 1. 缺頁分析與處置 (Missing Page Sequence Audit)

在 `corpus_report.json` 中，`dga-2015` 指出了兩頁缺失：`[8, 143]`。經由人工核對原始標準化 Markdown 檔案 [Dietary-Guidelines-for-Americans-2015-2020.md](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/data/normalized/Dietary-Guidelines-for-Americans-2015-2020.md)，確認如下：

- **第 8 頁 (Page 8)**：
  - 原始 Markdown 中為：
    ```markdown
    ---## Page 8
    
    ---## Page 9
    Message From the Secretaries
    ```
  - **原因與處置**：第 8 頁在原稿中為「Message From the Secretaries」之前的空白過渡頁，無任何實體文字。因此無任何 text 被萃取，未產生 chunk，此為**預期中的合理現象**。

- **第 143 頁 (Page 143)**：
  - 原始 Markdown 中為：
    ```markdown
    ---## Page 142
    Notes
    
    ---## Page 143
    
    ---## Page 144
    HHS Publication #: HHS-ODPHP-2015-2020-01-DGA-A
    ```
  - **原因與處置**：第 143 頁在原稿中為筆記頁（Notes）與封底之間的空白頁，無實體文字內容，因此未產生 chunk。此為**預期中的合理現象**。

**判定**：無解析遺漏，資料來源本身即無內容。

---

## 2. 稽核指標分析 (Audit & Near-Duplicate Analysis)

根據 `audit_corpus` 的報告，系統中含有 66 組 Near-duplicates，且最大段落長度為 807 words。經人工檢查與抽樣，確認分析如下：

- **Near-Duplicates 產生原因**：
  - 主要來自**重複的腳註/聲明**。例如新增糖限量的腳註 `[2]The recommendation to limit intake of calories from added sugars to less than 10 percent per day...` 在 Page 15 與 Page 34 等多個地方重複出現。
  - **術語定義與詞彙表**：如 "Terms To Know" 中的定義與附錄詞彙表有高度重疊。
  - **圖表之重複描述**：多處圖表對應的說明文字有高度相似度。
  - **結論**：這些重疊反映了原書指南中自然的文字重現與交叉引用，非切分演算法的 bug。因此 **66 組 near-duplicate 符合預期**。

- **最大段落長度 (807 words)**：
  - 經定位，超過 450 words 的 8 個 chunks 全部為**大型結構化 Markdown 表格**（如 Appendix 3 中的 `USDA Food Patterns: Healthy U.S.-Style Eating Pattern` 12 個卡路里水平的大型數據對照表，以及鉀元素食物來源排行表）。
  - **處置原則**：為保留表格的二維結構與欄位語意對齊關係，切分器故意不對 Markdown 表格進行句子級的二次分割。這使得表格能作為單一原子 chunk 被完整索回，對於 LLM 的閱讀與 RAG 的語意完整性最為有利。最大長度 807 words **符合設計且完全可接受**。

---

## 3. Corpus Checksum 凍結宣告

經上述人工 QA 與數據稽核確認無誤，現正式凍結 `corpus_v3` 之 Checksum：

- **資料庫路徑**：[chunks.jsonl](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/data/corpus_v3/chunks.jsonl)
- **SHA-256 Checksum**：`ee4f1c5bddb6b7f255aa4cd497614812bb1933e545c4f0dc3e45986b3a624af7`

該 Checksum 已寫入所有 v3 配置檔案，且已於設定載入器 [config.ts](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/src/shared/config.ts) 中啟用強校驗。任何後續變更皆須重新宣告與人工核備。

---

## 4. 驗證證據清單 (Verification Checklists)

- **單元測試狀態**：5/5 全數通過（包含頁面解析、段落切分、與 Checksum 驗證測試）。
- **設定防護狀態**：使用不正確的 corpus checksum 載入設定時會立即拋出錯誤，阻止實驗運行。
