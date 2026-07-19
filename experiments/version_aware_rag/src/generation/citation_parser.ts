export interface SentenceCitation {
  sentenceIndex: number;
  sentenceText: string;
  citations: string[];
  validCitations: string[];
  invalidCitations: string[];
}

export interface CitationValidationResult {
  allCitations: string[];
  valid: string[];
  invalid: string[];
  sentenceMappings: SentenceCitation[];
  hasInvalidCitations: boolean;
  hasMissingCitations: boolean;
  invalidCitationRate: number;
}

export class CitationParser {
  /**
   * Extracts any citation token inside brackets like [dga-2025-page-3-pass-0-xyz123ab] or [13] or [a].
   */
  public static extractCitations(text: string): string[] {
    const regex = /\[([^\]\s]+)\]/g;
    const matches = Array.from(text.matchAll(regex)).map(m => m[1].trim());
    return Array.from(new Set(matches));
  }

  /**
   * Parses sentence/claim level citations from answer text and checks against retrieved IDs.
   */
  public static parseSentenceCitations(
    text: string,
    retrievedIds: string[]
  ): CitationValidationResult {
    const retrievedSet = new Set(retrievedIds);
    const sentences = text
      .split(/(?<=[.!?\n])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const sentenceMappings: SentenceCitation[] = [];
    const allExtracted: string[] = [];
    const validSet = new Set<string>();
    const invalidSet = new Set<string>();
    let hasMissingCitations = false;

    sentences.forEach((sentence, idx) => {
      const extracted = CitationParser.extractCitations(sentence);
      allExtracted.push(...extracted);

      if (extracted.length === 0) {
        hasMissingCitations = true;
      }

      const validCites: string[] = [];
      const invalidCites: string[] = [];

      for (const cid of extracted) {
        if (retrievedSet.has(cid)) {
          validCites.push(cid);
          validSet.add(cid);
        } else {
          invalidCites.push(cid);
          invalidSet.add(cid);
        }
      }

      sentenceMappings.push({
        sentenceIndex: idx,
        sentenceText: sentence,
        citations: extracted,
        validCitations: validCites,
        invalidCitations: invalidCites
      });
    });

    const uniqueAll = Array.from(new Set(allExtracted));
    const valid = Array.from(validSet);
    const invalid = Array.from(invalidSet);
    const invalidCitationRate = uniqueAll.length > 0 ? parseFloat((invalid.length / uniqueAll.length).toFixed(4)) : 0;

    return {
      allCitations: uniqueAll,
      valid,
      invalid,
      sentenceMappings,
      hasInvalidCitations: invalid.length > 0,
      hasMissingCitations,
      invalidCitationRate
    };
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


