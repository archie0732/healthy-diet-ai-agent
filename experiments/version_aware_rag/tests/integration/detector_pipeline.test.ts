import { describe, expect, test } from "bun:test";
import { RuleBaselineDetector } from "../../src/versioning/detectors/rule_baseline";
import { PolicyEngine } from "../../src/versioning/policy_engine";
import { RelationGraph } from "../../src/versioning/relation_graph";
import { CorpusChunk } from "../../src/corpus/types";
import * as path from "path";
import * as fs from "fs";

describe("detector & policy pipeline integration", () => {
  const oldChunk: CorpusChunk = {
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
    text: "Consume low-fat dairy options daily.",
    topic_ids: ["lineage-dairy"],
    lineage_id: "lineage-dairy",
    population_tags: [],
    condition_tags: [],
    numeric_claims: []
  };

  const newChunk: CorpusChunk = {
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
    text: "Consume full-fat dairy options daily.",
    topic_ids: ["lineage-dairy"],
    lineage_id: "lineage-dairy",
    population_tags: [],
    condition_tags: [],
    numeric_claims: []
  };

  test("asserts changing lineage IDs has zero impact on detector predictions", async () => {
    const detector = new RuleBaselineDetector();

    // 1. First classification with original lineages
    const res1 = await detector.classify({ oldChunk, newChunk });

    // 2. Modify chunk lineages in copies
    const oldCopy = { ...oldChunk, lineage_id: "lineage-protein", topic_ids: ["lineage-protein"] };
    const newCopy = { ...newChunk, lineage_id: "lineage-protein", topic_ids: ["lineage-protein"] };

    // 3. Second classification with modified copy
    const res2 = await detector.classify({ oldChunk: oldCopy, newChunk: newCopy });

    // Predictions must be identical since prediction depends on text features, not ID names!
    expect(res1.relationType).toBe(res2.relationType);
  });

  test("end-to-end detector -> policy engine -> relation graph pipeline", async () => {
    const detector = new RuleBaselineDetector();
    const prediction = await detector.classify({ oldChunk, newChunk });

    // 1. Resolve Policy
    const decision = PolicyEngine.resolve(prediction.relationType, "pair-dairy-1", {
      mode: "predicted_relation",
      oldEdition: oldChunk.edition,
      newEdition: newChunk.edition
    });

    expect(decision.state).toBeDefined();

    // 2. Construct Relation Graph via temporary JSONL files
    const tempPairs = path.resolve(process.cwd(), "temp_pipeline_pairs.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_pipeline_relations.jsonl");

    const pair = {
      pair_id: "pair-dairy-1",
      old_chunk_id: oldChunk.chunk_id,
      new_chunk_id: newChunk.chunk_id
    };

    const annotation = {
      pair_id: "pair-dairy-1",
      relation_type: prediction.relationType,
      policy_label: decision.state,
      confidence: prediction.confidence
    };

    fs.writeFileSync(tempPairs, JSON.stringify(pair) + "\n", "utf8");
    fs.writeFileSync(tempRelations, JSON.stringify(annotation) + "\n", "utf8");

    try {
      const graph = new RelationGraph(tempPairs, tempRelations);
      const isOldActive = graph.isChunkActive(oldChunk.chunk_id);
      expect(isOldActive).toBe(decision.state !== "deprecated" && decision.state !== "evicted");
    } finally {
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});


