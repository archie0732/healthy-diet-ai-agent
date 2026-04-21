# 台式便當飲食辨識系統：體積貢獻指數演算法說明文件
## 1. 演算法概述 (Algorithm Overview)

本系統採用 「體積貢獻指數法 (Volume Contribution Index Method)」 作為初步熱量評估的基準。不同於傳統影像處理中計算物理面積（Area）的邏輯，本演算法旨在透過 2D 邊界框（Bounding Box）的重疊特性，推估食物在 3D 空間中的相對體積貢獻。

## 2. 計算公式 (Mathematical Formula)

針對影像中辨識出的 n 個食物物件，每個物件 i 的體積貢獻比例 Ratioi​ 計算如下：
$`Ratio_i = \frac{Area_{bbox\_i}}{\sum_{j=1}^{n} Area_{bbox\_j}}`$

其中：

- $`Area_bbox\_i`$：第 i 個食物物件 Bounding Box 的像素面積（寬 × 高）。

- $`\sum_{j=1}^{n} Area_{bbox\_j}`$：所有被辨識物件之 Bounding Box 面積的總和。

## 3. 設計哲學與優勢 (Design Philosophy & Advantages)
### 3.1 解決「肉蓋飯」的堆疊問題 (Handling Food Overlap)

在台式便當情境中，主菜（如排骨、雞腿）經常直接覆蓋於主食（白飯）之上。

  - 傳統作法： 若採用幾何聯集（Union）計算平面面積，被遮蓋的白飯面積會被扣除，導致嚴重低估主食份量。

  - 本系統作法： 透過直接加總所有 Bounding Box 面積，重疊區域的像素會被重複計算。這種「重複計算」在物理意義上剛好對應了食物的垂直堆疊（厚度）。因此，加總後的總分母能更準確地反映整餐食物的「總物理量」而非僅是「表面積」。

## 3.2 拍攝距離的魯棒性 (Robustness to Camera Distance)

由於採用相對比例（Ratio）計算，系統對於使用者拍攝時的距離（手機拿高或拿低）具有高度的魯棒性。只要食物主體皆被 YOLO 成功標定，最終產出的佔比將保持穩定，不會因像素絕對值的改變而產生劇烈偏差。

## 3.3 計算效能優化 (Computational Efficiency)

相較於複雜的實例分割（Instance Segmentation）或多邊形幾何運算，本方法僅需進行基礎的代數加減乘除，極大地降低了後端伺服器的運算負擔，能實現近乎即時（Real-time）的辨識回饋。

## 4. 系統實作與流程 (Implementation Workflow)

  - 視覺萃取層 (Vision Layer)： Rust 後端接收圖片並執行 YOLOv11/v12 進行物件定位。

  - 特徵工程層 (Feature Engineering)： 計算各物件之像素面積，並得出體積貢獻指數。

  - 草稿儲存層 (Persistence Layer)： 將結果存入 Supabase diet_drafts 資料表，並產生唯一 UUID (draft_id)。

  - 人工智慧代理層 (AI Agent Layer)： 使用者透過自然語言修正後，由本地 LLM Agent 讀取此比例，並乘上動態烹調係數完成最終熱量推算。

## 5. 未來展望 (Future Work)

目前演算法雖能有效處理堆疊，但對於食物高度（Z軸）的估算仍基於統計平均值。未來計畫引入深度資訊（如利用手機 LiDAR 或雙鏡頭視差數據）以進一步強化體積推算的精確度。
