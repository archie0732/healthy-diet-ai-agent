import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
describe("V5 R2.21 lexical-weighted RRF diagnostic", () => {
  test("locks one diagnostic with no eligible repair", () => {
    const config = path.join(BASE, "data/configs/v5_r2_21_lexical_weighted_rrf");
    const results = path.join(BASE, "results/v5/r2_21_lexical_weighted_rrf");
    const guard = JSON.parse(readFileSync(path.join(config, "EXECUTION_GUARD.json"), "utf8"));
    const result = JSON.parse(readFileSync(path.join(results, "DIAGNOSTIC_RESULT.json"), "utf8"));
    const audit = JSON.parse(readFileSync(path.join(results, "AUDIT.json"), "utf8"));
    expect(guard.status).toBe("diagnostic_complete_locked");
    expect(guard.execution_count).toBe(1);
    expect(result.control_reproduced_exactly).toBe(true);
    expect(result.summaries.map((x: any) => x.required_micro_recall_at_20))
      .toEqual([51 / 52, 51 / 52, 50 / 52]);
    expect(result.summaries.every((x: any) =>
      x.strata.current_only.required_micro_recall_at_3 === 5 / 6)).toBe(true);
    expect(result.eligible_variants).toEqual([]);
    expect(result.selected_diagnostic_variant).toBeNull();
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_rerun_performed).toBe(false);
  });
});
