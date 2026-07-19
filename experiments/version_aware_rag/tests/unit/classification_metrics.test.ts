import { describe, expect, test } from "bun:test";
import { computeClassificationMetrics } from "../../src/evaluation/classification_metrics";

describe("classification metrics", () => {
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
});
