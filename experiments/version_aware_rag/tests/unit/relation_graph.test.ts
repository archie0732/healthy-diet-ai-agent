import { describe, expect, test } from "bun:test";
import { RelationGraph } from "../../src/versioning/relation_graph";
import * as path from "path";
import * as fs from "fs";

describe("relation graph", () => {
  test("conditional relation correctly retains or deprecates based on population", () => {
    const tempPairs = path.resolve(process.cwd(), "temp_pairs_graph.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations_graph.jsonl");

    const pair = {
      pair_id: "pair-1",
      old_chunk_id: "c-old",
      new_chunk_id: "c-new",
      lineage_id: "lineage-sodium" // triggers conditional exception for highly active
    };

    const annotation = {
      pair_id: "pair-1",
      relation_type: "conditional_difference",
      policy_label: "retain",
      rationale: "retained for active individuals",
      annotator_id: "tester"
    };

    fs.writeFileSync(tempPairs, JSON.stringify(pair) + "\n", "utf8");
    fs.writeFileSync(tempRelations, JSON.stringify(annotation) + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations);

      // Under general population -> deprecated (since exception doesn't match)
      expect(graph.isChunkActive("c-old", ["general"])).toBe(false);

      // Under highly active population -> retained (active!)
      expect(graph.isChunkActive("c-old", ["highly active"])).toBe(true);
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
