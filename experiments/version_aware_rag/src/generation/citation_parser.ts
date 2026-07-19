export class CitationParser {
  /**
   * Extracts chunk IDs from the text inside brackets like [dga-2025-page-3-pass-0-xyz123ab].
   */
  public static extractCitations(text: string): string[] {
    // Regex matching chunk_id format (e.g. dga-2020-page-7-pass-0-f9b0e522)
    const regex = /\[(dga-\d{4}-page-\d+-pass-\d+-[a-f0-9]{8})\]/g;
    const matches = Array.from(text.matchAll(regex)).map(m => m[1]);
    return Array.from(new Set(matches));
  }

  /**
   * Validates if the parsed citations exist in the provided retrieved list.
   */
  public static validateCitations(
    citations: string[],
    retrievedIds: string[]
  ): {
    valid: string[];
    invalid: string[];
  } {
    const retrievedSet = new Set(retrievedIds);
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const cid of citations) {
      if (retrievedSet.has(cid)) {
        valid.push(cid);
      } else {
        invalid.push(cid);
      }
    }

    return { valid, invalid };
  }
}
