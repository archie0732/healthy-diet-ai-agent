# healthy-diet-ai-agent

- path

```md
/opt/Diet-Manager-Agent/
├── src/                              # Express API 伺服器核心
│   ├── index.ts                      # 路由入口 (處理 Rust 發來的請求)
│   ├── agent_factory.ts              # 負責建立「不同模式」Agent 的工廠函式
│   └── database/                     # Supabase 連線與基礎設定
│       └── supabase_client.ts
├── knowledge_base/                   # 🧠 系統全局知識 (實體檔案)
│   ├── AGENT.md                      # Agent 的最高行為準則
│   └── NUTRITION_RULES.md            # 最新的飲食與醫學規則 (Admin 學習模式寫入目標)
├── users_images/                     # 🖼️ 唯一的本地儲存區 (依 user 分層)
│   └── user_123/
│       ├── raw_lunch.jpg             # 原始上傳圖片
│       └── bbox_lunch.jpg            # Sharp 畫好外框的圖片
└── agent_skills/                     # ⭐️ 技能膠囊化 (Prompt + Tools)
    ├── vision_analyzer/              
    │   ├── SKILL.md                  # 辨識指令與 JSON 輸出格式要求
    │   ├── draw_bbox.ts              # Sharp 畫框實作
    │   └── vision_model.ts           # 呼叫 Gemma 多模態的邏輯
    ├── calorie_calculator/           
    │   ├── SKILL.md                  # 營養素加總規則
    │   └── calc_tools.ts             # 數學計算工具
    ├── supabase_logger/              
    │   ├── SKILL.md                  # 寫入資料庫的欄位對應規則
    │   └── db_tools.ts               # insert_diet_log 實作
    └── admin_knowledge/              # 專屬管理員的技能
        ├── SKILL.md                  # 如何總結長篇論文的指示
        └── file_tools.ts             # 寫入 NUTRITION_RULES.md 的工具
```
