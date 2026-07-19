import { describe, expect, test } from "bun:test";
import { segmentPage } from "../../src/corpus/segment_passages";

describe("segmentPage", () => {
  test("merges heading and short paragraph, keeps offsets correct", () => {
    const page = {
      page_number: 1,
      char_start: 0,
      char_end: 100,
      text: "### Dietary Sodium\n\nSodium intake should be limited to 2300 mg per day for the general population."
    };
    const passages = segmentPage(page);
    expect(passages.length).toBe(1);
    expect(passages[0].text).toContain("### Dietary Sodium");
    expect(passages[0].text).toContain("Sodium intake should be limited");
    expect(passages[0].char_start).toBe(0);
    expect(passages[0].char_end).toBe(page.text.length);
  });

  test("splits long paragraphs with overlap", () => {
    // Generate a long paragraph with more than 300 words
    const sentences = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i + 1} to make this paragraph very long.`);
    const longText = sentences.join(" ");
    const page = {
      page_number: 2,
      char_start: 10,
      char_end: 10 + longText.length,
      text: longText
    };
    
    const passages = segmentPage(page);
    expect(passages.length).toBeGreaterThan(1);
    
    // Check that we have overlap
    const p1 = passages[0];
    const p2 = passages[1];
    
    // The second passage should start before the first passage ends
    expect(p2.char_start).toBeLessThan(p1.char_end);
    
    // Check word counts are within limits
    for (const p of passages) {
      const words = p.text.split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(300);
      expect(words).toBeGreaterThanOrEqual(50); // should be reasonably sized
    }
  });
});
