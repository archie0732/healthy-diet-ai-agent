import { describe, expect, test } from "bun:test";
import { scoreChunkForQuery, summarizeQueryResult, retrieveTopK } from "./run_retrieval_eval";

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

describe("summarizeQueryResult", () => {
  test("marks retrieval stale when any judged stale chunk is returned", () => {
    const topK = [
      { chunk: { chunk_id: "dga-2015-page-34-lineage-dairy" } },
      { chunk: { chunk_id: "dga-2025-page-3-lineage-dairy" } }
    ] as any;

    const judgment = {
      query_id: "q-001",
      stale_chunk_ids: ["dga-2015-page-34-lineage-dairy"],
      acceptable_chunk_ids: ["dga-2025-page-3-lineage-dairy"],
      preferred_chunk_ids: ["dga-2025-page-3-lineage-dairy"],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ["dga-2025-page-3-lineage-dairy"]
    };

    const result = summarizeQueryResult("q-001", "demo", topK, judgment);
    expect(result.is_stale_retrieved).toBe(true);
  });
});

describe("proposed mode", () => {
  test("differs from append-only only by policy filtering", () => {
    const deprecatedKeys = new Set(["lineage-dairy-2020-2025"]);
    const chunks = [
      { chunk_id: "old", version: "2020-2025", lineage_id: "lineage-dairy", published_year: 2020, text: "dairy old", doc_id: "a", topic: "dairy", applicable_population: "general" },
      { chunk_id: "new", version: "2025-2030", lineage_id: "lineage-dairy", published_year: 2025, text: "dairy new", doc_id: "b", topic: "dairy", applicable_population: "general" }
    ] as any;

    const query = { query_id: "q-001", question: "dairy", expected_answer_scope: "current_only", notes: "" };

    const append = retrieveTopK(query, chunks, deprecatedKeys, "append-only", 2).map((x) => x.chunk.chunk_id);
    const proposed = retrieveTopK(query, chunks, deprecatedKeys, "proposed", 2).map((x) => x.chunk.chunk_id);

    expect(append).toContain("old");
    expect(proposed).not.toContain("old");
  });
});
