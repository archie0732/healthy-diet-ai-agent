import * as fs from 'fs';
import * as path from 'path';

interface RAGChunk {
  chunk_id: string;
  doc_id: string;
  version: string;
  published_year: number;
  topic: string;
  applicable_population: string;
  lineage_id: string;
  text: string;
}

interface EvaluationPair {
  sample_id: string;
  topic: string;
  lineage_id: string;
  new_version: string;
  old_version: string;
  new_text: string;
  old_text: string;
  relation_label?: string;
  policy_label?: string;
  notes?: string;
}

/**
 * Pairs chunks with matching lineage_ids between different versions for conflict analysis.
 */
export function buildChunkPairs(chunks: RAGChunk[]): EvaluationPair[] {
  const pairs: EvaluationPair[] = [];
  const groups: { [lineageId: string]: RAGChunk[] } = {};

  // Group chunks by lineage_id
  for (const chunk of chunks) {
    if (chunk.lineage_id === 'lineage-general') continue;
    if (!groups[chunk.lineage_id]) {
      groups[chunk.lineage_id] = [];
    }
    groups[chunk.lineage_id].push(chunk);
  }

  let pairCount = 0;
  // Compare pairs of chunks across versions within each lineage
  for (const [lineageId, lineageChunks] of Object.entries(groups)) {
    // Sort by publication year ascending
    lineageChunks.sort((a, b) => a.published_year - b.published_year);
    
    // Create pairs for adjacent versions
    for (let i = 0; i < lineageChunks.length - 1; i++) {
      const oldChunk = lineageChunks[i];
      const newChunk = lineageChunks[i + 1];
      
      pairCount++;
      pairs.push({
        sample_id: `pair-${String(pairCount).padStart(3, '0')}`,
        topic: newChunk.topic,
        lineage_id: lineageId,
        new_version: newChunk.version,
        old_version: oldChunk.version,
        new_text: newChunk.text,
        old_text: oldChunk.text
      });
    }
  }

  return pairs;
}

function main() {
  const chunksPath = path.join(__dirname, '..', 'data', 'chunks', 'rag_chunks.json');
  const annotationsDir = path.join(__dirname, '..', 'data', 'annotations');
  if (!fs.existsSync(annotationsDir)) {
    fs.mkdirSync(annotationsDir, { recursive: true });
  }

  if (!fs.existsSync(chunksPath)) {
    console.error(`RAG chunks file not found: ${chunksPath}`);
    process.exit(1);
  }

  const chunks: RAGChunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  const pairs = buildChunkPairs(chunks);
  
  const outPath = path.join(annotationsDir, 'raw_evaluation_pairs.json');
  fs.writeFileSync(outPath, JSON.stringify(pairs, null, 2), 'utf-8');
  console.log(`Generated ${pairs.length} evaluation pairs. Saved to ${outPath}`);
}

if (require.main === module) {
  main();
}
