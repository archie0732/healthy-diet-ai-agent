import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(
  EXP,
  "data/configs/v5_r2_15_compatible_selectivity_diagnostic",
);
const OUT = path.join(
  EXP,
  "results/v5/r2_15_compatible_selectivity_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const STOP = new Set(
  "what which when where why how should does apply applied and the for with from into about while that this are was were have has can may who whose without within current guidance recommendation evidence intake activity adults children population health".split(
    " ",
  ),
);
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
const coverage = (queryTerms: string[], texts: string[]) => {
  const terms = new Set(texts.flatMap(words));
  return queryTerms.length
    ? queryTerms.filter((term) => terms.has(term)).length / queryTerms.length
    : 0;
};

const [traceText, queryText, corpusText, manifestText, guardText] =
  await Promise.all([
    readFile(path.join(CONFIG, "runtime_trace.role_neutral.jsonl"), "utf8"),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_14_frozen_confirmation/runtime_queries.role_neutral.jsonl",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        EXP,
        "data/configs/v5_r2_14_frozen_confirmation/candidate_corpus.role_neutral.jsonl",
      ),
      "utf8",
    ),
    readFile(path.join(CONFIG, "FROZEN_MANIFEST.json"), "utf8"),
    readFile(path.join(CONFIG, "EXECUTION_GUARD.json"), "utf8"),
  ]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
if (
  guard.status !== "diagnostic_frozen_unlocked" ||
  guard.execution_count !== 0 ||
  sha256(manifestText) !== guard.manifest_sha256 ||
  sha256(traceText) !== manifest.runtime_trace_sha256
) {
  throw new Error("R2.15 diagnostic guard failed.");
}
const traces = parseJsonl(traceText);
const queryMap = new Map(
  parseJsonl(queryText).map((query) => [
    query.runtime_query_key,
    query.text,
  ]),
);
const itemMap = new Map(
  parseJsonl(corpusText).map((item) => [item.runtime_item_id, item]),
);
const variants = manifest.variants as string[];
const raw: any[] = [];
for (const trace of traces) {
  const query = queryMap.get(trace.runtime_query_key);
  const queryTerms = [...new Set(words(query))];
  const clauseFactor =
    1 +
    Math.min(
      3,
      (query.match(/\band\b|,|;|\bwhile\b|\bwhich\b/gi) ?? []).length,
    ) *
      0.2;
  const baseOrdered = [...trace.candidates].sort(
    (left, right) =>
      right.base_norm - left.base_norm ||
      left.runtime_item_id.localeCompare(right.runtime_item_id),
  );
  const baseRank = new Map(
    baseOrdered.map((candidate, index) => [
      candidate.runtime_item_id,
      index + 1,
    ]),
  );
  const byGroup = new Map<string, any[]>();
  for (const candidate of trace.candidates) {
    const item = itemMap.get(candidate.runtime_item_id);
    for (const group of item.candidate_group_ids) {
      byGroup.set(group, [...(byGroup.get(group) ?? []), candidate]);
    }
  }
  const groupSignals = new Map<string, number>();
  for (const [group, members] of byGroup) {
    if (members.length < 2) {
      groupSignals.set(group, 0);
      continue;
    }
    const texts = members.map(
      (member) => itemMap.get(member.runtime_item_id).text,
    );
    const joint = coverage(queryTerms, texts);
    const strongest = Math.max(
      ...texts.map((text) => coverage(queryTerms, [text])),
    );
    groupSignals.set(
      group,
      Math.max(0, joint - strongest) * clauseFactor,
    );
  }
  for (const variant of variants) {
    const gatedSignal = (candidate: any) => {
      const item = itemMap.get(candidate.runtime_item_id);
      let signal = 0;
      for (const group of item.candidate_group_ids) {
        const members = byGroup.get(group) ?? [];
        const maxBase = Math.max(
          ...members.map((member) => member.base_norm),
        );
        const bestRank = Math.min(
          ...members.map(
            (member) => baseRank.get(member.runtime_item_id) ?? Infinity,
          ),
        );
        const eligible =
          variant === "pair_score_g2.0" ||
          (variant === "pair_score_g2.0_base_gate_0.25" &&
            maxBase >= 0.25) ||
          (variant === "pair_score_g2.0_base_gate_0.50" &&
            maxBase >= 0.5) ||
          (variant === "pair_score_g2.0_top6_anchor" && bestRank <= 6) ||
          (variant === "pair_score_g2.0_top10_anchor" && bestRank <= 10);
        if (eligible) {
          signal = Math.max(signal, groupSignals.get(group) ?? 0);
        }
      }
      return signal;
    };
    const scored = trace.candidates
      .map((candidate: any) => {
        const pairSignal = gatedSignal(candidate);
        return {
          ...candidate,
          gated_pair_signal: pairSignal,
          score:
            candidate.base_norm +
            manifest.parameters.recency_weight * candidate.recency_norm +
            manifest.parameters.pair_signal_weight * pairSignal,
        };
      })
      .sort(
        (left: any, right: any) =>
          right.score - left.score ||
          left.runtime_item_id.localeCompare(right.runtime_item_id),
      );
    if (
      variant === "pair_score_g2.0" &&
      scored.some(
        (candidate: any) =>
          Math.abs(
            candidate.gated_pair_signal - candidate.original_pair_signal,
          ) > 1e-12,
      )
    ) {
      throw new Error("Control pair signal does not reproduce R2.14.");
    }
    raw.push({
      runtime_query_key: trace.runtime_query_key,
      variant,
      ordered_top20_sha256: trace.ordered_top20_sha256,
      top3: scored
        .slice(0, 3)
        .map((entry: any) => entry.runtime_item_id),
      top3_sha256: sha256(
        scored
          .slice(0, 3)
          .map((entry: any) => entry.runtime_item_id)
          .join("\n"),
      ),
    });
  }
}
if (raw.length !== traces.length * variants.length) {
  throw new Error("Judgments blocked until every diagnostic Top-3 is complete.");
}
const controlRows = raw.filter(
  (row) => row.variant === "pair_score_g2.0",
);
if (
  !controlRows.every((row) => {
    const frozen = traces.find(
      (trace) => trace.runtime_query_key === row.runtime_query_key,
    );
    return row.top3.join("\n") === frozen.r2_14_control_top3.join("\n");
  })
) {
  throw new Error("R2.15 control does not reproduce frozen R2.14 Top-3.");
}

const judgmentsText = await readFile(
  path.join(
    EXP,
    "data/configs/v5_r2_14_frozen_confirmation/judgments.sealed.jsonl",
  ),
  "utf8",
);
if (sha256(judgmentsText) !== manifest.r2_14_judgments_sha256) {
  throw new Error("R2.14 sealed judgment checksum mismatch.");
}
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
    both_evidence_coverage:
      required.size === 2 ? Number(hits === 2) : null,
    unsafe_top3_hit: Number(
      row.top3.some((id: string) => unsafe.has(id)),
    ),
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
    const subset = rows.filter((row) => row.stratum === stratum);
    const implicit = subset.filter(
      (row) => row.both_evidence_coverage !== null,
    );
    strata[stratum] = {
      required_micro_recall_at_3:
        subset.reduce((sum, row) => sum + row.required_hits_at_3, 0) /
        subset.reduce((sum, row) => sum + row.required_count, 0),
      both_evidence_coverage:
        implicit.length > 0
          ? implicit.reduce(
              (sum, row) => sum + row.both_evidence_coverage,
              0,
            ) / implicit.length
          : null,
      unsafe_top3_hit_rate:
        subset.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
        subset.length,
    };
  }
  return {
    variant,
    strata,
    overall_unsafe_top3_hit_rate:
      rows.reduce((sum, row) => sum + row.unsafe_top3_hit, 0) /
      rows.length,
  };
}
const summaries = variants.map(summarize);
const control = summaries.find(
  (summary) => summary.variant === "pair_score_g2.0",
)!;
const combinedBoth = (summary: any) =>
  (summary.strata.conditional_merge.both_evidence_coverage +
    summary.strata.compatible_history.both_evidence_coverage) /
  2;
const eligible = summaries
  .filter((summary) => summary.variant !== control.variant)
  .filter(
    (summary) =>
      summary.strata.current_only.required_micro_recall_at_3 >=
        control.strata.current_only.required_micro_recall_at_3 &&
      summary.strata.hard_negative_current.required_micro_recall_at_3 >=
        control.strata.hard_negative_current.required_micro_recall_at_3 &&
      summary.overall_unsafe_top3_hit_rate <=
        control.overall_unsafe_top3_hit_rate &&
      summary.strata.conditional_merge.required_micro_recall_at_3 >=
        control.strata.conditional_merge.required_micro_recall_at_3,
  );
const improving = eligible.filter(
  (summary) =>
    summary.strata.compatible_history.required_micro_recall_at_3 >
    control.strata.compatible_history.required_micro_recall_at_3,
);
const selected =
  [...improving].sort(
    (left, right) =>
      right.strata.compatible_history.required_micro_recall_at_3 -
        left.strata.compatible_history.required_micro_recall_at_3 ||
      right.strata.compatible_history.both_evidence_coverage -
        left.strata.compatible_history.both_evidence_coverage ||
      combinedBoth(right) - combinedBoth(left) ||
      left.overall_unsafe_top3_hit_rate -
        right.overall_unsafe_top3_hit_rate ||
      left.variant.localeCompare(right.variant),
  )[0] ?? null;
const result = {
  schema_version: "v5-r2.15-compatible-selectivity-diagnostic-result-1",
  status: selected
    ? "diagnostic_complete_repair_selected_new_confirmation_required"
    : "diagnostic_complete_no_eligible_repair",
  development_only: true,
  outcome_exposed_r2_14_data: true,
  retrieval_calls_performed: 0,
  r2_14_rerun_performed: false,
  all_variant_top3_complete_before_judgment_read: true,
  judgment_read_count: 1,
  control_reproduction_rate: 1,
  summaries,
  eligible_variants: eligible.map((summary) => summary.variant),
  selected_diagnostic_variant: selected?.variant ?? null,
  confirmation_required: selected !== null,
  promotion_evidence: false,
};
const rawText = `${evaluated
  .map((row) => JSON.stringify(row))
  .join("\n")}\n`;
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
