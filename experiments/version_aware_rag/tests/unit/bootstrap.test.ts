import { describe, expect, test } from "bun:test";
import { computeBootstrapCI } from "../../src/evaluation/bootstrap";

describe("bootstrap CI", () => {
  test("reproduces identical bounds under fixed seed", () => {
    const data = [0.8, 0.9, 0.4, 0.7, 1.0, 0.6, 0.5, 0.9, 0.8, 0.8];
    const res1 = computeBootstrapCI(data, 100, 42);
    const res2 = computeBootstrapCI(data, 100, 42);

    expect(res1.mean).toBeCloseTo(0.74);
    expect(res1.ciLow).toBe(res2.ciLow);
    expect(res1.ciHigh).toBe(res2.ciHigh);
  });
});
