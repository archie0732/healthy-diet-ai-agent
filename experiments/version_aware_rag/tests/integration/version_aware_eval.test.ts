import { describe, expect, test } from "bun:test";
import { BM25Retriever } from "../../src/retrieval/bm25";
import { VersionAwareRetriever } from "../../src/retrieval/version_aware";
import { RelationGraph } from "../../src/versioning/relation_graph";
import { RetrievalContext } from "../../src/retrieval/types";
import { CorpusChunk } from "../../src/corpus/types";
import { AblationConfig } from "../../src/versioning/types";
import * as path from "path";
import * as fs from "fs";

describe("version aware retriever integration", () => {
  const root = process.cwd();
  
  const chunksJsonlPath = path.resolve(root, "experiments/version_aware_rag/data/corpus_v3/chunks.jsonl");
  const relationPairsPath = path.resolve(root, "experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl");
  const relationsPath = path.resolve(root, "experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl");

  test("runs search correctly with full proposed configuration", async () => {
    if (!fs.existsSync(chunksJsonlPath) || !fs.existsSync(relationPairsPath) || !fs.existsSync(relationsPath)) {
      console.warn("Skipping integration test since v3 data files are missing.");
      return;
    }

    const chunkLines = fs.readFileSync(chunksJsonlPath, "utf8").split("\n").filter(Boolean);
    const chunks: CorpusChunk[] = chunkLines.map(line => JSON.parse(line));

    const graph = new RelationGraph(relationPairsPath, relationsPath);
    const base = new BM25Retriever(chunks);

    const ablation: AblationConfig = {
      filter_only: false,
      filter_retain_boost: false,
      filter_compatibility_expansion: false,
      filter_condition_matching: false,
      full_version_aware: true,
      full_version_aware_no_div: false
    };

    const retriever = new VersionAwareRetriever(base, chunks, graph, ablation);

    // Test a real query for whole grains
    const query: RetrievalContext = {
      queryId: "q-7",
      question: "how many servings of whole grains are recommended?",
      targetPopulation: ["general"],
      conditions: []
    };

    const results = await retriever.retrieve(query, 3);
    
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
    
    // Ensure ranks are assigned 1, 2, 3
    results.forEach((res, index) => {
      expect(res.rank).toBe(index + 1);
    });
  });
});
