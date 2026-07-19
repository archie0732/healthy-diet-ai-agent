export interface RetrievalContext {
  queryId: string;
  question: string;
  targetPopulation: string[];
  conditions: string[];
}

export interface SearchResult {
  chunkId: string;
  baseScore: number;
  finalScore: number;
  rank: number;
  scoreComponents: Record<string, number>;
  relationReason?: string;
  warnings?: string[];
}

export interface Retriever {
  retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]>;
}
