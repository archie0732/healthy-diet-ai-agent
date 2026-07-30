import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const CONFIG = path.join(
  EXP,
  "data/configs/v5_r2_12_candidate_recall_diagnostic",
);
const OUT = path.join(
  EXP,
  "results/v5/r2_12_candidate_recall_diagnostic",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
type Item = {
  runtime_item_id: string;
  text: string;
  publication_year: number;
  candidate_group_ids: string[];
};
type Query = { runtime_query_key: string; text: string };

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
const splitClauses = (text: string, minimumTokens: number) => {
  const clauses = text
    .split(/[,;?]|\b(?:and|while|but|why|which)\b/gi)
    .map((clause) => clause.trim())
    .filter((clause) => words(clause).length >= minimumTokens);
  return [...new Set([text, ...clauses])];
};
function bm25(query: string, corpus: Item[], k1: number, b: number) {
  const docs = corpus.map((item) => words(item.text));
  const lengths = docs.map((tokens) => tokens.length);
  const averageLength =
    lengths.reduce((sum, length) => sum + length, 0) /
    Math.max(1, lengths.length);
  const frequencies = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
  }
  return corpus
    .map((item, index) => {
      const tf = new Map<string, number>();
      for (const term of docs[index]) tf.set(term, (tf.get(term) ?? 0) + 1);
      let score = 0;
      for (const term of words(query)) {
        const count = tf.get(term) ?? 0;
        if (!count) continue;
        const df = frequencies.get(term) ?? 0;
        const idf = Math.log(
          (corpus.length - df + 0.5) / (df + 0.5) + 1,
        );
        score +=
          idf *
          ((count * (k1 + 1)) /
            (count + k1 * (1 - b + (b * lengths[index]) / averageLength)));
      }
      return { item, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.runtime_item_id.localeCompare(right.item.runtime_item_id),
    );
}
function clauseRrf(
  query: string,
  corpus: Item[],
  k1: number,
  b: number,
  rrfK: number,
  minimumTokens: number,
) {
  const score = new Map<string, number>();
  for (const clause of splitClauses(query, minimumTokens)) {
    const ranked = bm25(clause, corpus, k1, b);
    ranked.forEach((entry, index) =>
      score.set(
        entry.item.runtime_item_id,
        (score.get(entry.item.runtime_item_id) ?? 0) + 1 / (rrfK + index + 1),
      ),
    );
  }
  return [...corpus].sort(
    (left, right) =>
      (score.get(right.runtime_item_id) ?? 0) -
        (score.get(left.runtime_item_id) ?? 0) ||
      left.runtime_item_id.localeCompare(right.runtime_item_id),
  );
}
function groupExpand(ranked: Item[], seedCount: number, poolSize: number) {
  const selected = ranked.slice(0, seedCount);
  const selectedIds = new Set(selected.map((item) => item.runtime_item_id));
  const seedGroups = new Set(selected.flatMap((item) => item.candidate_group_ids));
  for (const item of ranked) {
    if (selected.length >= poolSize) break;
    if (
      !selectedIds.has(item.runtime_item_id) &&
      item.candidate_group_ids.some((group) => seedGroups.has(group))
    ) {
      selected.push(item);
      selectedIds.add(item.runtime_item_id);
    }
  }
  for (const item of ranked) {
    if (selected.length >= poolSize) break;
    if (!selectedIds.has(item.runtime_item_id)) {
      selected.push(item);
      selectedIds.add(item.runtime_item_id);
    }
  }
  return selected;
}

const [manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, "FROZEN_DIAGNOSTIC_MANIFEST.json"), "utf8"),
  readFile(path.join(CONFIG, "DIAGNOSTIC_GUARD.json"), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
if (
  guard.status !== "diagnostic_frozen_unlocked" ||
  guard.diagnostic_execution_count !== 0 ||
  sha256(manifestText) !== guard.manifest_sha256
) {
  throw new Error("R2.12 diagnostic execution guard failed.");
}
for (const input of Object.values(manifest.inputs) as any[]) {
  if (sha256(await readFile(path.join(EXP, input.path))) !== input.sha256) {
    throw new Error(`Frozen input checksum mismatch: ${input.path}`);
  }
}
const queries = parseJsonl(
  await readFile(path.join(EXP, manifest.inputs.queries.path), "utf8"),
) as Query[];
const corpus = parseJsonl(
  await readFile(path.join(EXP, manifest.inputs.corpus.path), "utf8"),
) as Item[];
const p = manifest.parameters;
const poolRows: any[] = [];
for (const query of queries) {
  const whole = bm25(query.text, corpus, p.bm25_k1, p.bm25_b).map(
    (entry) => entry.item,
  );
  const clause = clauseRrf(
    query.text,
    corpus,
    p.bm25_k1,
    p.bm25_b,
    p.rrf_k,
    p.minimum_clause_token_count,
  );
  const pools: Record<string, Item[]> = {
    whole_query_bm25: whole.slice(0, p.pool_size),
    clause_rrf_k60: clause.slice(0, p.pool_size),
    bm25_group_expand_seed14: groupExpand(
      whole,
      p.group_seed_count,
      p.pool_size,
    ),
    clause_rrf_group_expand_seed14: groupExpand(
      clause,
      p.group_seed_count,
      p.pool_size,
    ),
  };
  for (const variant of manifest.variants) {
    const ids = pools[variant].map((item) => item.runtime_item_id);
    poolRows.push({
      runtime_query_key: query.runtime_query_key,
      variant,
      ordered_top20_ids: ids,
      ordered_top20_sha256: sha256(ids.join("\n")),
    });
  }
}
if (poolRows.length !== queries.length * manifest.variants.length) {
  throw new Error("Not all candidate pools completed before judgment read.");
}
const poolText = `${poolRows.map((row) => JSON.stringify(row)).join("\n")}\n`;

let judgmentReadCount = 0;
const judgments = parseJsonl(
  await readFile(path.join(EXP, manifest.inputs.judgments.path), "utf8"),
);
judgmentReadCount++;
const judgmentMap = new Map(
  judgments.map((row) => [row.runtime_query_key, row]),
);
const evaluated = poolRows.map((row) => {
  const judgment = judgmentMap.get(row.runtime_query_key);
  if (!judgment) throw new Error(`Missing judgment ${row.runtime_query_key}`);
  const required = new Set<string>(judgment.required_item_ids);
  const unsafe = new Set<string>([
    ...judgment.deprecated_item_ids,
    ...judgment.forbidden_item_ids,
  ]);
  const requiredHits = row.ordered_top20_ids.filter((id: string) =>
    required.has(id),
  ).length;
  return {
    ...row,
    query_id: judgment.query_id,
    stratum: judgment.stratum,
    required_count: required.size,
    required_hits_at_20: requiredHits,
    all_required_in_top20: Number(requiredHits === required.size),
    unsafe_candidate_count: row.ordered_top20_ids.filter((id: string) =>
      unsafe.has(id),
    ).length,
  };
});
const baseline = new Map(
  evaluated
    .filter((row) => row.variant === "whole_query_bm25")
    .map((row) => [row.runtime_query_key, row]),
);
const summaries = manifest.variants.map((variant: string) => {
  const rows = evaluated.filter((row) => row.variant === variant);
  const requiredHits = rows.reduce(
    (sum, row) => sum + row.required_hits_at_20,
    0,
  );
  const requiredCount = rows.reduce((sum, row) => sum + row.required_count, 0);
  const implicit = rows.filter(
    (row) =>
      row.stratum === "conditional_merge" ||
      row.stratum === "compatible_history",
  );
  const implicitHits = implicit.reduce(
    (sum, row) => sum + row.required_hits_at_20,
    0,
  );
  const implicitCount = implicit.reduce(
    (sum, row) => sum + row.required_count,
    0,
  );
  return {
    variant,
    required_micro_recall_at_20: requiredHits / requiredCount,
    required_candidate_recall_failure_count: requiredCount - requiredHits,
    implicit_required_micro_recall_at_20: implicitHits / implicitCount,
    all_required_query_rate:
      rows.reduce((sum, row) => sum + row.all_required_in_top20, 0) /
      rows.length,
    changed_pool_position_count: rows.reduce((sum, row) => {
      const base = baseline.get(row.runtime_query_key);
      return (
        sum +
        row.ordered_top20_ids.filter(
          (id: string, index: number) => id !== base.ordered_top20_ids[index],
        ).length
      );
    }, 0),
    mean_unsafe_candidate_count:
      rows.reduce((sum, row) => sum + row.unsafe_candidate_count, 0) /
      rows.length,
    by_stratum: Object.fromEntries(
      [
        "conditional_merge",
        "compatible_history",
        "current_only",
        "hard_negative_current",
      ].map((stratum) => {
        const selected = rows.filter((row) => row.stratum === stratum);
        const hits = selected.reduce(
          (sum, row) => sum + row.required_hits_at_20,
          0,
        );
        const count = selected.reduce(
          (sum, row) => sum + row.required_count,
          0,
        );
        return [stratum, hits / count];
      }),
    ),
  };
});
const selected = [...summaries].sort(
  (left, right) =>
    right.required_micro_recall_at_20 - left.required_micro_recall_at_20 ||
    right.implicit_required_micro_recall_at_20 -
      left.implicit_required_micro_recall_at_20 ||
    left.changed_pool_position_count - right.changed_pool_position_count ||
    left.variant.localeCompare(right.variant),
)[0];
const result = {
  schema_version: "v5-r2.12-candidate-diagnostic-result-1",
  status: "diagnostic_complete_confirmation_required",
  development_only: true,
  outcome_exposed_r2_11_data: true,
  promotion_evidence: false,
  all_pools_completed_before_judgment_read: true,
  judgment_read_count: judgmentReadCount,
  query_count: queries.length,
  corpus_item_count: corpus.length,
  variant_count: manifest.variants.length,
  selected_diagnostic_variant: selected.variant,
  summaries,
  confirmation_required: true,
  claim_boundary:
    "Diagnostic repair selection only; a new lineage-disjoint owner-approved Development confirmation set is required.",
};
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "raw_candidate_pools.jsonl"), poolText),
  writeFile(path.join(OUT, "DIAGNOSTIC_RESULT.json"), resultText),
]);
await writeFile(
  path.join(CONFIG, "DIAGNOSTIC_GUARD.json"),
  `${JSON.stringify(
    {
      ...guard,
      status: "diagnostic_complete_locked",
      diagnostic_execution_count: 1,
      raw_candidate_pools_sha256: sha256(poolText),
      diagnostic_result_sha256: sha256(resultText),
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(result, null, 2));
