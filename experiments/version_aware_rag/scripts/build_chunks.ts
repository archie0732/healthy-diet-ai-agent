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

/**
 * Splits normalized markdown into page-based chunks and structures them for indexing.
 */
export function buildChunksFromMarkdown(filePath: string, docId: string, version: string, year: number): RAGChunk[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const pages = content.split('## Page ');
  const chunks: RAGChunk[] = [];

  // Index 0 is the prologue before the first page marker
  for (let i = 1; i < pages.length; i++) {
    const pageContent = pages[i].trim();
    if (!pageContent) continue;

    const lines = pageContent.split('\n');
    const pageNumStr = lines[0].trim();
    const pageBody = lines.slice(1).join('\n').trim();

    // Map critical topics based on key terms on the page to assign lineage_id
    const matchedTopics: { topic: string; lineageId: string }[] = [];
    const bodyLower = pageBody.toLowerCase();

    if (bodyLower.includes('dairy') || bodyLower.includes('milk')) {
      matchedTopics.push({ topic: 'Dairy Fat Recommendation', lineageId: 'lineage-dairy' });
    }
    if (bodyLower.includes('protein') || bodyLower.includes('meat') || bodyLower.includes('egg')) {
      matchedTopics.push({ topic: 'Protein Intake Goals', lineageId: 'lineage-protein' });
    }
    if (bodyLower.includes('added sugar') || bodyLower.includes('sugars')) {
      matchedTopics.push({ topic: 'Added Sugars Limit', lineageId: 'lineage-sugars' });
    }
    if (bodyLower.includes('sweetener') || bodyLower.includes('aspartame')) {
      matchedTopics.push({ topic: 'Non-Nutritive Sweeteners', lineageId: 'lineage-sweeteners' });
    }
    if (bodyLower.includes('cholesterol')) {
      matchedTopics.push({ topic: 'Dietary Cholesterol Limit', lineageId: 'lineage-cholesterol' });
    }
    if (bodyLower.includes('alcohol') || bodyLower.includes('drink')) {
      matchedTopics.push({ topic: 'Alcohol Consumption Limit', lineageId: 'lineage-alcohol' });
    }
    if (bodyLower.includes('whole grain') || bodyLower.includes('refined carbohydrate')) {
      matchedTopics.push({ topic: 'Whole Grains Recommendation', lineageId: 'lineage-whole-grains' });
    }
    if (bodyLower.includes('sodium') || bodyLower.includes('salt')) {
      matchedTopics.push({ topic: 'Sodium Intake Limit', lineageId: 'lineage-sodium' });
    }
    if (bodyLower.includes('processed') || (bodyLower.includes('nutrient-dense') && bodyLower.includes('calorie limits'))) {
      matchedTopics.push({ topic: 'Processed Foods Intake', lineageId: 'lineage-processed-foods' });
    }
    if (bodyLower.includes('vegetable') || bodyLower.includes('fruit')) {
      matchedTopics.push({ topic: 'Vegetables and Fruits Consumption', lineageId: 'lineage-veg-fruits' });
    }

    if (matchedTopics.length === 0) {
      matchedTopics.push({ topic: 'General Dietary Advice', lineageId: 'lineage-general' });
    }

    for (const mt of matchedTopics) {
      chunks.push({
        chunk_id: `${docId}-page-${pageNumStr}-${mt.lineageId}`,
        doc_id: docId,
        version: version,
        published_year: year,
        topic: mt.topic,
        applicable_population: 'General Population',
        lineage_id: mt.lineageId,
        text: pageBody
      });
    }
  }

  return chunks;
}

function main() {
  const normalizedDir = path.join(__dirname, '..', 'data', 'normalized');
  const chunksDir = path.join(__dirname, '..', 'data', 'chunks');
  if (!fs.existsSync(chunksDir)) {
    fs.mkdirSync(chunksDir, { recursive: true });
  }

  const documents = [
    { name: 'Dietary-Guidelines-for-Americans-2015-2020.md', id: 'dga-2015', version: '2015-2020', year: 2015 },
    { name: 'Dietary-Guidelines-for-Americans-2020-2025.md', id: 'dga-2020', version: '2020-2025', year: 2020 },
    { name: 'Dietary-Guidelines-for-Americans-2025-2030.md', id: 'dga-2025', version: '2025-2030', year: 2026 }
  ];

  let allChunks: RAGChunk[] = [];
  for (const doc of documents) {
    const filePath = path.join(normalizedDir, doc.name);
    if (fs.existsSync(filePath)) {
      const docChunks = buildChunksFromMarkdown(filePath, doc.id, doc.version, doc.year);
      console.log(`Generated ${docChunks.length} chunks for ${doc.id}`);
      allChunks = allChunks.concat(docChunks);
    } else {
      console.warn(`File not found: ${filePath}`);
    }
  }

  const outPath = path.join(chunksDir, 'rag_chunks.json');
  fs.writeFileSync(outPath, JSON.stringify(allChunks, null, 2), 'utf-8');
  console.log(`Saved ${allChunks.length} total chunks to ${outPath}`);
}

if (require.main === module) {
  main();
}
