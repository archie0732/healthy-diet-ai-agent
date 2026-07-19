import { describe, expect, test } from "bun:test";
import { VersionAwareRetriever } from "../../src/retrieval/version_aware";
import { RelationGraph } from "../../src/versioning/relation_graph";
import { Retriever, RetrievalContext, SearchResult } from "../../src/retrieval/types";
import { CorpusChunk } from "../../src/corpus/types";
import { AblationConfig } from "../../src/versioning/types";
import * as path from "path";
import * as fs from "fs";

class MockBaseRetriever implements Retriever {
  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    return [
      { chunkId: "c-old", baseScore: 0.8, finalScore: 0.8, rank: 1, scoreComponents: {} },
      { chunkId: "c-new", baseScore: 0.5, finalScore: 0.5, rank: 2, scoreComponents: {} }
    ];
  }
}

describe("version aware filter", () => {
  const mockChunks: CorpusChunk[] = [
    { chunk_id: "c-old", document_id: "doc", edition: "2020", published_at: "2020-01-01", source_url: "", source_checksum: "", page_number: 1, passage_index: 0, char_start: 0, char_end: 0, text: "", topic_ids: [], lineage_id: null, population_tags: [], condition_tags: [], numeric_claims: [] },
    { chunk_id: "c-new", document_id: "doc", edition: "2025", published_at: "2025-01-01", source_url: "", source_checksum: "", page_number: 2, passage_index: 0, char_start: 0, char_end: 0, text: "", topic_ids: [], lineage_id: null, population_tags: [], condition_tags: [], numeric_claims: [] }
  ];

  test("filters out deprecated chunk in retrieval", async () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_filter.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_filter.jsonl");

    // c-old is superseded by c-new (deprecated)
    const pair = { pair_id: "p-1", old_chunk_id: "c-old", new_chunk_id: "c-new", lineage_id: "lineage-dairy" };
    const ann = { pair_id: "p-1", relation_type: "superseded", policy_label: "deprecated" };
    fs.writeFileSync(tempPairs, JSON.stringify(pair) + "\n", "utf8");
    fs.writeFileSync(tempRelations, JSON.stringify(ann) + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations);
      const ablation: AblationConfig = {
        filter_only: true,
        filter_retain_boost: false,
        filter_compatibility_expansion: false,
        filter_condition_matching: false,
        full_version_aware: false,
        full_version_aware_no_div: false
      };

      const base = new MockBaseRetriever();
      const versionAware = new VersionAwareRetriever(base, mockChunks, graph, ablation);

      const query: RetrievalContext = { queryId: "q-1", question: "test", targetPopulation: ["general"], conditions: [] };
      const results = await versionAware.retrieve(query, 2);

      // c-old is deprecated, so it should be filtered out. Only c-new remains!
      expect(results.length).toBe(1);
      expect(results[0].chunkId).toBe("c-new");
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
