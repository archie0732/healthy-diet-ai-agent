import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { parseMarkdownPages, ParsedPage } from './parse_markdown_pages';
import { segmentPage, SegmentedPassage } from './segment_passages';
import { assignTopicsAndMetadata, ExtractedMetadata } from './assign_topics';
import { getFileChecksum } from '../../../../src/shared/hash';
import { CorpusChunk, DocumentMetadata } from './types';

function computeTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * Re-runs the v2 keyword topic heuristics to identify what legacy chunk IDs would have been created.
 */
function getLegacyChunkIds(docId: string, pageNum: number, pageText: string): string[] {
  const bodyLower = pageText.toLowerCase();
  const matchedLineages: string[] = [];

  if (bodyLower.includes('dairy') || bodyLower.includes('milk')) {
    matchedLineages.push('lineage-dairy');
  }
  if (bodyLower.includes('protein') || bodyLower.includes('meat') || bodyLower.includes('egg')) {
    matchedLineages.push('lineage-protein');
  }
  if (bodyLower.includes('added sugar') || bodyLower.includes('sugars')) {
    matchedLineages.push('lineage-sugars');
  }
  if (bodyLower.includes('sweetener') || bodyLower.includes('aspartame')) {
    matchedLineages.push('lineage-sweeteners');
  }
  if (bodyLower.includes('cholesterol')) {
    matchedLineages.push('lineage-cholesterol');
  }
  if (bodyLower.includes('alcohol') || bodyLower.includes('drink')) {
    matchedLineages.push('lineage-alcohol');
  }
  if (bodyLower.includes('whole grain') || bodyLower.includes('refined carbohydrate')) {
    matchedLineages.push('lineage-whole-grains');
  }
  if (bodyLower.includes('sodium') || bodyLower.includes('salt')) {
    matchedLineages.push('lineage-sodium');
  }
  if (bodyLower.includes('processed') || (bodyLower.includes('nutrient-dense') && bodyLower.includes('calorie limits'))) {
    matchedLineages.push('lineage-processed-foods');
  }
  if (bodyLower.includes('vegetable') || bodyLower.includes('fruit')) {
    matchedLineages.push('lineage-veg-fruits');
  }

  if (matchedLineages.length === 0) {
    matchedLineages.push('lineage-general');
  }

  return matchedLineages.map(lineageId => `${docId}-page-${pageNum}-${lineageId}`);
}

/**
 * Orchestrates document reading, page parsing, passage segmentation, topic assignment, and saves the final chunks.jsonl.
 */
export function buildCorpus(documentsJsonPath: string, outputDir: string) {
  if (!fs.existsSync(documentsJsonPath)) {
    throw new Error(`Documents registry not found: ${documentsJsonPath}`);
  }

  const documents: DocumentMetadata[] = JSON.parse(fs.readFileSync(documentsJsonPath, 'utf-8'));
  const chunks: CorpusChunk[] = [];
  const legacyMapping: Record<string, string[]> = {};

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const doc of documents) {
    const docPath = path.resolve(process.cwd(), doc.normalized_path);
    console.log(`Processing document: ${doc.id} at ${docPath}`);
    
    // Verify checksum
    const currentChecksum = getFileChecksum(docPath);
    if (currentChecksum !== doc.source_checksum) {
      console.warn(`Warning: Checksum mismatch for ${doc.id}. Registry: ${doc.source_checksum}, Actual: ${currentChecksum}`);
    }

    const pages = parseMarkdownPages(docPath);
    console.log(`  Parsed ${pages.length} pages.`);

    for (const page of pages) {
      const passages = segmentPage(page);
      
      // Determine what legacy chunk IDs this page would map to
      const legacyIds = getLegacyChunkIds(doc.id, page.page_number, page.text);
      for (const legacyId of legacyIds) {
        if (!legacyMapping[legacyId]) {
          legacyMapping[legacyId] = [];
        }
      }

      passages.forEach((passage, index) => {
        const metadata = assignTopicsAndMetadata(passage.text);
        const textHash = computeTextHash(passage.text);
        
        // Build deterministic chunk_id
        const chunk_id = `${doc.id}-page-${page.page_number}-pass-${index}-${textHash}`;
        
        const chunk: CorpusChunk = {
          chunk_id,
          document_id: doc.id,
          edition: doc.edition,
          published_at: doc.published_at,
          source_url: doc.source_url,
          source_checksum: doc.source_checksum,
          page_number: page.page_number,
          passage_index: index,
          char_start: passage.char_start,
          char_end: passage.char_end,
          text: passage.text,
          ...metadata
        };

        chunks.push(chunk);

        // Map this new v3 chunk to any relevant legacy chunk IDs
        // A v3 chunk is mapped to a legacyId if the topic of that legacyId is in its topic_ids
        for (const legacyId of legacyIds) {
          const lineagePart = legacyId.split('-').slice(4).join('-'); // e.g. lineage-protein
          if (metadata.topic_ids.includes(lineagePart)) {
            legacyMapping[legacyId].push(chunk_id);
          } else if (lineagePart === 'lineage-general' && (metadata.topic_ids.length === 0 || metadata.lineage_id === null)) {
            // General or ambiguous mapping fallback
            legacyMapping[legacyId].push(chunk_id);
          }
        }
      });
    }
  }

  // Write chunks.jsonl
  const chunksJsonlPath = path.join(outputDir, 'chunks.jsonl');
  const jsonlContent = chunks.map(c => JSON.stringify(c)).join('\n');
  fs.writeFileSync(chunksJsonlPath, jsonlContent, 'utf-8');
  console.log(`Saved ${chunks.length} chunks to ${chunksJsonlPath}`);

  // Write legacy_mapping.json
  const mappingPath = path.join(outputDir, 'legacy_mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(legacyMapping, null, 2), 'utf-8');
  console.log(`Saved legacy mapping to ${mappingPath}`);
}
