import { describe, expect, test } from "bun:test";
import { computeClassificationMetrics } from "../../src/evaluation/classification_metrics";

describe("classification metrics suite - plan 6 requirements", () => {
  test("computes classification report correctly", () => {
    const predictions = ["superseded", "superseded", "complementary", "duplicate"];
    const groundTruth = ["superseded", "conflicting", "complementary", "duplicate"];

    const report = computeClassificationMetrics(predictions, groundTruth);

    // 3 out of 4 matches -> accuracy = 0.75
    expect(report.accuracy).toBe(0.75);

    // confusion matrix checks
    expect(report.confusionMatrix["superseded"]["superseded"]).toBe(1);
    expect(report.confusionMatrix["conflicting"]["superseded"]).toBe(1);

    // macro-f1 should be computed successfully
    expect(report.macroF1).toBeGreaterThan(0);
    expect(report.macroF1).toBeLessThanOrEqual(1.0);
  });

  test("computes performance stats (invalidRate, latency, tokens, cost)", () => {
    const predictions = ["superseded", "conflicting", "complementary"];
    const groundTruth = ["superseded", "superseded", "complementary"];
    const stats = [
      { latencyMs: 100, promptTokens: 50, completionTokens: 20, isError: false },
      { latencyMs: 150, promptTokens: 60, completionTokens: 25, isError: true },
      { latencyMs: 80, promptTokens: 40, completionTokens: 15, isError: false }
    ];

    const report = computeClassificationMetrics(predictions, groundTruth, stats);

    expect(report.totalEvaluated).toBe(3);
    expect(report.errorCount).toBe(1);
    expect(report.invalidRate).toBe(0.3333);
    expect(report.totalPromptTokens).toBe(150);
    expect(report.totalCompletionTokens).toBe(60);
    expect(report.avgLatencyMs).toBe(110);
    expect(report.estimatedCostUSD).toBeGreaterThan(0);
  });
});

