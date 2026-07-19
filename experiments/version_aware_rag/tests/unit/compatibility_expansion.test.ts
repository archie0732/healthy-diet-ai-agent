import { describe, expect, test } from "bun:test";
import { expandCompatibleChunks } from "../../src/retrieval/compatibility_expansion";
import { RelationGraph } from "../../src/versioning/relation_graph";
import { SearchResult, RetrievalContext } from "../../src/retrieval/types";
import * as path from "path";
import * as fs from "fs";

describe("compatibility expansion", () => {
  test("expands active compatible history neighbor", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_exp.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_exp.jsonl");

    // c-new is complementary with c-old
    const pair = { pair_id: "p-1", old_chunk_id: "c-old", new_chunk_id: "c-new", lineage_id: "lineage-dairy" };
    const ann = { pair_id: "p-1", relation_type: "complementary", policy_label: "retain" };
    fs.writeFileSync(tempPairs, JSON.stringify(pair) + "\n", "utf8");
    fs.writeFileSync(tempRelations, JSON.stringify(ann) + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations);
      
      // retrieved has only c-new. But we want c-old to be expanded!
      const retrieved: SearchResult[] = [
        { chunkId: "c-new", baseScore: 0.8, finalScore: 0.8, rank: 1, scoreComponents: {} }
      ];

      // Base scores map (c-old has baseScore > minBaseScore)
      const baseScoresMap = new Map<string, number>([
        ["c-new", 0.8],
        ["c-old", 0.3]
      ]);

      const query: RetrievalContext = { queryId: "q-1", question: "test", targetPopulation: [], conditions: [] };
      const expanded = expandCompatibleChunks(retrieved, baseScoresMap, graph, query, 0.5, 0.05);

      // c-old is expanded because of complementary relationship and base score > 0.05
      expect(expanded.length).toBe(2);
      expect(expanded.map(e => e.chunkId)).toContain("c-old");
      const oldItem = expanded.find(e => e.chunkId === "c-old");
      expect(oldItem?.finalScore).toBeCloseTo(0.8 * 0.9); // fraction of parent score
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });

  test("skips neighbor if base score is below minBaseScore", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_exp2.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_exp2.jsonl");

    const pair = { pair_id: "p-1", old_chunk_id: "c-old", new_chunk_id: "c-new", lineage_id: "lineage-dairy" };
    const ann = { pair_id: "p-1", relation_type: "complementary", policy_label: "retain" };
    fs.writeFileSync(tempPairs, JSON.stringify(pair) + "\n", "utf8");
    fs.writeFileSync(tempRelations, JSON.stringify(ann) + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations);
      
      const retrieved: SearchResult[] = [
        { chunkId: "c-new", baseScore: 0.8, finalScore: 0.8, rank: 1, scoreComponents: {} }
      ];

      // c-old has 0 base score (irrelevant to query)
      const baseScoresMap = new Map<string, number>([
        ["c-new", 0.8],
        ["c-old", 0.0]
      ]);

      const query: RetrievalContext = { queryId: "q-1", question: "test", targetPopulation: [], conditions: [] };
      const expanded = expandCompatibleChunks(retrieved, baseScoresMap, graph, query, 0.5, 0.05);

      // c-old should NOT be expanded since baseScore (0.0) < minBaseScore (0.05)
      expect(expanded.length).toBe(1);
      expect(expanded[0].chunkId).toBe("c-new");
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
