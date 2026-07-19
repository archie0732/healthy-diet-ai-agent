import { describe, expect, test } from "bun:test";
import {
  computeWilcoxonSignedRank,
  computeMcNemarTest,
  applyHolmCorrection,
  testNonInferiority,
  validateQueryAlignment
} from "../../src/evaluation/paired_tests";

describe("paired tests & statistical guards", () => {
  test("validateQueryAlignment throws error on count mismatch or order mismatch", () => {
    expect(() => validateQueryAlignment(["q1", "q2"], ["q1"])).toThrow(/count mismatch/);
    expect(() => validateQueryAlignment(["q1", "q2"], ["q2", "q1"])).toThrow(/order mismatch/);
    expect(() => validateQueryAlignment(["q1", "q2"], ["q1", "q2"])).not.toThrow();
  });

  test("computes Wilcoxon signed-rank p-values for simple differences", () => {
    const a1 = [1, 2, 3, 4, 5];
    const b1 = [1, 2, 3, 4, 5];
    const res1 = computeWilcoxonSignedRank(a1, b1);
    expect(res1.pValue).toBe(1.0);
    expect(res1.isSignificant).toBe(false);

    const a2 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const b2 = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
    const res2 = computeWilcoxonSignedRank(a2, b2);
    expect(res2.pValue).toBeLessThan(0.05);
    expect(res2.isSignificant).toBe(true);
  });

  test("computes McNemar test for paired binary rates", () => {
    const a = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const res = computeMcNemarTest(a, b);
    expect(res.b).toBe(0);
    expect(res.c).toBe(10);
    expect(res.isSignificant).toBe(true);
  });

  test("applies Holm-Bonferroni correction to multiple p-values", () => {
    const pVals = [
      { name: "p1", pValue: 0.01 },
      { name: "p2", pValue: 0.04 },
      { name: "p3", pValue: 0.50 }
    ];
    const adjusted = applyHolmCorrection(pVals);
    expect(adjusted[0].adjustedPValue).toBe(0.03); // 0.01 * 3
    expect(adjusted[1].adjustedPValue).toBe(0.08); // 0.04 * 2
    expect(adjusted[2].adjustedPValue).toBe(0.50); // 0.50 * 1
  });

  test("tests non-inferiority margin for stale retrieval rate", () => {
    const resPass = testNonInferiority(0.10, 0.00, 0.05);
    expect(resPass.passedNonInferiority).toBe(true);

    const resFail = testNonInferiority(0.00, 0.15, 0.05);
    expect(resFail.passedNonInferiority).toBe(false);
  });
});

