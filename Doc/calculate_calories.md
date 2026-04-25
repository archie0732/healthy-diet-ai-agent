




「在 Agent 工具的實作上，我選擇將計算邏輯封裝於 n8n 內部的 Sandboxed Code Environment 中，而非建立獨立的微服務。這樣做可以有效減少跨服務調用 (RPC) 的網路延遲，並確保熱量計算邏輯與 AI 調度流程緊密結合。」
