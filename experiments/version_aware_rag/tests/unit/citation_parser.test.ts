import { describe, expect, test } from "bun:test";
import { CitationParser } from "../../src/generation/citation_parser";

describe("citation parser", () => {
  test("extracts chunk IDs from text brackets", () => {
    const text = "According to [dga-2025-page-3-pass-0-abcdef12] and [dga-2020-page-7-pass-1-1234abcd], protein is good. However, [dga-2025-page-3-pass-0-abcdef12] is newer.";
    const citations = CitationParser.extractCitations(text);
    
    expect(citations.length).toBe(2);
    expect(citations).toContain("dga-2025-page-3-pass-0-abcdef12");
    expect(citations).toContain("dga-2020-page-7-pass-1-1234abcd");
  });

  test("validates parsed citations against retrieved set", () => {
    const citations = ["dga-2025-page-3-pass-0-abcdef12", "invalid-id"];
    const retrieved = ["dga-2025-page-3-pass-0-abcdef12", "dga-2020-page-7-pass-0-f9b0e522"];
    
    const val = CitationParser.validateCitations(citations, retrieved);
    expect(val.valid).toEqual(["dga-2025-page-3-pass-0-abcdef12"]);
    expect(val.invalid).toEqual(["invalid-id"]);
  });
});
