import argparse
import os
import re
import sys

import pdfplumber

# 設定標準輸出為 UTF-8 編碼，防止 Windows 環境下的編碼衝突
sys.stdout.reconfigure(encoding="utf-8")


def format_markdown_table(table):
    """
    將 pdfplumber 提取的表格（List of lists）格式化為標準 Markdown 表格
    """
    if not table:
        return ""
    cleaned_table = []
    for row in table:
        if not row:
            continue
        cleaned_row = [
            str(cell).replace("\n", " ").strip() if cell is not None else ""
            for cell in row
        ]
        if any(cleaned_row):
            cleaned_table.append(cleaned_row)
    if not cleaned_table:
        return ""

    headers = cleaned_table[0]
    if not any(headers):
        headers = [f"Column {i + 1}" for i in range(len(headers))]
    rows = cleaned_table[1:]

    markdown = "| " + " | ".join(headers) + " |\n"
    markdown += "| " + " | ".join(["---"] * len(headers)) + " |\n"
    for row in rows:
        if len(row) < len(headers):
            row += [""] * (len(headers) - len(row))
        row = row[: len(headers)]
        markdown += "| " + " | ".join(row) + " |\n"
    return markdown


def generate_table_text_description(table, page_num, table_idx):
    """
    將二維數據表格的每一行，依據表頭翻譯成 Prose (自然語言敘述) 格式，
    極大提升 RAG 的語意對齊與數值檢索能力。
    """
    if not table:
        return ""
    cleaned_table = []
    for row in table:
        if not row:
            continue
        cleaned_row = [
            str(cell).replace("\n", " ").strip() if cell is not None else ""
            for cell in row
        ]
        if any(cleaned_row):
            cleaned_table.append(cleaned_row)

    if not cleaned_table:
        return ""

    headers = cleaned_table[0]
    if not any(headers):
        headers = [f"Column {i + 1}" for i in range(len(headers))]
    rows = cleaned_table[1:]

    desc_lines = []
    desc_lines.append(
        f"**Detailed Table Data Explanation**: Table {table_idx} on Page {page_num} details the following data points in prose format:"
    )

    for r_idx, row in enumerate(rows):
        if len(row) < len(headers):
            row += [""] * (len(headers) - len(row))
        row = row[: len(headers)]

        cleaned_cells = []
        for c_idx, cell in enumerate(row):
            val = str(cell).replace("\n", " ").strip() if cell is not None else ""
            header_name = (
                str(headers[c_idx]).replace("\n", " ").strip()
                if headers[c_idx]
                else f"Column {c_idx + 1}"
            )
            if val:
                cleaned_cells.append(f"{header_name} is '{val}'")

        if cleaned_cells:
            desc_lines.append(f"- Row {r_idx + 1}: " + ", ".join(cleaned_cells) + ".")

    return "\n".join(desc_lines)


def convert_pdf_to_markdown(pdf_path, md_path):
    """
    將單一 PDF 轉譯為初步的 Markdown 格式，包含 Markdown 表格、數據文字化與圖表上下文標記
    """
    print(f"正在轉換: {pdf_path} -> {md_path}")
    markdown_content = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1
            text = page.extract_text() or ""
            tables = page.extract_tables()

            page_md = f"## Page {page_num}\n\n"
            page_md += text + "\n\n"

            # 處理表格
            if tables:
                page_md += f"### Tables on Page {page_num}\n\n"
                for t_idx, table in enumerate(tables):
                    md_table = format_markdown_table(table)
                    if md_table:
                        page_md += f"#### Table {t_idx + 1}\n\n"
                        page_md += md_table + "\n"
                        # 生成逐行文字化數據轉錄
                        detailed_desc = generate_table_text_description(
                            table, page_num, t_idx + 1
                        )
                        if detailed_desc:
                            page_md += detailed_desc + "\n\n"

            # 處理非表格圖表上下文錨點
            if "figure" in text.lower() or "chart" in text.lower():
                lines = text.split("\n")
                fig_lines = [
                    line.strip()
                    for line in lines
                    if "figure" in line.lower() or "chart" in line.lower()
                ]
                if fig_lines:
                    page_md += f"### Figure/Chart Context on Page {page_num}\n\n"
                    for fl in fig_lines[:3]:
                        page_md += f'> **Visual Guideline Note**: Found reference to figure/chart: "{fl}". This chart displays visual trend data supporting the dietary guidance described in the page text above.\n\n'

            markdown_content.append(page_md)

    os.makedirs(os.path.dirname(md_path), exist_ok=True)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n\n---\n\n".join(markdown_content))
    print(f"已儲存初步 Markdown 至 {md_path}")


def clean_markdown_headers_footers_dots(md_path, year_range):
    """
    清洗 Markdown 檔案，移除運行頁首尾、物理獨立頁碼，並清理目錄中的虛線導線
    """
    print(
        f"正在清洗 {os.path.basename(md_path)} 中的頁首尾與目錄導線 (版本: {year_range})"
    )
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()

    pages = content.split("## Page ")
    cleaned_pages = []

    # 運行頁首尾正則表達式
    running_patterns = {
        "2015-2020": re.compile(
            r".*Page\s+[ivxlcdm\d]+\s*.*2015-2020\s+Dietary\s+Guidelines\s+for\s+Americans.*",
            re.IGNORECASE,
        ),
        "2020-2025": re.compile(
            r"^Dietary Guidelines for Americans, 2020–2025\s*\|\s*\d+$", re.IGNORECASE
        ),
        "2025-2030": re.compile(
            r"^Dietary Guidelines for Americans, 2025–2030\s*\|\s*\d+$", re.IGNORECASE
        ),
    }

    pat = running_patterns.get(year_range)
    dot_pattern = re.compile(r"\s*\.{5,}\s*([a-z\d]+)?\s*$", re.IGNORECASE)

    removed_running_count = 0
    removed_standalone_count = 0
    removed_dots_count = 0

    # 物理第 0 頁（開頭部分）
    cleaned_pages.append(pages[0])

    for page_idx in range(1, len(pages)):
        page_content = pages[page_idx]
        lines = page_content.split("\n")

        # 提取並保留我們生成的 markdown 物理頁碼標記行 (## Page X 中的 X)
        header_page_num_line = lines[0]
        body_lines = lines[1:]

        processed_body_lines = []
        for line in body_lines:
            stripped = line.strip()
            # 清除 PDF 夾帶的運行頁首尾行
            if pat and pat.match(stripped):
                removed_running_count += 1
                continue
            # 清理目錄（TOC）點點導線與頁碼
            if dot_pattern.search(line):
                line = dot_pattern.sub("", line)
                removed_dots_count += 1
            processed_body_lines.append(line)

        # 移除正文開頭的空行
        while processed_body_lines and not processed_body_lines[0].strip():
            processed_body_lines.pop(0)

        # 檢查正文開頭是否包含 PDF 原生殘留的獨立頁碼行（數字或羅馬數字）
        if processed_body_lines:
            first_line = processed_body_lines[0].strip()
            if re.match(r"^\d+$", first_line) or re.match(
                r"^[ivxlcdm]+$", first_line, re.IGNORECASE
            ):
                removed_standalone_count += 1
                processed_body_lines.pop(0)

        # 移除正文結尾的空行
        while processed_body_lines and not processed_body_lines[-1].strip():
            processed_body_lines.pop()

        # 移除結尾的 markdown 虛線分隔符以利校對
        has_separator = False
        if processed_body_lines and processed_body_lines[-1].strip() == "---":
            has_separator = True
            processed_body_lines.pop()
            while processed_body_lines and not processed_body_lines[-1].strip():
                processed_body_lines.pop()

        # 檢查正文結尾是否包含 PDF 原生殘留的獨立頁碼行
        if processed_body_lines:
            last_line = processed_body_lines[-1].strip()
            if re.match(r"^\d+$", last_line) or re.match(
                r"^[ivxlcdm]+$", last_line, re.IGNORECASE
            ):
                removed_standalone_count += 1
                processed_body_lines.pop()

        if has_separator:
            processed_body_lines.append("")
            processed_body_lines.append("---")

        # 重新拼接並放回頁面中
        cleaned_page = header_page_num_line + "\n" + "\n".join(processed_body_lines)
        cleaned_pages.append(cleaned_page)

    cleaned_content = "## Page ".join(cleaned_pages)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(cleaned_content)

    print(f"清洗 {os.path.basename(md_path)} 完成:")
    print(f"  - 移除了 {removed_running_count} 行頁首尾執行標記")
    print(f"  - 移除了 {removed_standalone_count} 個獨立 PDF 頁碼行")
    print(f"  - 移除了 {removed_dots_count} 個目錄導線 pattern")


def main():
    # 預設路徑解析（相對於此腳本目錄外層的 raw_data）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_pdf_dir = os.path.abspath(os.path.join(script_dir, "..", "..", "raw_data"))
    default_output_dir = os.path.join(default_pdf_dir, "markdown")

    parser = argparse.ArgumentParser(
        description="美國膳食指南 PDF 轉 Markdown 與圖表數據文字化清洗工具"
    )
    parser.add_argument(
        "--pdf_dir",
        type=str,
        default=default_pdf_dir,
        help="PDF 原始檔所在的資料夾路徑",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default=default_output_dir,
        help="Markdown 輸出資料夾路徑",
    )
    args = parser.parse_args()

    files = [
        ("Dietary-Guidelines-for-Americans-2015-2020.pdf", "2015-2020"),
        ("Dietary-Guidelines-for-Americans-2020-2025.pdf", "2020-2025"),
        ("Dietary-Guidelines-for-Americans-2025-2030.pdf", "2025-2030"),
    ]

    print("=" * 60)
    print(f"PDF 資料夾路徑: {args.pdf_dir}")
    print(f"Markdown 輸出資料夾路徑: {args.output_dir}")
    print("=" * 60)

    for filename, year_range in files:
        pdf_path = os.path.join(args.pdf_dir, filename)
        if not os.path.exists(pdf_path):
            print(f"⚠️ 找不到檔案: {pdf_path}，跳過處理。")
            continue

        md_filename = filename.replace(".pdf", ".md")
        md_path = os.path.join(args.output_dir, md_filename)

        # 1. 轉譯 PDF 到 Markdown
        convert_pdf_to_markdown(pdf_path, md_path)

        # 2. 清洗多餘的頁碼、頁首尾與導線
        clean_markdown_headers_footers_dots(md_path, year_range)
        print("=" * 60)


if __name__ == "__main__":
    main()
