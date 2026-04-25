# Gemma 4 E4B 本地端 AI 伺服器部署指南

## 系統架構簡介

本專案使用 Docker 與 llama.cpp 部署 Google Gemma 4 E4B (多模態版本)，提供相容於 OpenAI 格式的 API。同時搭配 Tailscale 建立虛擬區域網路 (VLAN)，實現跨網域 (如家中連線至學校) 的安全 API 呼叫，供後端服務進行餐點圖片辨識與 AI Agent 飲食諮詢分析。
系統與硬體需求

  - 作業系統： Windows 10/11

  - 顯示卡： NVIDIA GPU (硬體加速最佳化配置為 6GB VRAM)

  - 記憶體： 32GB RAM

  - 必備軟體：

  >    1. Docker Desktop (需開啟 WSL 2 整合)
  >    2. NVIDIA 驅動程式與 NVIDIA Container Toolkit
  >    3. Tailscale (用於跨網域內網穿透)

### 第一步：模型檔案下載

請前往 Hugging Face 下載以下兩個模型檔案，並統一放置於本機端指定的資料夾（例如：C:\llm_models）：

---
    **語言模型本體 (GGUF 格式)：**

    1. 檔案名稱：gemma-4-E4B-it-Q3_K_M.gguf

    - 用途：負責文字推論與 AI Agent 邏輯。

    2. 視覺投影模組 (Vision Module)：檔案名稱：mmproj-F16.gguf

    - 用途：使模型具備讀取與辨識圖片的能力。

預期的資料夾結構應如下：
```txt
C:\
└── llm_models\
    ├── gemma-4-E4B-it-Q3_K_M.gguf
    └── mmproj-F16.gguf
```

### 第二步：啟動 Docker 伺服器

開啟命令提示字元 (CMD) 或 PowerShell，執行以下指令以啟動 llama.cpp 伺服器。

- 啟動參數說明：

```
    -v "C:\llm_models:/models"：將本機端的模型資料夾掛載至容器內的 /models。

    -p 8080:8080：綁定對外通訊埠 8080。

    --n-gpu-layers 35：針對 6GB VRAM 的最佳化配置，將大部分神經網路層載入顯卡加速，剩餘層數由系統記憶體接管以防止記憶體溢出 (OOM)。
```

```bash
docker run --gpus all -v "C:\llm_models:/models" -p 8080:8080 ghcr.io/ggml-org/llama.cpp:server-cuda ^
  -m /models/gemma-4-E4B-it-Q3_K_M.gguf ^
  --mmproj /models/mmproj-F16.gguf ^
  --port 8080 ^
  --host 0.0.0.0 ^
  --n-gpu-layers 35
```

當終端機顯示 HTTP server listening 時，代表伺服器已成功啟動。

### 第三步：設定網路連線 (Tailscale)

為解決學校或內部網路防火牆無法直接對外開放連線的問題，本專案採用 Tailscale 建立點對點加密連線。

    於伺服器端主機與開發端主機（欲執行後端的電腦）皆安裝 Tailscale 軟體。

    使用相同的帳號登入雙邊的設備。

    於伺服器端的工作列獲取 Tailscale 分配的專屬內網 IP（例如：100.x.x.x），此即為後端 API 請求的目標網址。

### 第四步：API 串接範例

伺服器啟動後，將提供相容於 OpenAI 規格的 API 端點：
👉 http://<伺服器的_Tailscale_IP>:8080/v1/chat/completions
請求格式 (cURL 測試)

以下為快速驗證文字對話功能的測試指令：
DOS

```bash
curl http://100.x.x.x:8080/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\": \"gemma-4-e4b\", \"messages\": [{\"role\": \"user\", \"content\": \"請簡述健康飲食的三大原則。\"}]}"
```

## 開發注意事項

    多模態圖片輸入： 若需進行圖片辨識任務（如餐點熱量估算），請先將實體圖片檔案轉換為 Base64 字串，並以多模態 JSON 格式傳遞至 content 陣列中。

    模型名稱限制： 請求 JSON 中的 "model" 欄位為必填項目，但實際執行推論將一律以 Docker 啟動時掛載的實體模型檔案為準。


2026-4-25 @ arch1e
