import { CorpusChunk } from '../corpus/types';

export const PROMPT_VERSION_V3 = 'v3.0.0';

export const SYSTEM_ANSWER_PROMPT = `
You are an expert nutrition AI assistant. Answer the user's question accurately using ONLY the provided evidence.

Strict Rules:
1. Cite your sources using the format "[chunk_id]" at the end of each sentence or claim.
2. If the guidelines mention exceptions or target group conditions (e.g. highly active individuals vs general population), explain those applicable conditions clearly.
3. If the evidence contains conflicting guidelines from different editions that cannot be resolved by version policies, explicitly disclose the uncertainty.
4. Do NOT make any claims that cannot be directly supported by the provided evidence.
`;

export function getAnswerUserPrompt(question: string, retrievedChunks: CorpusChunk[]): string {
  const evidenceLines = retrievedChunks.map((c, i) => 
    `Evidence [${i+1}] (ID: ${c.chunk_id}, Edition: ${c.edition}, Published: ${c.published_at}):\n"${c.text}"\n`
  );

  return `
Evidence Chunks:
----------------------------------------
${evidenceLines.join('\n----------------------------------------\n')}
----------------------------------------

Question: ${question}

Provide a concise answer citing the relevant chunk IDs.
`;
}

