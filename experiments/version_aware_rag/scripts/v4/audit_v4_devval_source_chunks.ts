import { readFile } from 'node:fs/promises';
import path from 'node:path';

const corpusPath = path.join(process.cwd(), 'experiments/version_aware_rag/data/corpus_v4_devval_draft/chunks.jsonl');
const lines = (await readFile(corpusPath, 'utf8')).trim().split('\n');
const chunks = lines.map((line) => JSON.parse(line));
const recommendationPattern = /(WHO recommends|WHO suggests|Recommendations|Remarks for recommendation|This recommendation|These recommendations)/i;

const requestedDocument = process.argv[2];
const requestedPages = new Set((process.argv[3] ?? '').split(',').filter(Boolean).map(Number));
for (const documentId of [...new Set(chunks.map((chunk) => chunk.document_id))].sort()) {
  if (requestedDocument && documentId !== requestedDocument) continue;
  const matches = chunks
    .filter((chunk) => chunk.document_id === documentId)
    .filter((chunk) => requestedPages.size > 0 || recommendationPattern.test(chunk.text))
    .filter((chunk) => requestedPages.size === 0 || requestedPages.has(chunk.page_number))
    .filter((chunk, index, all) => requestedPages.size > 0 || all.findIndex((other) => other.page_number === chunk.page_number) === index)
    .map((chunk) => ({
      chunk_id: chunk.chunk_id,
      page_number: chunk.page_number,
      excerpt: chunk.text.replace(/\s+/g, ' ').slice(0, 900),
    }));
  console.log(JSON.stringify({ document_id: documentId, recommendation_pages: matches }, null, 2));
}
