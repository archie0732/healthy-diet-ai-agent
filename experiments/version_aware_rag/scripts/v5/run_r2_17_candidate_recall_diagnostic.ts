import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateR212CandidatePool } from "../../src/retrieval/r2_12_candidate_generator";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_17_candidate_recall_diagnostic");
const OUT = path.join(EXP, "results/v5/r2_17_candidate_recall_diagnostic");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

const [manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
if (
  guard.status !== "diagnostic_frozen_unlocked" ||
  guard.execution_count !== 0 ||
  sha256(manifestText) !== guard.manifest_sha256
) {
  throw new Error("R2.17 execution guard failed.");
}
for (const input of Object.values(manifest.inputs) as any[]) {
  if (sha256(await readFile(path.join(EXP, input.path))) !== input.sha256) {
    throw new Error(`Frozen input mismatch: ${input.path}`);
  }
}
const queries = parseJsonl(
  await readFile(path.join(EXP, manifest.inputs.queries.path), "utf8"),
);
const corpus = parseJsonl(
  await readFile(path.join(EXP, manifest.inputs.corpus.path), "utf8"),
);
const poolRows: any[] = [];
for (const query of queries) {
  for (const seedCount of manifest.seed_counts as number[]) {
    const ids = generateR212CandidatePool(
      query.text,
      corpus.map((item) => ({
        runtimeItemId: item.runtime_item_id,
        text: item.text,
        candidateGroupIds: item.candidate_group_ids,
      })),
      {
        bm25K1: manifest.parameters.bm25_k1,
        bm25B: manifest.parameters.bm25_b,
        seedCount,
        poolSize: manifest.parameters.pool_size,
      },
    ).map((entry) => entry.runtimeItemId);
    poolRows.push({
      runtime_query_key: query.runtime_query_key,
      variant: `bm25_group_expand_seed${seedCount}`,
      seed_count: seedCount,
      ordered_top20_ids: ids,
      ordered_top20_sha256: sha256(ids.join("\n")),
    });
  }
}
if (poolRows.length !== queries.length * manifest.seed_counts.length) {
  throw new Error("Judgments blocked until all candidate pools complete.");
}
const judgmentsText = await readFile(
  path.join(EXP, manifest.inputs.judgments.path),
  "utf8",
);
const judgments = new Map(
  parseJsonl(judgmentsText).map((row) => [row.runtime_query_key, row]),
);
const evaluated = poolRows.map((row) => {
  const judgment = judgments.get(row.runtime_query_key);
  const required = new Set<string>(judgment.required_item_ids);
  const hits = row.ordered_top20_ids.filter((id: string) =>
    required.has(id),
  ).length;
  return {
    ...row,
    query_id: judgment.query_id,
    stratum: judgment.stratum,
    required_count: required.size,
    required_hits_at_20: hits,
    required_recall_at_20: hits / required.size,
  };
});
const strata = [
  "conditional_merge",
  "compatible_history",
  "current_only",
  "hard_negative_current",
];
const summaries = (manifest.seed_counts as number[]).map((seedCount) => {
  const rows = evaluated.filter((row) => row.seed_count === seedCount);
  const stratumRecall = Object.fromEntries(
    strata.map((stratum) => {
      const selected = rows.filter((row) => row.stratum === stratum);
      return [
        stratum,
        selected.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
          selected.reduce((sum, row) => sum + row.required_count, 0),
      ];
    }),
  );
  return {
    variant: `bm25_group_expand_seed${seedCount}`,
    seed_count: seedCount,
    required_micro_recall_at_20:
      rows.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
      rows.reduce((sum, row) => sum + row.required_count, 0),
    stratum_recall_at_20: stratumRecall,
  };
});
const control = summaries.find((summary) => summary.seed_count === 14)!;
const eligible = summaries.filter(
  (summary) =>
    summary.required_micro_recall_at_20 >= 0.9 &&
    strata.every(
      (stratum) =>
        summary.stratum_recall_at_20[stratum] >=
        control.stratum_recall_at_20[stratum],
    ),
);
const minimumStratum = (summary: any) =>
  Math.min(...Object.values(summary.stratum_recall_at_20) as number[]);
const selected =
  [...eligible].sort(
    (left, right) =>
      right.required_micro_recall_at_20 - left.required_micro_recall_at_20 ||
      minimumStratum(right) - minimumStratum(left) ||
      right.seed_count - left.seed_count,
  )[0] ?? null;
const result = {
  schema_version: "v5-r2.17-candidate-recall-diagnostic-result-1",
  status: selected
    ? "diagnostic_complete_repair_selected_new_confirmation_required"
    : "diagnostic_complete_no_eligible_repair",
  development_only: true,
  outcome_exposed_r2_16_data: true,
  r2_16_rerun_performed: false,
  top3_reranking_performed: false,
  all_candidate_pools_completed_before_judgment_read: true,
  judgment_read_count: 1,
  summaries,
  eligible_variants: eligible.map((summary) => summary.variant),
  selected_diagnostic_variant: selected?.variant ?? null,
  confirmation_required: selected !== null,
  promotion_evidence: false,
};
const rawText = `${evaluated.map((row) => JSON.stringify(row)).join("\n")}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "raw_candidate_results.jsonl"), rawText),
  writeFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), resultText),
]);
await writeFile(
  path.join(CONFIG, "EXECUTION_GUARD.json"),
  `${JSON.stringify(
    {
      ...guard,
      status: "diagnostic_complete_locked",
      execution_count: 1,
      raw_results_sha256: sha256(rawText),
      diagnostic_result_sha256: sha256(resultText),
      selected_diagnostic_variant: selected?.variant ?? null,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(result, null, 2));
