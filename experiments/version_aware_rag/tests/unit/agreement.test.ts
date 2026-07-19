import { describe, expect, test } from "bun:test";
import { computeCohensKappa, computeJaccardSimilarity } from "../../src/annotation/agreement";

describe("agreement metrics", () => {
  test("computeCohensKappa returns correct values", () => {
    // 100% agreement
    const a1 = ["retain", "retain", "deprecated"];
    const b1 = ["retain", "retain", "deprecated"];
    expect(computeCohensKappa(a1, b1)).toBe(1.0);

    // 0% agreement by chance vs actual (random mismatch)
    const a2 = ["retain", "deprecated"];
    const b2 = ["deprecated", "retain"];
    // Marginal distributions: A has 50% retain, 50% deprecated. B has 50% retain, 50% deprecated.
    // Observed agreement = 0.
    // Expected agreement = 0.5 * 0.5 + 0.5 * 0.5 = 0.5.
    // Kappa = (0 - 0.5) / (1 - 0.5) = -1.0.
    expect(computeCohensKappa(a2, b2)).toBe(-1.0);

    // Partially matching labels
    const a3 = ["retain", "retain", "retain", "retain"];
    const b3 = ["retain", "retain", "retain", "deprecated"];
    // Marginals: A has 1.0 retain. B has 0.75 retain, 0.25 deprecated.
    // Observed = 0.75.
    // Expected = 1.0 * 0.75 + 0 * 0.25 = 0.75.
    // Since observed === expected, Kappa is 0.
    expect(computeCohensKappa(a3, b3)).toBe(0.0);
  });

  test("computeJaccardSimilarity computes perfect, partial, and empty sets correctly", () => {
    expect(computeJaccardSimilarity(["c-1", "c-2"], ["c-1", "c-2"])).toBe(1.0);
    expect(computeJaccardSimilarity(["c-1", "c-2"], ["c-2", "c-3"])).toBe(1 / 3);
    expect(computeJaccardSimilarity([], [])).toBe(1.0);
    expect(computeJaccardSimilarity(["c-1"], [])).toBe(0.0);
  });
});
