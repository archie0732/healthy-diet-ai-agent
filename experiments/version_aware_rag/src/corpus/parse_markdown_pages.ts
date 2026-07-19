import * as fs from 'fs';

export interface ParsedPage {
  page_number: number;
  text: string;
  char_start: number;
  char_end: number;
}

/**
 * Parses a normalized markdown file into pages based on "## Page N" headers.
 * Extracts the page text and records character offsets relative to the full file.
 */
export function parseMarkdownPages(filePath: string): ParsedPage[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for parsing: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const pages: ParsedPage[] = [];

  // Match lines that are "## Page N" or "---## Page N" (where N is one or more digits)
  const regex = /(?:^|---)## Page\s+(\d+)\s*$/gm;
  let match: RegExpExecArray | null;
  const matches: { pageNum: number; index: number; length: number }[] = [];

  while ((match = regex.exec(content)) !== null) {
    matches.push({
      pageNum: parseInt(match[1], 10),
      index: match.index,
      length: match[0].length
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    
    // Body text starts after the "## Page N" header line
    const bodyStart = current.index + current.length;
    const bodyEnd = next ? next.index : content.length;
    
    // We want the exact text, preserving newlines, but trimmed at ends
    const pageTextRaw = content.substring(bodyStart, bodyEnd);
    const pageText = pageTextRaw.trim();
    
    // Compute trimmed offsets
    const trimStartOffset = pageTextRaw.indexOf(pageText);
    const finalStart = bodyStart + (trimStartOffset >= 0 ? trimStartOffset : 0);
    const finalEnd = finalStart + pageText.length;

    pages.push({
      page_number: current.pageNum,
      text: pageText,
      char_start: finalStart,
      char_end: finalEnd
    });
  }

  return pages;
}
