import { describe, expect, test } from "bun:test";
import { RecencyBoostRetriever } from "../../src/retrieval/recency";
import { Retriever, RetrievalContext, SearchResult } from "../../src/retrieval/types";
import { CorpusChunk } from "../../src/corpus/types";

class MockRetriever implements Retriever {
  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    return [
      { chunkId: "c-old", baseScore: 0.8, finalScore: 0.8, rank: 1, scoreComponents: {} },
      { chunkId: "c-new", baseScore: 0.5, finalScore: 0.5, rank: 2, scoreComponents: {} }
    ];
  }
}

describe("recency boost retriever", () => {
  const mockChunks: CorpusChunk[] = [
    {
      chunk_id: "c-old",
      document_id: "doc-1",
      edition: "2015-2020",
      published_at: "2015-12-01",
      source_url: "",
      source_checksum: "",
      page_number: 1,
      passage_index: 0,
      char_start: 0,
      char_end: 10,
      text: "old recommendation",
      topic_ids: [],
      lineage_id: null,
      population_tags: [],
      condition_tags: [],
      numeric_claims: []
    },
    {
      chunk_id: "c-new",
      document_id: "doc-1",
      edition: "2025-2030",
      published_at: "2025-12-01",
      source_url: "",
      source_checksum: "",
      page_number: 2,
      passage_index: 0,
      char_start: 0,
      char_end: 10,
      text: "new recommendation",
      topic_ids: [],
      lineage_id: null,
      population_tags: [],
      condition_tags: [],
      numeric_claims: []
    }
  ];

  test("applies recency penalty/boost correctly based on lambda", async () => {
    const base = new MockRetriever();
    const query: RetrievalContext = { queryId: "q-1", question: "test", targetPopulation: [], conditions: [] };

    // With lambda = 0.1, old chunk (higher base score) should win
    const recencyLow = new RecencyBoostRetriever(base, mockChunks, 0.1);
    const resLow = await recencyLow.retrieve(query, 2);
    expect(resLow[0].chunkId).toBe("c-old");

    // With lambda = 2.0, new chunk (high recency boost) should overtake the old chunk
    const recencyHigh = new RecencyBoostRetriever(base, mockChunks, 2.0);
    const resHigh = await recencyHigh.retrieve(query, 2);
    expect(resHigh[0].chunkId).toBe("c-new");
  });
});
