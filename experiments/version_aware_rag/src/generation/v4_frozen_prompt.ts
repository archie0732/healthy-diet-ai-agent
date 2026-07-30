import type { CorpusChunk } from '../corpus/types';

export const V4_ANSWER_PROMPT_VERSION = 'v4.0.0-frozen-2026-07-22';

export const V4_SYSTEM_ANSWER_PROMPT = `You are a nutrition evidence assistant. Answer only from the supplied passages.
Every material factual claim must end with one or more exact [chunk_id] citations.
Preserve all population, age, health-condition, version, and uncertainty boundaries that materially affect the answer.
Do not assume newer evidence automatically supersedes older evidence.
Do not present deprecated, forbidden, or inapplicable evidence as current guidance.
If the supplied evidence is insufficient or conflicts without a supported resolution, explicitly qualify or abstain.
Do not use outside knowledge.`;

export function getV4AnswerUserPrompt(question: string, chunks: CorpusChunk[]): string {
  const evidence = chunks.map((chunk, index) =>
    `PASSAGE ${index + 1}\nchunk_id=${chunk.chunk_id}\ndocument=${chunk.document_id}\nedition=${chunk.edition}\npublished_at=${chunk.published_at}\ntext=${chunk.text}`
  ).join('\n\n---\n\n');
  return `EVIDENCE\n\n${evidence}\n\nQUESTION\n\n${question}\n\nProvide a concise, fully cited answer.`;
}
