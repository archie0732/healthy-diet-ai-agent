import * as fs from 'fs';
import * as path from 'path';

function main() {
  const rootDir = process.cwd();
  const corpusPath = path.join(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const chunks = fs.readFileSync(corpusPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

  const dga2025 = chunks.filter(c => c.edition === '2025-2030');
  console.log(`Found ${dga2025.length} chunks in 2025-2030:`);

  dga2025.forEach(c => {
    console.log(`\n--- ${c.chunk_id} (Page ${c.page_number}, Pass ${c.passage_index}) ---`);
    console.log(c.text);
  });
}

main();
