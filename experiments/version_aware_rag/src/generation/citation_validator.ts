import type { CorpusChunk } from '../corpus/types';

export interface CitationValidationResult {
  valid: boolean;
  validCitationIds: string[];
  invalidCitationTokens: string[];
  uncitedMaterialSegments: string[];
}

const BRACKET_TOKEN = /\[([^\]\n]+)\]/g;

function isMaterial(segment: string): boolean {
  const plain = segment.replace(BRACKET_TOKEN, '').replace(/^[-*#>\s]+/, '').trim();
  if (!plain || plain.endsWith('?')) return false;
  if (/^(based (only )?on( the)? supplied evidence|based on|answer|evidence|sources?)\s*:?$/i.test(plain)) return false;
  if (/^(insufficient evidence|i cannot determine|the supplied evidence is insufficient)/i.test(plain)) return false;
  return plain.split(/\s+/).length >= 4;
}

export function validateAnswerCitations(answer: string, allowedChunkIds: readonly string[]): CitationValidationResult {
  const allowed = new Set(allowedChunkIds);
  const validCitationIds = new Set<string>();
  const invalidCitationTokens = new Set<string>();
  const uncitedMaterialSegments: string[] = [];
  const segments = answer.split(/(?<=[.!?])\s+|\n+/).map((value) => value.trim()).filter(Boolean);

  for (const segment of segments) {
    const tokens = [...segment.matchAll(BRACKET_TOKEN)].map((match) => match[1].trim());
    const validTokens = tokens.filter((token) => allowed.has(token));
    validTokens.forEach((token) => validCitationIds.add(token));
    tokens.filter((token) => !allowed.has(token)).forEach((token) => invalidCitationTokens.add(token));
    if (isMaterial(segment) && validTokens.length === 0) uncitedMaterialSegments.push(segment);
  }

  return {
    valid: invalidCitationTokens.size === 0 && uncitedMaterialSegments.length === 0,
    validCitationIds: [...validCitationIds],
    invalidCitationTokens: [...invalidCitationTokens],
    uncitedMaterialSegments
  };
}

export function buildCitationSafeFallback(chunks: readonly CorpusChunk[]): string {
  if (chunks.length === 0) return 'The supplied evidence is insufficient to answer this question.';
  const lines = chunks.map((chunk) => {
    const normalized = chunk.text.replace(/\s+/g, ' ').trim();
    const excerpt = normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
    return `- The supplied passage states: “${excerpt}” [${chunk.chunk_id}]`;
  });
  return `Based only on the supplied evidence:\n${lines.join('\n')}`;
}
