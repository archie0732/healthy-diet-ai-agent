# YOLO CLI 使用說明 (Usage)

本工具為食物辨識與營養分析系統的推論核心，支援經由指令列 (CLI) 呼叫並輸出標準 JSON 格式結果，方便與 Rust 等後端系統進行整合。

---

## 1. 環境安裝 (Installation)

請確保您的環境已安裝 Python 3.8+，並執行以下指令安裝必要的依賴套件：

```bash
pip install -r requirements.txt
```

## 2. 執行指令 (Command Line Interface)

使用```predict.py```進行影像辨識。基本執行格式如下：

```bash
python predict.py --input [image_path] [options]
```

### 參數清單 (Option List)

| 參數 (Option)  | 說明 (Description)       | 預設值 (Default) |
| -------------- | ------------------------ | ---------------- |
| ```--input```  | 待辨識的圖片路徑         | -                |
| ```--model```  | YOLO 模型檔案路徑        | models/best.pt   |
| ```--output``` | 執行結果匯出的根目錄位置 | ./results        |
| ```--conf```   | 偵測信心度門檻           | 0.5              |

### 執行範例 (Example)

```bash
python predict.py --input "./test.jpg" --conf 0.8 --output "./my_results"
```

## 3. 輸出結果 (Outputs)

執行完成後，系統會同步於Terminal (Stdout)輸出 JSON 數據，並在輸出目錄下產生以下檔案：

- 結果圖片: 儲存於 {output}/images/，包含畫好的辨識框與標籤。
- JSON 檔: 儲存於 {output}/json/，記錄偵測數據。

### 標準輸出格式 (JSON Format)

```json
{
    "status": "success",
    "image_path": "C:\\absolute\\path\\to\\result.jpg",
    "json_path": "C:\\absolute\\path\\to\\result.json",
    "detections": [
        {
            "class": "apple",
            "confidence": 0.942,
            "bbox": [100, 200, 350, 500]
        }
    ]
}
```

## 4.錯誤處理 (Error Handling)

若執行失敗（如：圖片路徑錯誤、模型遺失），會透過 Stderr 輸出錯誤訊息，並回傳 exit code 1：

```json
{"status": "error",
 "message": "無法讀取圖片: path/to/image.jpg"}
```
