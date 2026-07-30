# 論文圖稿

## 圖 1　Version-Aware RAG 分層系統架構

```mermaid
flowchart TB
    subgraph L1["查詢互動層"]
        direction LR
        Q["自然語言查詢"]
        O["Top-3 證據輸出"]
    end

    subgraph L2["檢索協調層"]
        direction LR
        R["時間意圖辨識"]
        S["檢索政策選擇"]
        R --> S
    end

    subgraph L3["檢索核心層"]
        direction LR
        BM["BM25 檢索"]
        P["共享 Top-20 候選池"]
        REC["Recency 重排序"]
        VA["Version-Aware<br/>譜系配對重排序"]
        BM --> P
        P --> REC
        P --> VA
    end

    subgraph L4["版本化證據儲存層"]
        direction LR
        OLD["OLD 歷史原子證據"]
        CUR["CURRENT 現行原子證據"]
        LIN["證據譜系與<br/>跨版本關係"]
        PROV["來源、年份、頁碼<br/>及 SHA-256"]
    end

    Q --> R
    Q --> BM
    S -- "一般現行查詢" --> REC
    S -- "明確跨版本查詢" --> VA
    REC --> O
    VA --> O
    OLD --> BM
    CUR --> BM
    LIN --> VA
    PROV --> O
```

**圖說：** 圖 1　Version-Aware RAG 分層系統架構。系統由查詢互動、檢索協調、檢索核心及版本化證據儲存四層構成；檢索協調層依查詢時間意圖選擇 Recency 或 Version-Aware 重排序，兩者共享相同的 BM25 Top-20 候選池。

## 圖 2　實驗凍結與一次性評估流程

```mermaid
flowchart TD
    A["建立原子證據、查詢<br/>與版本譜系"] --> B["檢索前審核<br/>與 SHA-256 凍結"]
    B --> C["Development<br/>方法選擇"]
    C --> D{"開發門檻<br/>通過？"}
    D -- "否" --> X["停止或另建<br/>開發週期"]
    D -- "是" --> E["一次性 Validation<br/>譜系互斥"]
    E --> F{"驗證門檻<br/>通過？"}
    F -- "否" --> X
    F -- "是" --> G["凍結最終政策並建立<br/>新鮮測試"]
    G --> H["一次性檢索<br/>不得讀取密封標註"]
    H --> I["解封、計分與<br/>獨立稽核"]
```

**圖說：** 圖 2　實驗凍結與一次性評估流程。方法僅能在 Development 階段選擇；Validation 與新鮮測試各執行一次，且檢索完成前不得讀取密封標註。
