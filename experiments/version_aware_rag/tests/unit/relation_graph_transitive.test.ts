import { describe, expect, test } from "bun:test";
import { RelationGraph } from "../../src/versioning/relation_graph";
import * as path from "path";
import * as fs from "fs";

describe("relation graph transitive and confidence features", () => {
  test("transitive deprecation chain resolves correctly", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_trans.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_trans.jsonl");

    // A is duplicate of B, B is superseded by C
    const pairs = [
      { pair_id: "p-ab", old_chunk_id: "c-a", new_chunk_id: "c-b", lineage_id: "lineage-dairy" },
      { pair_id: "p-bc", old_chunk_id: "c-b", new_chunk_id: "c-c", lineage_id: "lineage-dairy" }
    ];

    const annotations = [
      { pair_id: "p-ab", relation_type: "duplicate", policy_label: "deprecated" },
      { pair_id: "p-bc", relation_type: "superseded", policy_label: "deprecated" }
    ];

    fs.writeFileSync(tempPairs, pairs.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");
    fs.writeFileSync(tempRelations, annotations.map(a => JSON.stringify(a)).join("\n") + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations, 0.7);

      // c-b is directly deprecated by c-c
      expect(graph.isChunkActive("c-b", ["general"])).toBe(false);

      // c-a is transitively deprecated because B is deprecated
      expect(graph.isChunkActive("c-a", ["general"])).toBe(false);
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });

  test("relation cycles do not cause infinite recursion", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_cycle.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_cycle.jsonl");

    // A -> B, B -> A
    const pairs = [
      { pair_id: "p-ab", old_chunk_id: "c-a", new_chunk_id: "c-b", lineage_id: "lineage-dairy" },
      { pair_id: "p-ba", old_chunk_id: "c-b", new_chunk_id: "c-a", lineage_id: "lineage-dairy" }
    ];

    const annotations = [
      { pair_id: "p-ab", relation_type: "duplicate", policy_label: "deprecated" },
      { pair_id: "p-ba", relation_type: "duplicate", policy_label: "deprecated" }
    ];

    fs.writeFileSync(tempPairs, pairs.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");
    fs.writeFileSync(tempRelations, annotations.map(a => JSON.stringify(a)).join("\n") + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations, 0.7);

      // Should complete and evaluate policy state safely (since A is duplicate of B, and duplicate is deprecated)
      // Cycle is detected and returns 'retain' for duplicate recursion loop, but direct checks should still process.
      const policyA = graph.getPolicyState("c-a", ["general"]);
      expect(policyA).toBe("deprecated");
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });

  test("confidence threshold filters and registers warnings correctly", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_conf.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_conf.jsonl");

    // A is superseded by B with low confidence 0.5
    const pairs = [
      { pair_id: "p-ab", old_chunk_id: "c-a", new_chunk_id: "c-b", lineage_id: "lineage-dairy" }
    ];

    const annotations = [
      { pair_id: "p-ab", relation_type: "superseded", policy_label: "deprecated", confidence: 0.5 }
    ];

    fs.writeFileSync(tempPairs, pairs.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");
    fs.writeFileSync(tempRelations, annotations.map(a => JSON.stringify(a)).join("\n") + "\n", "utf8");

    try {
      // With threshold 0.7, 0.5 is ignored -> active (retained)
      const graphHigh = new RelationGraph(tempPairs, tempRelations, 0.7);
      expect(graphHigh.isChunkActive("c-a", ["general"])).toBe(true);
      expect(graphHigh.getUncertaintyWarnings().length).toBeGreaterThan(0);
      expect(graphHigh.getUncertaintyWarnings()[0]).toContain("Ignored relation p-ab");

      // With threshold 0.4, 0.5 is accepted -> deprecated
      const graphLow = new RelationGraph(tempPairs, tempRelations, 0.4);
      expect(graphLow.isChunkActive("c-a", ["general"])).toBe(false);
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });

  test("helper methods return correct values", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_helpers.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_helpers.jsonl");

    const pairs = [
      { pair_id: "p-1", old_chunk_id: "c-1", new_chunk_id: "c-2", lineage_id: "lineage-dairy" }
    ];

    const annotations = [
      { pair_id: "p-1", relation_type: "superseded", policy_label: "deprecated", confidence: 0.9 }
    ];

    fs.writeFileSync(tempPairs, pairs.map(p => JSON.stringify(p)).join("\n") + "\n", "utf8");
    fs.writeFileSync(tempRelations, annotations.map(a => JSON.stringify(a)).join("\n") + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations, 0.7);

      const superseding = graph.getSupersedingChunks("c-1", ["general"]);
      expect(superseding).toEqual(["c-2"]);

      const filtered = graph.filterRelations(["general"]);
      expect(filtered.length).toBe(1);
      expect(filtered[0].relationId).toBe("p-1");
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
