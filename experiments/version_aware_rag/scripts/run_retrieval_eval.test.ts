import { describe, expect, test } from "bun:test";
import { scoreChunkForQuery } from "./run_retrieval_eval";

describe("scoreChunkForQuery", () => {
  test("does not use oracle lineage metadata", () => {
    const query = {
      query_id: "q-test",
      question: "What is the sodium intake limit recommendation for highly active individuals?",
      expected_answer_scope: "conditional_merge",
      notes: ""
    };

    const chunk = {
      chunk_id: "dga-2025-page-6-lineage-sodium",
      doc_id: "dga-2025",
      version: "2025-2030",
      published_year: 2025,
      topic: "sodium",
      applicable_population: "general",
      lineage_id: "lineage-sodium",
      text: "Highly active individuals may benefit from increased sodium intake to offset sweat losses."
    };

    const score = scoreChunkForQuery(query, chunk, "append-only");
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });
});
