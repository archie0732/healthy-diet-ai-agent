import * as fs from 'fs';
import * as path from 'path';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { DenseRetriever } from '../../src/retrieval/dense';
import { CorpusChunk } from '../../src/corpus/types';

function main() {
  const rootDir = process.cwd();
  
  const chunksJsonlPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const indexCachePath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/index.json');

  console.log('Building search index artifacts...');
  console.log(`Corpus file: ${chunksJsonlPath}`);

  if (!fs.existsSync(chunksJsonlPath)) {
    console.error(`Error: Corpus chunks file does not exist at ${chunksJsonlPath}. Please run build_corpus first.`);
    process.exit(1);
  }

  try {
    const chunkLines = fs.readFileSync(chunksJsonlPath, 'utf8').split('\n').filter(Boolean);
    const chunks: CorpusChunk[] = chunkLines.map(line => JSON.parse(line));

    console.log(`Loading ${chunks.length} chunks into BM25 Index...`);
    const bm25 = new BM25Retriever(chunks);

    console.log(`Loading ${chunks.length} chunks into Dense/Trigram Index...`);
    const dense = new DenseRetriever(chunks);

    // Save index metadata cache
    const cache = {
      timestamp: new Date().toISOString(),
      chunks_count: chunks.length,
      bm25_initialized: true,
      dense_initialized: true,
    };

    fs.writeFileSync(indexCachePath, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`Search indices built successfully! Cache saved to ${indexCachePath}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Index construction failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
