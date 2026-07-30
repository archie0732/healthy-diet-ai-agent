import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: Buffer | string) =>
  value
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

describe("V5 R2.15 compatible-history selectivity diagnostic", () => {
  test("freezes outcome-exposed traces without allowing retrieval", () => {
    const directory = path.join(
      BASE,
      "data/configs/v5_r2_15_compatible_selectivity_diagnostic",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(directory, "FROZEN_MANIFEST.json"), "utf8"),
    );
    const traceBytes = readFileSync(
      path.join(directory, "runtime_trace.role_neutral.jsonl"),
    );
    const traces = parseJsonl(traceBytes);
    expect(traces).toHaveLength(32);
    expect(manifest.variants).toHaveLength(5);
    expect(sha256(traceBytes)).toBe(manifest.runtime_trace_sha256);
    expect(manifest.retrieval_calls_allowed).toBe(false);
    expect(manifest.r2_14_rerun_allowed).toBe(false);
    expect(
      traces.every(
        (trace) =>
          trace.ordered_top20_ids.length === 20 &&
          trace.candidates.length === 20,
      ),
    ).toBe(true);
  });

  test("selects the Top-6 anchor with full control reproduction", () => {
    const directory = path.join(
      BASE,
      "results/v5/r2_15_compatible_selectivity_diagnostic",
    );
    const result = JSON.parse(
      readFileSync(path.join(directory, "DIAGNOSTIC_RESULT.json"), "utf8"),
    );
    expect(result.control_reproduction_rate).toBe(1);
    expect(result.retrieval_calls_performed).toBe(0);
    expect(result.r2_14_rerun_performed).toBe(false);
    expect(result.selected_diagnostic_variant).toBe(
      "pair_score_g2.0_top6_anchor",
    );
    const control = result.summaries.find(
      (summary: any) => summary.variant === "pair_score_g2.0",
    );
    const selected = result.summaries.find(
      (summary: any) =>
        summary.variant === result.selected_diagnostic_variant,
    );
    expect(
      control.strata.compatible_history.required_micro_recall_at_3,
    ).toBe(0.3);
    expect(
      selected.strata.compatible_history.required_micro_recall_at_3,
    ).toBe(0.35);
    expect(
      selected.strata.conditional_merge.required_micro_recall_at_3,
    ).toBe(0.6);
    expect(result.promotion_evidence).toBe(false);
    expect(result.confirmation_required).toBe(true);
  });

  test("locks one diagnostic execution and preserves R2.14", () => {
    const config = path.join(
      BASE,
      "data/configs/v5_r2_15_compatible_selectivity_diagnostic",
    );
    const resultDirectory = path.join(
      BASE,
      "results/v5/r2_15_compatible_selectivity_diagnostic",
    );
    const guard = JSON.parse(
      readFileSync(path.join(config, "EXECUTION_GUARD.json"), "utf8"),
    );
    const audit = JSON.parse(
      readFileSync(path.join(resultDirectory, "AUDIT.json"), "utf8"),
    );
    expect(guard.status).toBe("diagnostic_complete_locked");
    expect(guard.execution_count).toBe(1);
    expect(audit.status).toBe("audit_pass");
    expect(audit.retrieval_calls_performed).toBe(0);
    expect(audit.r2_14_execution_count_preserved).toBe(1);
  });
});
