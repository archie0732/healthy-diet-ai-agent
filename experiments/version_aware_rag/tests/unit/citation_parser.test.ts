import { describe, expect, test } from "bun:test";
import { CitationParser } from "../../src/generation/citation_parser";

describe("citation parser", () => {
  test("extracts chunk IDs from text brackets", () => {
    const text = "According to [dga-2020-page-7-pass-0-f9b0e522], sodium intake should be limited.";
    const citations = CitationParser.extractCitations(text);
    expect(citations).toEqual(["dga-2020-page-7-pass-0-f9b0e522"]);
  });

  test("deduplicates repeated citations in text", () => {
    const text = "Claim A [dga-2020-page-7-pass-0-f9b0e522]. Claim B [dga-2020-page-7-pass-0-f9b0e522].";
    const citations = CitationParser.extractCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0]).toBe("dga-2020-page-7-pass-0-f9b0e522");
  });

  test("validates parsed citations against retrieved set (valid vs invalid)", () => {
    const retrieved = ["dga-2020-page-7-pass-0-f9b0e522", "dga-2025-page-3-pass-0-xyz123ab"];
    const parsed = ["dga-2020-page-7-pass-0-f9b0e522", "dga-2015-page-1-pass-0-unknown1"];

    const res = CitationParser.validateCitations(parsed, retrieved);
    expect(res.valid).toEqual(["dga-2020-page-7-pass-0-f9b0e522"]);
    expect(res.invalid).toEqual(["dga-2015-page-1-pass-0-unknown1"]);
  });

  test("parses sentence-level citations and flags invalid non-chunk-ID tokens like [13] or [a]", () => {
    const text = "First claim has source [dga-2020-page-7-pass-0-f9b0e522]. Second sentence cites invalid index [13] and [a].";
    const retrieved = ["dga-2020-page-7-pass-0-f9b0e522"];

    const res = CitationParser.parseSentenceCitations(text, retrieved);
    expect(res.sentenceMappings).toHaveLength(2);
    expect(res.hasInvalidCitations).toBe(true);
    expect(res.valid).toEqual(["dga-2020-page-7-pass-0-f9b0e522"]);
    expect(res.invalid).toEqual(["13", "a"]);
    expect(res.invalidCitationRate).toBe(0.6667);
  });

});
