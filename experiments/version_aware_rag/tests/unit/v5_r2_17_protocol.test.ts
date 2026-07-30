import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
describe("V5 R2.17 candidate-recall diagnostic", () => {
  test("locks with no eligible repair", () => {
    const config = path.join(BASE, "data/configs/v5_r2_17_candidate_recall_diagnostic");
    const out = path.join(BASE, "results/v5/r2_17_candidate_recall_diagnostic");
    const guard = JSON.parse(readFileSync(path.join(config, "EXECUTION_GUARD.json"), "utf8"));
    const result = JSON.parse(readFileSync(path.join(out, "DIAGNOSTIC_RESULT.json"), "utf8"));
    const audit = JSON.parse(readFileSync(path.join(out, "AUDIT.json"), "utf8"));
    expect(guard.status).toBe("diagnostic_complete_locked");
    expect(guard.execution_count).toBe(1);
    expect(result.selected_diagnostic_variant).toBeNull();
    expect(result.eligible_variants).toEqual([]);
    expect(result.summaries.map((x: any) => x.required_micro_recall_at_20)).toEqual([44 / 52, 43 / 52, 44 / 52, 42 / 52]);
    expect(result.r2_16_rerun_performed).toBe(false);
    expect(audit.status).toBe("audit_pass");
  });
});
