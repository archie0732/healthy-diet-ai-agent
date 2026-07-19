import { describe, expect, test } from "bun:test";
import { parseMarkdownPages } from "../../src/corpus/parse_markdown_pages";
import * as path from "path";
import * as fs from "fs";

describe("parseMarkdownPages", () => {
  test("correctly parses pages and offsets from mock markdown", () => {
    const tempFile = path.resolve(process.cwd(), "temp_mock_pages.md");
    const mockContent = `## Page 1
First page text is here.
It has multiple lines.

## Page 2
Second page text is here.
`;
    fs.writeFileSync(tempFile, mockContent, "utf8");
    try {
      const pages = parseMarkdownPages(tempFile);
      expect(pages.length).toBe(2);
      
      expect(pages[0].page_number).toBe(1);
      expect(pages[0].text).toBe("First page text is here.\nIt has multiple lines.");
      expect(pages[0].char_start).toBe(mockContent.indexOf("First page text"));
      expect(pages[0].char_end).toBe(mockContent.indexOf("First page text") + pages[0].text.length);

      expect(pages[1].page_number).toBe(2);
      expect(pages[1].text).toBe("Second page text is here.");
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test("throws error when file is missing", () => {
    expect(() => parseMarkdownPages("nonexistent.md")).toThrow(/File not found/);
  });
});
