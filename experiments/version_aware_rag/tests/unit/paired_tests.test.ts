import { describe, expect, test } from "bun:test";
import { computeWilcoxonSignedRank } from "../../src/evaluation/paired_tests";

describe("Wilcoxon signed-rank test", () => {
  test("computes correct p-values for simple differences", () => {
    // Both identical -> p-value should be 1.0 (no significance)
    const a1 = [1, 2, 3, 4, 5];
    const b1 = [1, 2, 3, 4, 5];
    const res1 = computeWilcoxonSignedRank(a1, b1);
    expect(res1.pValue).toBe(1.0);
    expect(res1.isSignificant).toBe(false);

    // Proposed is consistently better
    const a2 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const b2 = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
    const res2 = computeWilcoxonSignedRank(a2, b2);
    expect(res2.pValue).toBeLessThan(0.05);
    expect(res2.isSignificant).toBe(true);
  });
});
