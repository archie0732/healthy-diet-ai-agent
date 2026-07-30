import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(EXP, "data/configs/v5_r2_13_top3_diagnostic");
const OUT = path.join(EXP, "results/v5/r2_13_top3_diagnostic");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const STOP = new Set(
  "what which when where why how should does apply applied and the for with from into about while that this are was were have has can may who whose without within current guidance recommendation evidence intake activity adults children population health".split(" "),
);
const words = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
const coverage = (queryTerms: string[], texts: string[]) => {
  const terms = new Set(texts.flatMap(words));
  return queryTerms.length
    ? queryTerms.filter((term) => terms.has(term)).length / queryTerms.length
    : 0;
};
const [traceText, queriesText, corpusText, manifestText, guardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "runtime_trace.role_neutral.jsonl"), "utf8"),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_12_frozen_confirmation/runtime_queries.role_neutral.jsonl",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_12_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
      ),
      "utf8",
    ),
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  ]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
if (
  guard.status !== "top3_diagnostic_frozen_unlocked" ||
  guard.execution_count !== 0 ||
  sha256(manifestText) !== guard.manifest_sha256 ||
  sha256(traceText) !== manifest.runtime_trace_sha256
) throw new Error("R2.13 diagnostic guard failed.");
const traces = parseJsonl(traceText);
const queryMap = new Map(
  parseJsonl(queriesText).map((query) => [query.runtime_query_key, query.text]),
);
const itemMap = new Map(
  parseJsonl(corpusText).map((item) => [item.runtime_item_id, item]),
);
const variants = manifest.variants as string[];
const raw: any[] = [];
for (const trace of traces) {
  const query = queryMap.get(trace.runtime_query_key);
  const queryTerms = [...new Set(words(query))];
  const clauseCount =
    (query.match(/\band\b|,|;|\bwhile\b|\bwhich\b/gi) ?? []).length;
  const byGroup = new Map<string, any[]>();
  for (const score of trace.candidates) {
    const item = itemMap.get(score.runtime_item_id);
    for (const group of item.candidate_group_ids) {
      byGroup.set(group, [...(byGroup.get(group) ?? []), score]);
    }
  }
  for (const variant of variants) {
    const groupWeight = variant.includes("g2.0")
      ? 2
      : variant.includes("g1.0")
        ? 1
        : 0.5;
    const scored = trace.candidates
      .map((candidate: any) => ({
        ...candidate,
        score:
          candidate.base_norm +
          0.2 * candidate.recency_norm +
          groupWeight * candidate.pair_signal,
      }))
      .sort(
        (left: any, right: any) =>
          right.score - left.score ||
          left.runtime_item_id.localeCompare(right.runtime_item_id),
      );
    let top3 = scored.slice(0, 3).map((entry: any) => entry.runtime_item_id);
    if (variant.startsWith("pair_quota") && clauseCount > 0) {
      const pairs = [...byGroup.entries()]
        .filter(([, members]) => members.length >= 2)
        .map(([group, members]) => {
          const pair = members.slice(0, 2);
          const texts = pair.map((member) => itemMap.get(member.runtime_item_id).text);
          const joint = coverage(queryTerms, texts);
          const strongest = Math.max(...texts.map((text) => coverage(queryTerms, [text])));
          const gain = joint - strongest;
          const score =
            gain +
            0.25 *
              (pair.reduce((sum, member) => sum + member.base_norm, 0) / 2) +
            0.1 *
              (pair.reduce((sum, member) => sum + member.recency_norm, 0) / 2);
          return { group, pair, gain, score };
        })
        .filter((pair) => pair.gain > 0)
        .sort(
          (left, right) =>
            right.score - left.score || left.group.localeCompare(right.group),
        );
      if (pairs.length) {
        const pairIds = pairs[0].pair.map((member) => member.runtime_item_id);
        const third = scored.find(
          (entry: any) => !pairIds.includes(entry.runtime_item_id),
        )!.runtime_item_id;
        top3 = [...pairIds, third];
      }
    }
    raw.push({
      runtime_query_key: trace.runtime_query_key,
      variant,
      top3,
      top3_sha256: sha256(top3.join("\n")),
    });
  }
}
if (raw.length !== traces.length * variants.length) {
  throw new Error("Judgments blocked until every Top-3 is complete.");
}
const judgmentsText = await readFile(
  path.join(
    EXP,
    "data/configs/v5_r2_12_frozen_confirmation/judgments.sealed.jsonl",
  ),
  "utf8",
);
const judgments = new Map(
  parseJsonl(judgmentsText).map((row) => [row.runtime_query_key, row]),
);
const evaluated = raw.map((row) => {
  const judgment = judgments.get(row.runtime_query_key);
  const required = new Set<string>(judgment.required_item_ids);
  const unsafe = new Set<string>(judgment.unsafe_item_ids);
  const hits = row.top3.filter((id: string) => required.has(id)).length;
  return {
    ...row,
    query_id: judgment.query_id,
    stratum: judgment.stratum,
    required_count: required.size,
    required_hits_at_3: hits,
    required_recall_at_3: hits / required.size,
    both_evidence_coverage: required.size === 2 ? Number(hits === 2) : null,
    unsafe_top3_hit: Number(row.top3.some((id: string) => unsafe.has(id))),
  };
});
function summarize(variant: string) {
  const rows = evaluated.filter((row) => row.variant === variant);
  const strata: Record<string, any> = {};
  for (const stratum of [
    "conditional_merge",
    "compatible_history",
    "current_only",
    "hard_negative_current",
  ]) {
    const selected = rows.filter((row) => row.stratum === stratum);
    strata[stratum] = {
      required_micro_recall_at_3:
        selected.reduce((sum, row) => sum + row.required_hits_at_3, 0) /
        selected.reduce((sum, row) => sum + row.required_count, 0),
      both_evidence_coverage:
        selected[0].both_evidence_coverage === null
          ? null
          : selected.reduce((sum, row) => sum + row.both_evidence_coverage, 0) /
            selected.length,
      unsafe_top3_hit_rate:
        selected.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
        selected.length,
    };
  }
  return { variant, strata };
}
const summaries = variants.map(summarize);
const baseline = summaries[0];
const combinedBoth = (summary: any) =>
  (summary.strata.conditional_merge.both_evidence_coverage +
    summary.strata.compatible_history.both_evidence_coverage) /
  2;
const score = (summary: any) =>
  summary.strata.conditional_merge.required_micro_recall_at_3 +
  summary.strata.compatible_history.required_micro_recall_at_3 +
  combinedBoth(summary) -
  Object.values(summary.strata).reduce(
    (sum: number, stratum: any) => sum + stratum.unsafe_top3_hit_rate,
    0,
  ) -
  Math.max(
    0,
    baseline.strata.current_only.required_micro_recall_at_3 -
      summary.strata.current_only.required_micro_recall_at_3,
  ) -
  Math.max(
    0,
    baseline.strata.hard_negative_current.required_micro_recall_at_3 -
      summary.strata.hard_negative_current.required_micro_recall_at_3,
  );
const selected = [...summaries].sort(
  (left, right) =>
    score(right) - score(left) || left.variant.localeCompare(right.variant),
)[0];
const result = {
  schema_version: "v5-r2.13-top3-diagnostic-result-1",
  status: "diagnostic_complete_new_confirmation_required",
  development_only: true,
  outcome_exposed_r2_12_data: true,
  promotion_evidence: false,
  all_top3_complete_before_judgment_read: true,
  judgment_read_count: 1,
  selected_diagnostic_variant: selected.variant,
  selection_score: score(selected),
  summaries,
  confirmation_required: true,
};
const rawText = `${evaluated.map((row) => JSON.stringify(row)).join("\n")}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "raw_top3_results.jsonl"), rawText),
  writeFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), resultText),
]);
await writeFile(
  path.join(CONFIG, "EXECUTION_GUARD.json"),
  `${JSON.stringify(
    {
      ...guard,
      status: "top3_diagnostic_complete_locked",
      execution_count: 1,
      raw_results_sha256: sha256(rawText),
      diagnostic_result_sha256: sha256(resultText),
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(result, null, 2));
