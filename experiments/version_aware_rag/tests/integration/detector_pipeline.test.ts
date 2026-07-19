import { describe, expect, test } from "bun:test";
import { RuleBaselineDetector } from "../../src/versioning/detectors/rule_baseline";
import { CorpusChunk } from "../../src/corpus/types";

describe("detector lineage independence", () => {
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
});
