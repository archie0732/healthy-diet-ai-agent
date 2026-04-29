---
name: database_logger
description: 雲端資料庫雙向讀寫工具。
---

## 1. 執行步驟 (SOP)
### 階段一：背景檢索 (Context Check)
- 當任務開始時，若已知 `user_id` 或 `room_id`，應優先呼叫 `get_user_profile` 與 `get_chat_history`。
- 檢查使用者的 `taboo` (忌口) 或 `disease` (疾病)，確保建議不觸雷。

### 階段二：分析與寫入
- 進行視覺辨識與計算後，結合第一階段取得的背景資料給予建議。
- 任務結束前，務必呼叫 `log_diet_history` 存檔。
