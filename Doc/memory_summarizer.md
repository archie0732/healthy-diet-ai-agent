# 🧠 總結與記憶更新的四步邏輯

  1. 語意聆聽 (Semantic Parsing)：
    當你傳送一句話（例如：「我最近想開始吃全素」）時，Agent 的大腦會先將這句話與我們寫在 SKILL.md 裡的 SOP 進行比對。

  2. 意圖判定 (Intent Classification)：
    Agent 會自問：「這句話是在描述『單一事件』（如：今天吃什麼），還是在宣告『長期特徵』（如：過敏、疾病、飲食習慣改變）？」

        如果是單一事件 → 走正常的熱量計算與聊天流程。

        如果是長期特徵 → 觸發記憶更新流程。

  3. 參數萃取 (Entity Extraction)：
    一旦判定需要更新，Agent 會根據 summarizer_tools.ts 裡的 Zod Schema，自動把自然語言轉換成結構化參數：

        從「吃全素」萃取出 taboo_to_add: "全素"

        從「高尿酸」萃取出 disease_to_add: "高尿酸"

  4. 工具呼叫與回饋 (Tool Execution & Feedback)：
    Agent 暫停回覆，默默在後台呼叫 update_user_profile 把資料寫入 Supabase。收到成功訊號後，再將這份「我記住了」的資訊融入到給你的最終回覆中。
