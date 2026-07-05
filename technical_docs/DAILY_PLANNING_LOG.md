# 資料處理

紀錄今日做了什麼的紀錄，包含操考資料

---

- 2026-07-15

今日目的:

1. 蒐集參考資料
2. 設計實驗

- 實作:

原本是使用國民飲食指南，但是找不到舊版的，所以換使用美國的飲食指南

目前已經蒐集了 2015-2030 的美國飲食指南，並且先將其轉換為markdown，圖表改為使用文字敘述。

>資料轉換(pdf to md) -> src/rag_clean/pdf_to_clean_markdown.py (使用 gemini3.5 編寫)
>
>資料處裡: 使用 gemini3.5 進行檢查

- 參考資料

1. [107 新版 國民飲食指南手冊](https://www.hpa.gov.tw/Pages/ashx/GetFile.ashx?lang=c&type=1&sid=2bdfa986bf79482bb3d5f4c8315fc968)
2. [Dietary-Guidelines-for-Americans-2025-2030](https://cdn.realfood.gov/DGA.pdf)
3. [Dietary-Guidelines-for-Americans-2020-2025](https://asphn.org/wp-content/uploads/2021/03/Dietary-Guidelines-for-Americans-2020-2025.pdf)
4. [Dietary-Guidelines-for-Americans-2015-2020](https://odphp.health.gov/sites/default/files/2019-09/2015-2020_Dietary_Guidelines.pdf)
