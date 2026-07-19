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
    // Return mock candidate set
    return [
      { chunkId: "c-1", baseScore: 0.8, finalScore: 0.8, rank: 1, scoreComponents: {} }, // deprecated
      { chunkId: "c-2", baseScore: 0.7, finalScore: 0.7, rank: 2, scoreComponents: {} }, // new version (replaces c-1)
      { chunkId: "c-4", baseScore: 0.8, finalScore: 0.8, rank: 3, scoreComponents: {} }, // matches query population/condition
      { chunkId: "c-3", baseScore: 0.3, finalScore: 0.3, rank: 4, scoreComponents: {} }, // complementary to c-4 (retained)
      { chunkId: "c-5", baseScore: 0.6, finalScore: 0.6, rank: 5, scoreComponents: {} }, // duplicate of c-6
      { chunkId: "c-6", baseScore: 0.6, finalScore: 0.6, rank: 6, scoreComponents: {} }  // duplicate of c-5
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

  test("runs all 6 ablation modes and verifies distinct behaviors", async () => {
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

      // -------------------------------------------------------------
      // Mode 1: filter_only
      // -------------------------------------------------------------
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

      // c-1 should be filtered out
      expect(res1.map(r => r.chunkId)).not.toContain("c-1");
      // c-2 score should be baseScore 0.7 (no boosts)
      const itemC2 = res1.find(r => r.chunkId === "c-2");
      expect(itemC2?.finalScore).toBe(0.7);
      // c-4 score should be baseScore 0.8 (no boosts)
      const itemC4 = res1.find(r => r.chunkId === "c-4");
      expect(itemC4?.finalScore).toBe(0.8);
      // c-3 should not be expanded, so its score is 0.3
      const itemC3_1 = res1.find(r => r.chunkId === "c-3");
      expect(itemC3_1?.finalScore).toBe(0.3);

      // -------------------------------------------------------------
      // Mode 2: filter_retain_boost
      // -------------------------------------------------------------
      const ablation2: AblationConfig = {
        filter_only: false,
        filter_retain_boost: true,
        filter_compatibility_expansion: false,
        filter_condition_matching: false,
        full_version_aware: false,
        full_version_aware_no_div: false
      };
      const ret2 = new VersionAwareRetriever(base, mockChunks, graph, ablation2);
      const res2 = await ret2.retrieve(query, 6);

      // c-3 has complementary relation with c-4, so it should receive +0.1 retain boost
      const itemC3_2 = res2.find(r => r.chunkId === "c-3");
      expect(itemC3_2?.finalScore).toBeCloseTo(0.3 + 0.1);
      expect(itemC3_2?.scoreComponents?.retain_relation_boost).toBe(0.1);

      // c-4 should receive retain boost (+0.1) but NOT receive condition boost (+0.15)
      const itemC4_2 = res2.find(r => r.chunkId === "c-4");
      expect(itemC4_2?.finalScore).toBeCloseTo(0.9);

      // -------------------------------------------------------------
      // Mode 3: filter_compatibility_expansion
      // -------------------------------------------------------------
      const ablation3: AblationConfig = {
        filter_only: false,
        filter_retain_boost: false,
        filter_compatibility_expansion: true,
        filter_condition_matching: false,
        full_version_aware: false,
        full_version_aware_no_div: false
      };
      const ret3 = new VersionAwareRetriever(base, mockChunks, graph, ablation3);
      const res3 = await ret3.retrieve(query, 6);

      // c-3 is complementary neighbor of c-4. Since c-4 baseScore (0.8) > threshold (0.5) and c-3 baseScore (0.3) > minBaseScore (0.01),
      // c-3 gets expanded. Its score is calculated as parent (c-4) score * 0.9 = 0.8 * 0.9 = 0.72.
      const itemC3_3 = res3.find(r => r.chunkId === "c-3");
      expect(itemC3_3?.finalScore).toBeCloseTo(0.72);
      expect(itemC3_3?.scoreComponents?.expanded).toBe(1);

      // -------------------------------------------------------------
      // Mode 4: filter_condition_matching
      // -------------------------------------------------------------
      const ablation4: AblationConfig = {
        filter_only: false,
        filter_retain_boost: false,
        filter_compatibility_expansion: false,
        filter_condition_matching: true,
        full_version_aware: false,
        full_version_aware_no_div: false
      };
      const ret4 = new VersionAwareRetriever(base, mockChunks, graph, ablation4);
      const res4 = await ret4.retrieve(query, 6);

      // c-4 has population/condition tags matching query -> gets +0.15 condition boost -> 0.8 + 0.15 = 0.95
      const itemC4_4 = res4.find(r => r.chunkId === "c-4");
      expect(itemC4_4?.finalScore).toBeCloseTo(0.95);
      expect(itemC4_4?.scoreComponents?.condition_boost).toBe(0.15);

      // c-3 should NOT receive retain boost
      const itemC3_4 = res4.find(r => r.chunkId === "c-3");
      expect(itemC3_4?.finalScore).toBe(0.3);

      // -------------------------------------------------------------
      // Mode 5: full_version_aware_no_div
      // -------------------------------------------------------------
      const ablation5: AblationConfig = {
        filter_only: false,
        filter_retain_boost: false,
        filter_compatibility_expansion: false,
        filter_condition_matching: false,
        full_version_aware: false,
        full_version_aware_no_div: true
      };
      const ret5 = new VersionAwareRetriever(base, mockChunks, graph, ablation5);
      const res5 = await ret5.retrieve(query, 6);

      // Both boosts and expansion should apply.
      // c-4 gets both boosts (0.8 + 0.15 + 0.1 = 1.05)
      const itemC4_5 = res5.find(r => r.chunkId === "c-4");
      expect(itemC4_5?.finalScore).toBeCloseTo(1.05);

      // c-3 gets expanded from c-4 (finalScore = 1.05 * 0.9 = 0.945)
      const itemC3_5 = res5.find(r => r.chunkId === "c-3");
      expect(itemC3_5?.finalScore).toBeCloseTo(0.945);

      // No duplicate penalty is applied to c-5 and c-6, so their scores remain 0.6
      const itemC5_5 = res5.find(r => r.chunkId === "c-5");
      const itemC6_5 = res5.find(r => r.chunkId === "c-6");
      expect(itemC5_5?.finalScore).toBe(0.6);
      expect(itemC6_5?.finalScore).toBe(0.6);

      // -------------------------------------------------------------
      // Mode 6: full_version_aware
      // -------------------------------------------------------------
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

      // c-5 and c-6 are duplicates. One of them (whichever is processed second) should get -0.9 penalty -> -0.3.
      // This changes ranking order.
      const itemC5_6 = res6.find(r => r.chunkId === "c-5");
      const itemC6_6 = res6.find(r => r.chunkId === "c-6");
      expect(Math.abs(itemC5_6!.finalScore - (-0.3)) < 1e-5 || Math.abs(itemC6_6!.finalScore - (-0.3)) < 1e-5).toBe(true);

    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });

  test("custom configured policy parameters are respected", async () => {
    fs.writeFileSync(tempPairs, pairs.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");
    fs.writeFileSync(tempRelations, annotations.map(a => JSON.stringify(a)).join("\n") + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations, 0.7);
      const base = new MockBaseRetriever();

      const query: RetrievalContext = {
        queryId: "q-test-custom",
        question: "custom parameters test",
        targetPopulation: ["highly active"],
        conditions: ["active sweat loss"]
      };

      const customAblation: AblationConfig = {
        filter_only: false,
        filter_retain_boost: false,
        filter_compatibility_expansion: false,
        filter_condition_matching: false,
        full_version_aware: true,
        full_version_aware_no_div: false,
        retain_relation_boost: 0.25,
        condition_boost: 0.35,
        expansion_seed_threshold: 0.05,
        expansion_min_base_score: 0.01,
        diversification_penalty: 0.5
      };

      const ret = new VersionAwareRetriever(base, mockChunks, graph, customAblation);
      const res = await ret.retrieve(query, 6);

      // c-4 gets both boosts: base 0.8 + retain 0.25 + condition 0.35 = 1.40
      const itemC4 = res.find(r => r.chunkId === "c-4");
      expect(itemC4?.finalScore).toBeCloseTo(1.40);

      // c-3 gets expanded from c-4: parent score 1.40 * 0.9 = 1.26
      const itemC3 = res.find(r => r.chunkId === "c-3");
      expect(itemC3?.finalScore).toBeCloseTo(1.26);

      // c-5 and c-6 are duplicates. One of them gets penalized by 0.5 -> 0.6 - 0.5 = 0.1
      const itemC5 = res.find(r => r.chunkId === "c-5");
      const itemC6 = res.find(r => r.chunkId === "c-6");
      expect(Math.abs(itemC5!.finalScore - 0.1) < 1e-5 || Math.abs(itemC6!.finalScore - 0.1) < 1e-5).toBe(true);

    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
