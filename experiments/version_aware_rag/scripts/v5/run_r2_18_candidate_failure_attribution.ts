import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateR212CandidatePool } from "../../src/retrieval/r2_12_candidate_generator";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_18_candidate_failure_attribution");
const OUT = path.join(EXP, "results/v5/r2_18_candidate_failure_attribution");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
type Item = {
  runtime_item_id: string;
  text: string;
  candidate_group_ids: string[];
};
const STOP = new Set(
  "what which when where why how should does apply applied and the for with from into about while that this are was were have has can may who whose without within current guidance recommendation evidence intake activity adults children population health".split(" "),
);
const words = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
function bm25(query: string, corpus: Item[], k1: number, b: number) {
  const docs = corpus.map((item) => words(item.text));
  const lengths = docs.map((doc) => doc.length);
  const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  return corpus.map((item, index) => {
    const tf = new Map<string, number>();
    for (const term of docs[index]) tf.set(term, (tf.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of words(query)) {
      const count = tf.get(term) ?? 0;
      if (!count) continue;
      const frequency = df.get(term) ?? 0;
      const idf = Math.log((corpus.length - frequency + 0.5) / (frequency + 0.5) + 1);
      score += idf * ((count * (k1 + 1)) / (count + k1 * (1 - b + b * lengths[index] / average)));
    }
    return { item, score };
  }).sort((left, right) =>
    right.score - left.score ||
    left.item.runtime_item_id.localeCompare(right.item.runtime_item_id));
}
const splitClauses = (text: string) => [
  ...new Set(
    [text, ...text.split(/[,;?]|\b(?:and|while|but|which)\b/gi)]
      .map((part) => part.trim())
      .filter((part) => words(part).length >= 3),
  ),
];
function rrf(rankings: Item[][], k: number) {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((item, index) =>
      scores.set(item.runtime_item_id, (scores.get(item.runtime_item_id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...rankings[0]].sort((left, right) =>
    (scores.get(right.runtime_item_id) ?? 0) - (scores.get(left.runtime_item_id) ?? 0) ||
    left.runtime_item_id.localeCompare(right.runtime_item_id));
}
function iterativeClosure(ranked: Item[], seedCount: number, poolSize: number) {
  const selected = ranked.slice(0, seedCount);
  const ids = new Set(selected.map((item) => item.runtime_item_id));
  let cursor = 0;
  while (cursor < selected.length && selected.length < poolSize) {
    const source = selected[cursor++];
    for (const item of ranked) {
      if (selected.length >= poolSize) break;
      if (
        !ids.has(item.runtime_item_id) &&
        item.candidate_group_ids.some((group) => source.candidate_group_ids.includes(group))
      ) {
        selected.push(item);
        ids.add(item.runtime_item_id);
      }
    }
  }
  for (const item of ranked) {
    if (selected.length >= poolSize) break;
    if (!ids.has(item.runtime_item_id)) {
      selected.push(item);
      ids.add(item.runtime_item_id);
    }
  }
  return selected;
}
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
) throw new Error("R2.18 guard failed.");
for (const input of Object.values(manifest.inputs) as any[]) {
  if (sha256(await readFile(path.join(EXP, input.path))) !== input.sha256) {
    throw new Error(`Frozen input mismatch: ${input.path}`);
  }
}
const queries = parseJsonl(await readFile(path.join(EXP, manifest.inputs.queries.path), "utf8"));
const corpus = parseJsonl(await readFile(path.join(EXP, manifest.inputs.corpus.path), "utf8")) as Item[];
const rows: any[] = [];
for (const query of queries) {
  const whole = bm25(query.text, corpus, 1.2, 0.75).map((entry) => entry.item);
  const clause = rrf(splitClauses(query.text).map((part) =>
    bm25(part, corpus, 1.2, 0.75).map((entry) => entry.item)), 60);
  const hybrid = rrf([whole, clause], 60);
  const controlIds = generateR212CandidatePool(
    query.text,
    corpus.map((item) => ({
      runtimeItemId: item.runtime_item_id,
      text: item.text,
      candidateGroupIds: item.candidate_group_ids,
    })),
    { bm25K1: 1.2, bm25B: 0.75, seedCount: 12, poolSize: 20 },
  ).map((entry) => entry.runtimeItemId);
  const pools: Record<string, string[]> = {
    bm25_seed12_control: controlIds,
    bm25_seed12_iterative_closure: iterativeClosure(whole, 12, 20).map((item) => item.runtime_item_id),
    clause_rrf_seed12_iterative_closure: iterativeClosure(clause, 12, 20).map((item) => item.runtime_item_id),
    hybrid_rank_fusion_seed12_iterative_closure: iterativeClosure(hybrid, 12, 20).map((item) => item.runtime_item_id),
  };
  for (const variant of manifest.variants) {
    const ids = pools[variant];
    rows.push({
      runtime_query_key: query.runtime_query_key,
      variant,
      ordered_top20_ids: ids,
      ordered_top20_sha256: sha256(ids.join("\n")),
    });
  }
}
if (rows.length !== queries.length * manifest.variants.length) {
  throw new Error("Judgments blocked until all pools complete.");
}
const judgments = new Map(
  parseJsonl(await readFile(path.join(EXP, manifest.inputs.judgments.path), "utf8"))
    .map((row) => [row.runtime_query_key, row]),
);
const evaluated = rows.map((row) => {
  const judgment = judgments.get(row.runtime_query_key);
  const required = new Set<string>(judgment.required_item_ids);
  const hits = row.ordered_top20_ids.filter((id: string) => required.has(id)).length;
  return {
    ...row,
    query_id: judgment.query_id,
    stratum: judgment.stratum,
    required_count: required.size,
    required_hits_at_20: hits,
  };
});
const strata = ["conditional_merge", "compatible_history", "current_only", "hard_negative_current"];
const summaries = manifest.variants.map((variant: string) => {
  const selected = evaluated.filter((row) => row.variant === variant);
  return {
    variant,
    required_micro_recall_at_20:
      selected.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
      selected.reduce((sum, row) => sum + row.required_count, 0),
    stratum_recall_at_20: Object.fromEntries(strata.map((stratum) => {
      const subset = selected.filter((row) => row.stratum === stratum);
      return [stratum,
        subset.reduce((sum, row) => sum + row.required_hits_at_20, 0) /
        subset.reduce((sum, row) => sum + row.required_count, 0)];
    })),
  };
});
const control = summaries[0];
const eligible = summaries.filter((summary: any) =>
  summary.required_micro_recall_at_20 >= 0.9 &&
  strata.every((stratum) =>
    summary.stratum_recall_at_20[stratum] >= control.stratum_recall_at_20[stratum]));
const minStratum = (summary: any) =>
  Math.min(...Object.values(summary.stratum_recall_at_20) as number[]);
const selected = [...eligible].sort((left: any, right: any) =>
  right.required_micro_recall_at_20 - left.required_micro_recall_at_20 ||
  minStratum(right) - minStratum(left) ||
  manifest.variants.indexOf(left.variant) - manifest.variants.indexOf(right.variant))[0] ?? null;
const result = {
  schema_version: "v5-r2.18-candidate-failure-attribution-result-1",
  status: selected ? "diagnostic_complete_repair_selected" : "diagnostic_complete_no_eligible_repair",
  outcome_exposed_r2_16_data: true,
  r2_16_rerun_performed: false,
  all_pools_completed_before_judgment_read: true,
  judgment_read_count: 1,
  summaries,
  eligible_variants: eligible.map((summary: any) => summary.variant),
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
await writeFile(path.join(CONFIG, "EXECUTION_GUARD.json"), `${JSON.stringify({
  ...guard,
  status: "diagnostic_complete_locked",
  execution_count: 1,
  raw_results_sha256: sha256(rawText),
  diagnostic_result_sha256: sha256(resultText),
  selected_diagnostic_variant: selected?.variant ?? null,
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
