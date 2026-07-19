import { Retriever, RetrievalContext, SearchResult } from './types';
import { CorpusChunk } from '../corpus/types';

const stopwords = new Set([
  'what', 'are', 'the', 'and', 'for', 'daily', 'serving', 'goals', 'consuming',
  'recommendation', 'intake', 'limit', 'limitations', 'rule', 'should', 'with',
  'this', 'that', 'from', 'about', 'how', 'many', 'of', 'is', 'a', 'in', 'or'
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

export class HeuristicRetriever implements Retriever {
  private chunks: CorpusChunk[];

  constructor(chunks: CorpusChunk[]) {
    this.chunks = chunks;
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    const queryTokens = tokenize(query.question);
    const results: SearchResult[] = [];

    for (const chunk of this.chunks) {
      const chunkTokens = tokenize(chunk.text);
      
      // Determine topic: map topic_ids or use topic property if exists
      let topicText = '';
      if ('topic' in chunk && typeof (chunk as any).topic === 'string') {
        topicText = (chunk as any).topic;
      } else if (chunk.topic_ids && chunk.topic_ids.length > 0) {
        topicText = chunk.topic_ids.map(id => id.replace('lineage-', '')).join(' ');
      }
      
      const topicTokens = tokenize(topicText);

      const textOverlap = queryTokens.filter(t => chunkTokens.includes(t)).length;
      const topicOverlap = queryTokens.filter(t => topicTokens.includes(t)).length * 2;

      const queryNums = (query.question.match(/\d+(\.\d+)?/g) || []);
      const chunkNums = (chunk.text.match(/\d+(\.\d+)?/g) || []);
      const numericOverlap = queryNums.filter(n => chunkNums.includes(n)).length * 3;

      let phraseBonus = 0;
      const qLower = query.question.toLowerCase();
      const topicLower = topicText.toLowerCase();
      const keywords = ['protein', 'sodium', 'cholesterol', 'sweetener', 'sugar', 'alcohol', 'grain', 'dairy', 'milk', 'fruit', 'vegetable'];
      for (const kw of keywords) {
        if (qLower.includes(kw) && topicLower.includes(kw)) {
          phraseBonus += 2;
        }
      }

      const score = textOverlap + topicOverlap + numericOverlap + phraseBonus;

      results.push({
        chunkId: chunk.chunk_id,
        baseScore: score,
        finalScore: score,
        rank: 0,
        scoreComponents: { heuristic: score }
      });
    }

    results.sort((a, b) => {
      if (Math.abs(a.finalScore - b.finalScore) < 0.001) {
        const getYear = (chunkId: string) => {
          const c = this.chunks.find(x => x.chunk_id === chunkId);
          if (!c) return 2015;
          if ('published_year' in c && typeof (c as any).published_year === 'number') {
            return (c as any).published_year;
          }
          if (c.edition === '2020-2025') return 2020;
          if (c.edition === '2025-2030') return 2025;
          return 2015;
        };
        return getYear(b.chunkId) - getYear(a.chunkId);
      }
      return b.finalScore - a.finalScore;
    });

    return results.slice(0, topK).map((res, index) => ({
      ...res,
      rank: index + 1
    }));
  }
}
