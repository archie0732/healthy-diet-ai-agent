import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");

describe("V5 R2.19 neural-hybrid candidate diagnostic", () => {
  test("selects the frozen BM25-MiniLM fusion and preserves boundaries", () => {
    const config = path.join(
      BASE,
      "data/configs/v5_r2_19_neural_hybrid_diagnostic",
    );
    const out = path.join(
      BASE,
      "results/v5/r2_19_neural_hybrid_diagnostic",
    );
    const guard = JSON.parse(
      readFileSync(path.join(config, "EXECUTION_GUARD.json"), "utf8"),
    );
    const result = JSON.parse(
      readFileSync(path.join(out, "DIAGNOSTIC_RESULT.json"), "utf8"),
    );
    const embedding = JSON.parse(
      readFileSync(path.join(out, "EMBEDDING_INTEGRITY.json"), "utf8"),
    );
    const audit = JSON.parse(
      readFileSync(path.join(out, "AUDIT.json"), "utf8"),
    );
    expect(guard.status).toBe("diagnostic_complete_locked");
    expect(guard.execution_count).toBe(1);
    expect(result.selected_diagnostic_variant).toBe(
      "bm25_minilm_rrf_k60_top20",
    );
    expect(
      result.summaries.map(
        (summary: any) => summary.required_micro_recall_at_20,
      ),
    ).toEqual([44 / 52, 49 / 52, 50 / 52, 49 / 52]);
    expect(result.r2_16_rerun_performed).toBe(false);
    expect(result.top3_reranking_performed).toBe(false);
    expect(embedding.dimensions).toEqual([384]);
    expect(embedding.all_l2_normalized).toBe(true);
    expect(audit.status).toBe("audit_pass");
  });
});
