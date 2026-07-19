import { describe, expect, test } from "bun:test";
import { PolicyEngine } from "../../src/versioning/policy_engine";

describe("policy engine suite - plan 6 requirements", () => {
  test("resolves correct policy state and target scope based on metadata", () => {
    // superseded -> deprecated
    const dec1 = PolicyEngine.resolve("superseded", "p-1");
    expect(dec1.state).toBe("deprecated");
    expect(dec1.appliesToPopulations).toContain("general");

    // conditional_difference -> retain with highly active scope
    const dec2 = PolicyEngine.resolve("conditional_difference", "p-2");
    expect(dec2.state).toBe("retain");
    expect(dec2.appliesToPopulations).toContain("highly active");
    expect(dec2.appliesUnderConditions).toContain("active sweat loss");

    // Scope driven by metadata (population_tags), NOT hardcoded lineage ID!
    const dec3 = PolicyEngine.resolve("superseded", "p-3", {
      population_tags: ["highly active"],
      condition_tags: ["active sweat loss"]
    });
    expect(dec3.appliesToPopulations).toContain("highly active");
    expect(dec3.appliesUnderConditions).toContain("active sweat loss");
  });

  test("oracle vs predicted relation mode handling and validFrom/To scope", () => {
    const oracleDec = PolicyEngine.resolve("superseded", "p-4", {
      mode: "oracle_relation",
      oldEdition: "2015-2020",
      newEdition: "2025-2030"
    });
    expect(oracleDec.state).toBe("deprecated");
    expect(oracleDec.validFrom).toBe("2015-2020");
    expect(oracleDec.validTo).toBe("2025-2030");

    const predDec = PolicyEngine.resolve("conditional_difference", "p-5", {
      mode: "predicted_relation",
      oldEdition: "2015-2020",
      newEdition: "2025-2030"
    });
    expect(predDec.state).toBe("retain");
    expect(predDec.appliesToPopulations).toContain("highly active");
  });

  test("lineage ID independence - changing lineage ID produces exact same PolicyDecision", () => {
    const opts1 = {
      oldEdition: "2015-2020",
      newEdition: "2025-2030",
      population_tags: ["highly active"],
      condition_tags: ["active sweat loss"]
    };

    const dec1 = PolicyEngine.resolve("superseded", "p-same-id", { ...opts1, oldChunkLineage: "lineage-sodium" }, "rule change");
    const dec2 = PolicyEngine.resolve("superseded", "p-same-id", { ...opts1, oldChunkLineage: "lineage-protein" }, "rule change");

    // PolicyDecision must be 100% identical regardless of lineage ID!
    expect(dec1).toEqual(dec2);
  });
});



