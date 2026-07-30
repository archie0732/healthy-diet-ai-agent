import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const LEDGER = path.join(
  EXP,
  "data/annotations_v5/r2_20_confirmation_codex_reviewed/provisional_annotations.jsonl",
);
const GROUPS = path.join(
  EXP,
  "data/annotations_v5/r2_20_predeclared_candidate_groups/candidate_groups.predeclared.jsonl",
);
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_22_gpt56_blind_review",
);
const SEALED = path.join(
  EXP,
  "data/configs/v5_r2_22_gpt56_blind_review",
);

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

const [ledgerText, groupsText] = await Promise.all([
  readFile(LEDGER, "utf8"),
  readFile(GROUPS, "utf8"),
]);
const ledger = parseJsonl(ledgerText);
const groups = new Map(
  parseJsonl(groupsText).map((row) => [row.candidate_group_id, row]),
);
if (ledger.length !== 32) throw new Error(`Expected 32 records, got ${ledger.length}`);

const packet: any[] = [];
const mapping: any[] = [];
for (const [index, record] of ledger.entries()) {
  const group: any = groups.get(record.predeclared_candidate_group_id);
  if (!group || group.candidate_items.length !== 2) {
    throw new Error(`Missing two-candidate group for ${record.query_id}`);
  }
  const blindId = `blind-${String(index + 1).padStart(2, "0")}`;
  const swapped = Number.parseInt(sha256(blindId).slice(0, 2), 16) % 2 === 1;
  const ordered = swapped
    ? [group.candidate_items[1], group.candidate_items[0]]
    : group.candidate_items;
  const candidates = ordered.map((item: any, candidateIndex: number) => ({
    label: candidateIndex === 0 ? "A" : "B",
    document_id: item.document_id,
    page_number: item.page_number,
    text: item.text,
  }));
  packet.push({
    schema_version: "v5-r2.22-gpt56-blind-packet-1",
    blind_item_id: blindId,
    question: record.query_text,
    candidates,
  });
  mapping.push({
    schema_version: "v5-r2.22-sealed-mapping-1",
    blind_item_id: blindId,
    query_id: record.query_id,
    stratum: record.stratum,
    swapped,
    candidate_a_original_side: swapped ? "right" : "left",
    candidate_b_original_side: swapped ? "left" : "right",
  });
}

const packetText = jsonl(packet);
const mappingText = jsonl(mapping);
const instructionsText = `# GPT-5.6 blind review instructions

You are the sole independent-context AI reviewer for 32 question/evidence-pair
items. Read only this file and \`BLIND_PACKET.jsonl\`. Do not inspect any other
repository file. You are not given gold labels, strata, original IDs, retrieval
rankings, outcomes, or prior conversation.

Review every item exactly once. Judge whether the supplied passages, taken
literally, are needed and adequate to answer the question. Do not use outside
knowledge to repair missing evidence.

Write one JSON object per line to \`GPT56_BLIND_REVIEW.jsonl\` with exactly:

\`\`\`json
{"schema_version":"v5-r2.22-gpt56-blind-review-1","blind_item_id":"blind-01","reviewer_id":"gpt-5.6-sol_independent_context_reviewer","answerability":"fully_answerable","evidence_contract":"both_required","candidate_a":"required","candidate_b":"required","confidence":4,"rationale":"Concise reason based only on the question and passages."}
\`\`\`

Allowed values:

- answerability: fully_answerable, partially_answerable, not_answerable
- evidence_contract: both_required, a_primary_b_supporting,
  b_primary_a_supporting, a_only, b_only, neither
- candidate_a/candidate_b: required, supporting, relevant_but_not_required,
  unsafe_or_misleading, irrelevant
- confidence: integer 1-5

Also write \`GPT56_REVIEWER_REPORT.md\` containing only a short methodology
statement, count completed, and any packet-quality concerns. Do not calculate
agreement or inspect a mapping/gold file.
`;
const manifest = {
  schema_version: "v5-r2.22-gpt56-blind-packet-manifest-1",
  status: "frozen_before_review",
  record_count: packet.length,
  packet_sha256: sha256(packetText),
  instructions_sha256: sha256(instructionsText),
  sealed_mapping_sha256: sha256(mappingText),
  source_ledger_sha256: sha256(ledgerText),
  source_candidate_groups_sha256: sha256(groupsText),
  candidate_order_rule: "swap iff first SHA-256 byte of blind_item_id is odd",
  reviewer_may_access_sealed_mapping: false,
  retrieval_outcomes_in_packet: false,
  gold_roles_in_packet: false,
};

await Promise.all([
  mkdir(OUT, { recursive: true }),
  mkdir(SEALED, { recursive: true }),
]);
await Promise.all([
  writeFile(path.join(OUT, "BLIND_PACKET.jsonl"), packetText),
  writeFile(path.join(OUT, "BLIND_REVIEW_INSTRUCTIONS.md"), instructionsText),
  writeFile(path.join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(path.join(SEALED, "SEALED_MAPPING.jsonl"), mappingText),
  writeFile(path.join(SEALED, "FROZEN_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(JSON.stringify(manifest, null, 2));
