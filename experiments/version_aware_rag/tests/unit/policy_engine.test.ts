import { describe, expect, test } from "bun:test";
import { PolicyEngine } from "../../src/versioning/policy_engine";

describe("policy engine", () => {
  test("resolves correct policy state and target scope", () => {
    // superseded -> deprecated
    const dec1 = PolicyEngine.resolve("superseded", "p-1");
    expect(dec1.state).toBe("deprecated");
    expect(dec1.appliesToPopulations).toEqual([]);

    // conditional_difference -> retain with highly active scope
    const dec2 = PolicyEngine.resolve("conditional_difference", "p-2");
    expect(dec2.state).toBe("retain");
    expect(dec2.appliesToPopulations).toContain("highly active");
    expect(dec2.appliesUnderConditions).toContain("active sweat loss");

    // lineage-sodium old chunk -> automatically resolves with highly active scope
    const dec3 = PolicyEngine.resolve("superseded", "p-3", "lineage-sodium");
    expect(dec3.appliesToPopulations).toContain("highly active");
  });
});
