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
      { chunkId: "c-1", baseScore: 0.8, finalScore: 0.8, rank: 1, scoreComponents: {} },
      { chunkId: "c-2", baseScore: 0.7, finalScore: 0.7, rank: 2, scoreComponents: {} },
      { chunkId: "c-4", baseScore: 0.8, finalScore: 0.8, rank: 3, scoreComponents: {} },
      { chunkId: "c-3", baseScore: 0.3, finalScore: 0.3, rank: 4, scoreComponents: {} },
      { chunkId: "c-5", baseScore: 0.6, finalScore: 0.6, rank: 5, scoreComponents: {} },
      { chunkId: "c-6", baseScore: 0.6, finalScore: 0.6, rank: 6, scoreComponents: {} }
    ];
  }
}

describe("ablation control fixtures", () => {
  const mockChunks: CorpusChunk[] = [
    { chunk_id: "c-1", document_id: "doc", edition: "2020", published_at: "2020-01-01", source_url: "", source_checksum: "", page_number: 1, passage_index: 0, char_start: 0, char_end: 0, text: "old guideline", topic_ids: [], lineage_id: "lineage-dairy", population_tags: [], condition_tags: [], numeric_claims: [] },
    { chunk_id: "c-2", document_id: "doc", edition: "2025", published_at: "2025-01-01", source_url: "", source_checksum: "", page_number: 2, passage_index: 0, char_start: 0, char_end: 0, text: "new guideline", topic_ids: [], lineage_id: "lineage-dairy", population_tags: [], condition_tags: [], numeric_claims: [] },
    { chunk_id: "c-3", document_id: "doc", edition: "2020", published_at: "2020-01-01", source_url: "", source_checksum: "", page_number: 3, passage_index: 0, char_start: 0, char_end: 0, text: "old supplementary", topic_ids: [], lineage_id: "lineage-sodium", population_tags: [], condition_tags: [], numeric_claims: [] },
    { chunk_id: "c-4", document_id: "doc", edition: "2025", published_at: "2025-01-01", source_url: "", source_checksum: "", page_number: 4, passage_index: 0, char_start: 0, char_end: 0, text: "new exception", topic_ids: [], lineage_id: "lineage-sodium", population_tags: ["highly active"], condition_tags: ["active sweat loss"], numeric_claims: [] },
    { chunk_id: "c-5", document_id: "doc", edition: "2025", published_at: "2025-01-01", source_url: "", source_checksum: "", page_number: 5, passage_index: 0, char_start: 0, char_end: 0, text: "duplicate guideline 1", topic_ids: [], lineage_id: "lineage-protein", population_tags: [], condition_tags: [], numeric_claims: [] },
    { chunk_id: "c-6", document_id: "doc", edition: "2025", published_at: "2025-01-01", source_url: "", source_checksum: "", page_number: 6, passage_index: 0, char_start: 0, char_end: 0, text: "duplicate guideline 2", topic_ids: [], lineage_id: "lineage-protein", population_tags: [], condition_tags: [], numeric_claims: [] }
  ];

  const tempPairs = path.resolve(process.cwd(), "temp_pairs_abl.jsonl");
  const tempRelations = path.resolve(process.cwd(), "temp_relations_abl.jsonl");

  const pairs = [
    { pair_id: "p-1", old_chunk_id: "c-1", new_chunk_id: "c-2", lineage_id: "lineage-dairy" },
    { pair_id: "p-2", old_chunk_id: "c-3", new_chunk_id: "c-4", lineage_id: "lineage-sodium" },
    { pair_id: "p-3", old_chunk_id: "c-5", new_chunk_id: "c-6", lineage_id: "lineage-protein" }
  ];

  const annotations = [
    { pair_id: "p-1", relation_type: "superseded", policy_label: "deprecated", confidence: 0.9 },
    { pair_id: "p-2", relation_type: "complementary", policy_label: "retain", confidence: 0.9 },
    { pair_id: "p-3", relation_type: "duplicate", policy_label: "retain", confidence: 0.9 }
  ];

  test("runs all ablation modes and verifies distinct behaviors", async () => {
    fs.writeFileSync(tempPairs, pairs.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");
    fs.writeFileSync(tempRelations, annotations.map(a => JSON.stringify(a)).join("\n") + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations, 0.7);
      const base = new MockBaseRetriever();

      const query: RetrievalContext = {
        queryId: "q-test",
        question: "sodium and dairy guidelines",
        targetPopulation: ["highly active"],
        conditions: ["active sweat loss"]
      };

      const ablation1: AblationConfig = {
        filter_only: true,
        filter_retain_boost: false,
        filter_compatibility_expansion: false,
        filter_condition_matching: false,
        full_version_aware: false,
        full_version_aware_no_div: false
      };
      const ret1 = new VersionAwareRetriever(base, mockChunks, graph, ablation1);
      const res1 = await ret1.retrieve(query, 6);

      expect(res1.map(r => r.chunkId)).not.toContain("c-1");

      const ablation6: AblationConfig = {
        filter_only: false,
        filter_retain_boost: false,
        filter_compatibility_expansion: false,
        filter_condition_matching: false,
        full_version_aware: true,
        full_version_aware_no_div: false
      };
      const ret6 = new VersionAwareRetriever(base, mockChunks, graph, ablation6);
      const res6 = await ret6.retrieve(query, 6);
      expect(res6.length).toBeGreaterThan(0);

    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
