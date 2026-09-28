import fs from 'fs';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { loadDefaultAgentConfig } from '../src/config/agentConfig';
import { loadVersionAwareRetriever, searchVersionedGuidelines } from '../src/server/versionAwareRag';

export const searchVersionedGuidelinesTool = tool(
  async ({ query, top_k }) => {
    const config = (await loadDefaultAgentConfig()).versionAwareRag;
    if (!config || !config.enabled) {
      return JSON.stringify({ query, error: 'version_aware_rag_disabled', total_hits: 0, hits: [] });
    }
    if (!fs.existsSync(config.chunksFile) || !fs.existsSync(config.relationsFile)) {
      return JSON.stringify({ query, error: 'version_aware_rag_corpus_missing', total_hits: 0, hits: [] });
    }

    const retriever = loadVersionAwareRetriever(config.chunksFile, config.relationsFile);
    const topK = Math.max(1, Math.min(config.maxTopK, top_k ?? config.defaultTopK));
    return JSON.stringify(searchVersionedGuidelines(retriever, query, topK));
  },
  {
    name: 'search_versioned_guidelines_tool',
    description: [
      'Version-aware search over official WHO / WHO Europe nutrition guidelines that exist in several editions',
      '(2005-2026: wasting/acute malnutrition, antenatal nutrition supplements, HIV and infant feeding, complementary feeding,',
      'food marketing to children, nutrient profile models, haemoglobin cutoffs for anaemia, school food, fiscal policies).',
      'The corpus is English: ALWAYS write the query in English.',
      'For questions about what changed, the old/previous advice, or older vs current versions, phrase the query with',
      '"previous", "earlier", "historical" or "how did ... change" so the history router retrieves BOTH the older and the current evidence.',
      'Other queries prefer the newest edition. Each hit carries document_id, published_year, document_role and pdf_page_number;',
      'newer_version means the hit was later updated (do not present it as current guidance), older_version links to the edition it replaced.',
    ].join(' '),
    schema: z.object({
      query: z.string().min(1).describe('Search query in English.'),
      top_k: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Optional result count. Defaults to the configured value and is capped by the configured maximum.'),
    }),
  },
);
