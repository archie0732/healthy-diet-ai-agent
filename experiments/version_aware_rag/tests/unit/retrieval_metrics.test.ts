import { describe, expect, test } from "bun:test";
import { calculateQueryMetrics } from "../../src/evaluation/retrieval_metrics";
import { QueryJudgment } from "../../src/annotation/schema";

describe("retrieval metrics", () => {
  const mockJudgment: QueryJudgment = {
    query_id: "q-1",
    required_chunk_ids: ["c-1", "c-2"],
    compatible_chunk_ids: ["c-3"],
    preferred_chunk_ids: ["c-1"],
    deprecated_chunk_ids: ["c-4"],
    forbidden_chunk_ids: ["c-5"],
    citation_safe_chunk_ids: ["c-1", "c-2", "c-3"],
    rationale: "test",
    annotator_id: "tester"
  };

  test("calculates standard metrics correctly", () => {
    // retrieved: [c-1, c-4, c-3]
    // acceptable: c-1, c-2, c-3 (size 3)
    // required: c-1, c-2 (size 2)
    // compatible: c-3 (size 1)
    // deprecated: c-4
    // forbidden: c-5
    const retrieved = ["c-1", "c-4", "c-3"];
    const metrics = calculateQueryMetrics(retrieved, mockJudgment, 3);

    // acceptable hits in retrieved: c-1, c-3 (2 hits)
    // Recall = 2 / 3
    expect(metrics.recall).toBeCloseTo(2 / 3);
    // Precision = 2 / 3
    expect(metrics.precision).toBeCloseTo(2 / 3);
    // MRR = 1/1 = 1.0 (since c-1 is acceptable at rank 1)
    expect(metrics.mrr).toBe(1.0);
    
    // required hits: c-1 (1 hit). Required recall = 1 / 2 = 0.5
    expect(metrics.required_recall).toBe(0.5);
    // both evidence coverage: required size is 2, but only 1 retrieved -> 0
    expect(metrics.both_evidence_coverage).toBe(0);
    // stale hit: c-4 is deprecated -> 1
    expect(metrics.stale_hit).toBe(1);
    // compatible recall: c-3 retrieved -> 1 / 1 = 1.0
    expect(metrics.compatible_recall).toBe(1.0);
  });

  test("nDCG computation with preferred boost", () => {
    // retrieved: [c-1, c-3] (both acceptable; c-1 is preferred [rel=2], c-3 is compatible [rel=1])
    // DCG = 2/log2(2) + 1/log2(3) = 2/1 + 1/1.5849 = 2 + 0.6309 = 2.6309
    // Ideal: c-1 [rel=2], c-3 [rel=1]
    // IDCG = 2.6309
    // nDCG = 1.0
    const retrieved = ["c-1", "c-3"];
    const metrics = calculateQueryMetrics(retrieved, mockJudgment, 2);
    expect(metrics.ndcg).toBe(1.0);
  });

  test("handles empty lists gracefully", () => {
    const metrics = calculateQueryMetrics([], mockJudgment, 5);
    expect(metrics.recall).toBe(0);
    expect(metrics.precision).toBeNull();
    expect(metrics.mrr).toBe(0);
    expect(metrics.ndcg).toBe(0);
    expect(metrics.top1_safety).toBeNull();
  });

  describe("boundary scenarios from plan 4 fixture spec", () => {
    // Scenario 1: top-1 required hit
    test("Scenario 1: top-1 required hit", () => {
      const j: QueryJudgment = {
        query_id: "q-s1",
        required_chunk_ids: ["c-req"],
        compatible_chunk_ids: [],
        preferred_chunk_ids: ["c-req"],
        deprecated_chunk_ids: [],
        forbidden_chunk_ids: [],
        citation_safe_chunk_ids: ["c-req"]
      };
      const retrieved = ["c-req", "c-other1", "c-other2"];
      const metrics = calculateQueryMetrics(retrieved, j, 3);

      expect(metrics.recall).toBe(1.0);
      expect(metrics.precision).toBeCloseTo(1 / 3);
      expect(metrics.mrr).toBe(1.0);
      expect(metrics.ndcg).toBe(1.0); // DCG = 2, IDCG = 2
      expect(metrics.preferred_hit).toBe(1);
      expect(metrics.required_recall).toBe(1.0);
      expect(metrics.both_evidence_coverage).toBeNull(); // size = 1 < 2
      expect(metrics.stale_hit).toBe(0);
      expect(metrics.compatible_recall).toBeNull();
      expect(metrics.conditional_completeness).toBe(1.0);
      expect(metrics.top1_safety).toBe(1);
      expect(metrics.unsafe_chunks_count).toBe(2);
    });

    // Scenario 2: required evidence 位於 rank 2/3
    test("Scenario 2: required evidence at rank 2/3", () => {
      const j: QueryJudgment = {
        query_id: "q-s2",
        required_chunk_ids: ["c-req"],
        compatible_chunk_ids: [],
        preferred_chunk_ids: [],
        deprecated_chunk_ids: [],
        forbidden_chunk_ids: [],
        citation_safe_chunk_ids: ["c-req", "c-other1"]
      };
      const retrieved = ["c-other1", "c-req", "c-other2"];
      const metrics = calculateQueryMetrics(retrieved, j, 3);

      expect(metrics.recall).toBe(1.0);
      expect(metrics.precision).toBeCloseTo(1 / 3);
      expect(metrics.mrr).toBe(0.5); // rank 2

      // DCG = 0 + 1 / log2(3) = 0.63092975
      // Ideal: [1] => IDCG = 1 / log2(2) = 1.0
      // nDCG = 0.63092975
      expect(metrics.ndcg).toBeCloseTo(0.6309, 4);
      expect(metrics.preferred_hit).toBe(0);
      expect(metrics.required_recall).toBe(1.0);
      expect(metrics.both_evidence_coverage).toBeNull();
      expect(metrics.stale_hit).toBe(0);
      expect(metrics.compatible_recall).toBeNull();
      expect(metrics.top1_safety).toBe(1); // rank 1 c-other1 is safe
      expect(metrics.unsafe_chunks_count).toBe(1); // c-other2 is unsafe
    });

    // Scenario 3: 需要兩段 evidence 但只取回一段
    test("Scenario 3: needs two required evidences but only retrieves one", () => {
      const j: QueryJudgment = {
        query_id: "q-s3",
        required_chunk_ids: ["c-req1", "c-req2"],
        compatible_chunk_ids: [],
        preferred_chunk_ids: [],
        deprecated_chunk_ids: [],
        forbidden_chunk_ids: [],
        citation_safe_chunk_ids: ["c-req1", "c-req2"]
      };
      const retrieved = ["c-req1", "c-other1", "c-other2"];
      const metrics = calculateQueryMetrics(retrieved, j, 3);

      expect(metrics.recall).toBe(0.5);
      expect(metrics.precision).toBeCloseTo(1 / 3);
      expect(metrics.mrr).toBe(1.0);

      // DCG = 1 / log2(2) = 1.0
      // IDCG: sorted relevance: [1, 1]
      // IDCG = 1/log2(2) + 1/log2(3) = 1 + 0.6309 = 1.6309
      // nDCG = 1 / 1.6309 = 0.6131
      expect(metrics.ndcg).toBeCloseTo(1 / (1 + 1 / (Math.log(3) / Math.log(2))), 4);
      expect(metrics.preferred_hit).toBe(0);
      expect(metrics.required_recall).toBe(0.5);
      expect(metrics.both_evidence_coverage).toBe(0); // size = 2, only 1 hit
      expect(metrics.stale_hit).toBe(0);
      expect(metrics.compatible_recall).toBeNull();
      expect(metrics.top1_safety).toBe(1);
      expect(metrics.unsafe_chunks_count).toBe(2);
    });

    // Scenario 4: stale 與 forbidden 混合
    test("Scenario 4: stale and forbidden mixed", () => {
      const j: QueryJudgment = {
        query_id: "q-s4",
        required_chunk_ids: ["c-req"],
        compatible_chunk_ids: [],
        preferred_chunk_ids: [],
        deprecated_chunk_ids: ["c-stale"],
        forbidden_chunk_ids: ["c-forb"],
        citation_safe_chunk_ids: ["c-req"]
      };
      const retrieved = ["c-stale", "c-req", "c-forb"];
      const metrics = calculateQueryMetrics(retrieved, j, 3);

      expect(metrics.recall).toBe(1.0);
      expect(metrics.precision).toBeCloseTo(1 / 3);
      expect(metrics.mrr).toBe(0.5); // rank 2 is c-req

      // DCG = 0 + 1 / log2(3) + 0 = 0.6309
      // IDCG = 1 / log2(2) = 1.0
      expect(metrics.ndcg).toBeCloseTo(0.6309, 4);
      expect(metrics.preferred_hit).toBe(0);
      expect(metrics.required_recall).toBe(1.0);
      expect(metrics.stale_hit).toBe(1); // stale/forbidden is hit
      expect(metrics.top1_safety).toBe(0); // top-1 c-stale is not safe
      expect(metrics.unsafe_chunks_count).toBe(2); // c-stale and c-forb are unsafe
    });

    // Scenario 5: compatible old chunk
    test("Scenario 5: compatible old chunk", () => {
      const j: QueryJudgment = {
        query_id: "q-s5",
        required_chunk_ids: ["c-req"],
        compatible_chunk_ids: ["c-comp-old"],
        preferred_chunk_ids: ["c-req"],
        deprecated_chunk_ids: [],
        forbidden_chunk_ids: [],
        citation_safe_chunk_ids: ["c-req", "c-comp-old"]
      };
      const retrieved = ["c-comp-old", "c-other1", "c-req"];
      const metrics = calculateQueryMetrics(retrieved, j, 3);

      // acceptable size = 2, both c-comp-old and c-req retrieved
      expect(metrics.recall).toBe(1.0);
      expect(metrics.precision).toBeCloseTo(2 / 3);
      expect(metrics.mrr).toBe(1.0); // c-comp-old is hit at rank 1

      // DCG = 1 / log2(2) + 0/log2(3) + 2/log2(4) = 1.0 + 1.0 = 2.0
      // IDCG: Ideal relevance sorted: [2, 1]
      // IDCG = 2 / log2(2) + 1 / log2(3) = 2 + 0.6309 = 2.6309
      // nDCG = 2.0 / 2.6309 = 0.7602
      expect(metrics.ndcg).toBeCloseTo(2.0 / (2 + 1 / (Math.log(3) / Math.log(2))), 4);
      expect(metrics.preferred_hit).toBe(1); // c-req retrieved
      expect(metrics.required_recall).toBe(1.0);
      expect(metrics.compatible_recall).toBe(1.0);
      expect(metrics.top1_safety).toBe(1);
      expect(metrics.unsafe_chunks_count).toBe(1);
    });

    // Scenario 6: 相同 relevance 下不同年份
    test("Scenario 6: chunks with identical relevance but different publication years", () => {
      const j: QueryJudgment = {
        query_id: "q-s6",
        required_chunk_ids: ["c-old", "c-new"],
        compatible_chunk_ids: [],
        preferred_chunk_ids: [],
        deprecated_chunk_ids: [],
        forbidden_chunk_ids: [],
        citation_safe_chunk_ids: ["c-old", "c-new"]
      };

      // Both c-old and c-new have same relevance in judgments (relevance = 1)
      const retrievedOrder1 = ["c-new", "c-old"];
      const retrievedOrder2 = ["c-old", "c-new"];

      const metrics1 = calculateQueryMetrics(retrievedOrder1, j, 2);
      const metrics2 = calculateQueryMetrics(retrievedOrder2, j, 2);

      // Verify that metrics calculation treats them symmetrically in terms of relevance and ordering
      expect(metrics1.recall).toBe(1.0);
      expect(metrics2.recall).toBe(1.0);
      expect(metrics1.precision).toBe(1.0);
      expect(metrics2.precision).toBe(1.0);
      expect(metrics1.mrr).toBe(1.0);
      expect(metrics2.mrr).toBe(1.0);
      expect(metrics1.ndcg).toBe(1.0);
      expect(metrics2.ndcg).toBe(1.0);
      expect(metrics1.required_recall).toBe(1.0);
      expect(metrics2.required_recall).toBe(1.0);
    });

    // Scenario 7: 空結果與 k 大於 corpus size
    test("Scenario 7: empty result and k larger than corpus size", () => {
      const j: QueryJudgment = {
        query_id: "q-s7",
        required_chunk_ids: ["c-req"],
        compatible_chunk_ids: [],
        preferred_chunk_ids: [],
        deprecated_chunk_ids: [],
        forbidden_chunk_ids: [],
        citation_safe_chunk_ids: ["c-req"]
      };

      // 1. Empty list
      const metricsEmpty = calculateQueryMetrics([], j, 5);
      expect(metricsEmpty.recall).toBe(0.0);
      expect(metricsEmpty.precision).toBeNull();
      expect(metricsEmpty.mrr).toBe(0.0);
      expect(metricsEmpty.ndcg).toBe(0.0);
      expect(metricsEmpty.preferred_hit).toBe(0);
      expect(metricsEmpty.required_recall).toBe(0.0);
      expect(metricsEmpty.both_evidence_coverage).toBeNull();
      expect(metricsEmpty.stale_hit).toBe(0);
      expect(metricsEmpty.top1_safety).toBeNull();
      expect(metricsEmpty.unsafe_chunks_count).toBe(0);

      // 2. k larger than retrieved size (and corpus size)
      const metricsKLarge = calculateQueryMetrics(["c-req"], j, 10);
      expect(metricsKLarge.recall).toBe(1.0);
      expect(metricsKLarge.precision).toBe(1.0); // 1 hit / 1 retrieved
      expect(metricsKLarge.mrr).toBe(1.0);
      expect(metricsKLarge.ndcg).toBe(1.0);
      expect(metricsKLarge.top1_safety).toBe(1);
      expect(metricsKLarge.unsafe_chunks_count).toBe(0);
    });
  });
});
