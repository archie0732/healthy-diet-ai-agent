import { Retriever, RetrievalContext, SearchResult } from './types';

export class FixedCandidatePoolRetriever implements Retriever {
  private candidatePool: SearchResult[];

  constructor(candidatePool: SearchResult[]) {
    this.candidatePool = candidatePool.map(c => ({ ...c }));
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    return this.candidatePool.slice(0, topK).map(c => ({ ...c }));
  }

  public getFullPool(): SearchResult[] {
    return this.candidatePool.map(c => ({ ...c }));
  }
}
