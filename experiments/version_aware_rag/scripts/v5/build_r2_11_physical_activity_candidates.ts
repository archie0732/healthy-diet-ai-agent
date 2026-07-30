import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CORPUS_PATH = path.join(
  ROOT,
  "experiments/version_aware_rag/data/corpus_v5_r2_11_draft/chunks.jsonl",
);
const OUTPUT_DIR = path.join(
  ROOT,
  "experiments/version_aware_rag/data/annotations_v5/r2_11_candidate_mining",
);
const OUTPUT_PATH = path.join(OUTPUT_DIR, "physical_activity_candidates.jsonl");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

type CandidateSpec = {
  candidate_id: string;
  topic_id: string;
  old_chunk_id: string;
  current_chunk_id: string;
  relation_hypothesis:
    | "compatible_history"
    | "conditional_merge"
    | "mixed_requires_atomic_segmentation";
  review_question: string;
};

const specs: CandidateSpec[] = [
  {
    candidate_id: "r2.11-pa-cand-001",
    topic_id: "children-aerobic-and-strengthening-frequency",
    old_chunk_id: "who-physical-activity-2010-page-20-pass-1-3973a2c709",
    current_chunk_id: "who-physical-activity-2020-page-11-pass-0-d766d94409",
    relation_hypothesis: "mixed_requires_atomic_segmentation",
    review_question:
      "Does the shift from a daily minimum to an average across the week preserve the old aerobic and three-day strengthening claims, or require separate atomic relations?",
  },
  {
    candidate_id: "r2.11-pa-cand-002",
    topic_id: "adult-aerobic-target-and-bout-duration",
    old_chunk_id: "who-physical-activity-2010-page-26-pass-0-b7a8534739",
    current_chunk_id: "who-physical-activity-2020-page-12-pass-0-bfd51843f1",
    relation_hypothesis: "mixed_requires_atomic_segmentation",
    review_question:
      "Separate the retained 150-minute lower bound from the changed 150-300 range and the removed 10-minute bout requirement.",
  },
  {
    candidate_id: "r2.11-pa-cand-003",
    topic_id: "older-adult-target-and-functional-balance",
    old_chunk_id: "who-physical-activity-2010-page-32-pass-0-40554cbf53",
    current_chunk_id: "who-physical-activity-2020-page-14-pass-0-b9ae3e552b",
    relation_hypothesis: "mixed_requires_atomic_segmentation",
    review_question:
      "Determine which older-adult aerobic, strength, functional-health, and balance claims remain compatible after the updated range.",
  },
  {
    candidate_id: "r2.11-pa-cand-004",
    topic_id: "adult-benefit-harm-and-injury-context",
    old_chunk_id: "who-physical-activity-2010-page-8-pass-2-975a68a6d7",
    current_chunk_id: "who-physical-activity-2020-page-12-pass-1-ed3ad42154",
    relation_hypothesis: "compatible_history",
    review_question:
      "Can the older injury-risk implementation context be retained alongside the current expanded adult health-benefit statement?",
  },
  {
    candidate_id: "r2.11-pa-cand-005",
    topic_id: "adult-disability-scope-and-general-adaptation",
    old_chunk_id: "who-physical-activity-2010-page-7-pass-2-02a96503bf",
    current_chunk_id: "who-physical-activity-2020-page-22-pass-0-6ad9133239",
    relation_hypothesis: "conditional_merge",
    review_question:
      "Does the current disability-specific recommendation require any retained general-adult claim, or is current evidence sufficient by itself?",
  },
  {
    candidate_id: "r2.11-pa-cand-006",
    topic_id: "child-disability-scope-and-activity-types",
    old_chunk_id: "who-physical-activity-2010-page-20-pass-0-0d79b2f71e",
    current_chunk_id: "who-physical-activity-2020-page-20-pass-0-8026a25827",
    relation_hypothesis: "conditional_merge",
    review_question:
      "Can the retained detail on resistance, vigorous aerobic, and weight-loading activity be combined with the disability-specific applicability statement?",
  },
  {
    candidate_id: "r2.11-pa-cand-007",
    topic_id: "adult-aerobic-target-and-sedentary-replacement",
    old_chunk_id: "who-physical-activity-2010-page-26-pass-1-b01d07514f",
    current_chunk_id: "who-physical-activity-2020-page-13-pass-0-db8190b9b8",
    relation_hypothesis: "conditional_merge",
    review_question:
      "Can a query materially require the retained distribution rationale and the new sedentary-time replacement recommendation without an explicit history cue?",
  },
  {
    candidate_id: "r2.11-pa-cand-008",
    topic_id: "older-adult-relative-intensity-and-chronic-conditions",
    old_chunk_id: "who-physical-activity-2010-page-32-pass-1-68cf99d8f0",
    current_chunk_id: "who-physical-activity-2020-page-18-pass-0-c3116c5979",
    relation_hypothesis: "conditional_merge",
    review_question:
      "Can relative-intensity interpretation for older adults be retained when applying current chronic-condition recommendations?",
  },
];

const corpusText = await readFile(CORPUS_PATH, "utf8");
const chunks = new Map(
  corpusText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const chunk = JSON.parse(line);
      return [chunk.chunk_id, chunk] as const;
    }),
);

const usedChunkIds = new Set<string>();
const records = specs.map((spec) => {
  const oldChunk = chunks.get(spec.old_chunk_id);
  const currentChunk = chunks.get(spec.current_chunk_id);
  if (!oldChunk || !currentChunk) {
    throw new Error(`Missing candidate evidence for ${spec.candidate_id}`);
  }
  for (const chunkId of [spec.old_chunk_id, spec.current_chunk_id]) {
    if (usedChunkIds.has(chunkId)) {
      throw new Error(`Candidate evidence reused: ${chunkId}`);
    }
    usedChunkIds.add(chunkId);
  }
  if (
    oldChunk.document_id !== "who-physical-activity-2010" ||
    currentChunk.document_id !== "who-physical-activity-2020"
  ) {
    throw new Error(`Wrong document generation for ${spec.candidate_id}`);
  }
  return {
    schema_version: "v5-r2.11-candidate-mining-1",
    ...spec,
    old_evidence: {
      chunk_id: oldChunk.chunk_id,
      document_id: oldChunk.document_id,
      page_number: oldChunk.page_number,
      source_url: oldChunk.source_url,
      source_download_url: oldChunk.source_download_url,
      source_sha256: oldChunk.source_checksum,
      text: oldChunk.text,
    },
    current_evidence: {
      chunk_id: currentChunk.chunk_id,
      document_id: currentChunk.document_id,
      page_number: currentChunk.page_number,
      source_url: currentChunk.source_url,
      source_download_url: currentChunk.source_download_url,
      source_sha256: currentChunk.source_checksum,
      text: currentChunk.text,
    },
    review_status: "needs_atomic_segmentation_and_semantic_review",
    eligible_for_r2_11_annotation_ledger: false,
    retrieval_outcomes_observed: false,
    r2_10_outcomes_used: false,
    drafted_by: "codex-gpt5-primary-reviewer",
    independent_blinded_or_clinical_review: false,
  };
});

await mkdir(OUTPUT_DIR, { recursive: true });
const ledgerText = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
await writeFile(OUTPUT_PATH, ledgerText, "utf8");
await writeFile(
  path.join(OUTPUT_DIR, "MANIFEST.json"),
  `${JSON.stringify(
    {
      schema_version: "v5-r2.11-candidate-mining-manifest-1",
      status: "candidate_mining_only_not_annotation_gold",
      candidate_count: records.length,
      unique_evidence_chunk_count: usedChunkIds.size,
      corpus_path: path.relative(ROOT, CORPUS_PATH).replaceAll("\\", "/"),
      corpus_sha256: sha256(corpusText),
      ledger_path: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"),
      ledger_sha256: sha256(ledgerText),
      retrieval_allowed: false,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      candidate_count: records.length,
      unique_evidence_chunk_count: usedChunkIds.size,
      ledger_sha256: sha256(ledgerText),
    },
    null,
    2,
  ),
);

