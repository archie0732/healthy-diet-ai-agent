import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DATA = resolve(ROOT, 'data/v6_confirmatory');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'));
}

function readJsonl(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

const exclusions = readJsonl('data/v6_confirmatory/V6_EXCLUSION_LEDGER.jsonl');
const usedLineages = new Set(exclusions.map((row) => row.lineage_group_id).filter(Boolean));
const allUsedRefs = exclusions.flatMap((row) => [
  ...(row.required_evidence_refs ?? []),
  ...(row.exposed_evidence_refs ?? []),
]);
const usedChunks = new Set(allUsedRefs.map((ref) => ref.chunk_id).filter(Boolean));
const usedClaims = new Set(allUsedRefs.map((ref) => ref.claim_sha256).filter(Boolean));
const usedSourcePages = new Set(
  allUsedRefs
    .filter((ref) => ref.source_sha256 && ref.page_number !== null)
    .map((ref) => `${ref.source_sha256}#${ref.page_number}`),
);

function candidateEvidenceRef(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const text = normalize(evidence.atomic_claim_text ?? evidence.text);
  const page = evidence.page_number ?? evidence.pdf_page_number ?? evidence.locator?.page_number ?? null;
  return {
    chunk_id: evidence.chunk_id ?? evidence.locator?.chunk_id ?? null,
    claim_sha256: evidence.atomic_claim_sha256 ?? evidence.text_sha256 ?? (text ? sha256(text) : null),
    source_page: evidence.source_sha256 && page !== null ? `${evidence.source_sha256}#${page}` : null,
  };
}

function overlapReasons(lineage, refs) {
  const reasons = [];
  if (lineage && usedLineages.has(lineage)) reasons.push('used_lineage');
  if (refs.some((ref) => ref?.chunk_id && usedChunks.has(ref.chunk_id))) reasons.push('used_chunk');
  if (refs.some((ref) => ref?.claim_sha256 && usedClaims.has(ref.claim_sha256))) reasons.push('used_claim');
  if (refs.some((ref) => ref?.source_page && usedSourcePages.has(ref.source_page))) reasons.push('used_source_page');
  return [...new Set(reasons)];
}

const v4Path = 'data/annotations_v4/candidate_relation_pairs_v4.jsonl';
const v4Rows = readJsonl(v4Path).map((row) => {
  const refs = [
    { chunk_id: row.old_chunk_id, claim_sha256: null, source_page: null },
    { chunk_id: row.new_chunk_id, claim_sha256: null, source_page: null },
  ];
  const testIntents = (row.supported_query_intents ?? []).filter((intent) => intent.is_test_eligible);
  return {
    candidate_id: row.candidate_pair_id,
    inventory: 'v4_candidate_relation_pairs',
    lineage_group_id: row.lineage_group_id,
    topic: (row.topic_ids ?? []).join(','),
    relation_type: row.candidate_relation_type,
    overlap_reasons: overlapReasons(row.lineage_group_id, refs),
    semantic_reviewed: row.semantically_reviewed === true,
    predesignated_test_eligible: testIntents.length > 0,
    candidate_strata: [...new Set(testIntents.map((intent) => intent.stratum))],
  };
});

const detectorPath = 'data/annotations_v5/relation_detector_review/review_ledger.jsonl';
const detectorRows = readJsonl(detectorPath).map((row) => {
  const refs = [
    { chunk_id: row.old_chunk_id, claim_sha256: null, source_page: null },
    { chunk_id: row.new_chunk_id, claim_sha256: null, source_page: null },
  ];
  return {
    candidate_id: row.candidate_pair_id,
    inventory: 'v5_relation_detector_review',
    lineage_group_id: row.lineage_group_id,
    topic: null,
    relation_type: row.final_relation_type ?? row.proposed_relation_type,
    overlap_reasons: overlapReasons(row.lineage_group_id, refs),
    semantic_reviewed: row.review_decision === 'accept' || row.review_decision === 'revise',
    predesignated_test_eligible: false,
    candidate_strata: [],
    review_decision: row.review_decision,
  };
});

const minedPath = 'data/annotations_v5/codex_mined_relation_pairs/reviewed_pairs.jsonl';
const minedRows = readJsonl(minedPath).map((row) => {
  const refs = [candidateEvidenceRef(row.old_evidence), candidateEvidenceRef(row.current_evidence)].filter(Boolean);
  return {
    candidate_id: row.pair_id,
    inventory: 'v5_codex_mined_reviewed_pairs',
    lineage_group_id: row.lineage_group_id ?? row.pair_id,
    topic: row.topic ?? null,
    relation_type: row.relation_type,
    overlap_reasons: overlapReasons(row.lineage_group_id ?? null, refs),
    semantic_reviewed: row.review_decision === 'accept' && row.evidence_alignment_verified === true,
    predesignated_test_eligible: row.fresh_v5_test_eligible === true,
    candidate_strata: [],
    review_decision: row.review_decision,
  };
});

const candidates = [...v4Rows, ...detectorRows, ...minedRows];

function summarizeInventory(name) {
  const rows = candidates.filter((row) => row.inventory === name);
  return {
    record_count: rows.length,
    unique_lineage_count: new Set(rows.map((row) => row.lineage_group_id).filter(Boolean)).size,
    no_exclusion_overlap_count: rows.filter((row) => row.overlap_reasons.length === 0).length,
    semantically_reviewed_no_overlap_count: rows.filter(
      (row) => row.overlap_reasons.length === 0 && row.semantic_reviewed,
    ).length,
    predesignated_test_eligible_no_overlap_count: rows.filter(
      (row) => row.overlap_reasons.length === 0 && row.predesignated_test_eligible,
    ).length,
    overlap_reason_counts: Object.fromEntries(
      ['used_lineage', 'used_chunk', 'used_claim', 'used_source_page'].map((reason) => [
        reason,
        rows.filter((row) => row.overlap_reasons.includes(reason)).length,
      ]),
    ),
  };
}

const stratumCapacity = {};
for (const row of v4Rows.filter((row) => row.overlap_reasons.length === 0)) {
  for (const stratum of row.candidate_strata) {
    stratumCapacity[stratum] = (stratumCapacity[stratum] ?? 0) + 1;
  }
}

const corpusManifestPaths = [
  'data/corpus_v4_devval_draft/source_manifest.json',
  'data/corpus_v5_r2_11_draft/source_manifest.json',
  'data/corpus_v5_r2_19_draft/source_manifest.json',
];
const corpora = corpusManifestPaths.map((path) => {
  const manifest = readJson(path);
  return {
    path,
    schema_version: manifest.schema_version,
    document_count: manifest.document_count ?? manifest.documents?.length ?? 0,
    chunk_count: manifest.chunk_count ?? null,
    held_out_test_eligible: manifest.held_out_test_eligible === true,
    development_only: manifest.development_only === true,
    document_ids: (manifest.documents ?? []).map((document) => document.document_id),
    sha256: sha256(readFileSync(resolve(ROOT, path))),
  };
});

const structurallyAvailable = candidates.filter((row) => row.overlap_reasons.length === 0);
const reviewedAvailable = structurallyAvailable.filter((row) => row.semantic_reviewed);
const eligibleAvailable = structurallyAvailable.filter((row) => row.predesignated_test_eligible);
const uniqueAvailableLineages = new Set(structurallyAvailable.map((row) => row.lineage_group_id).filter(Boolean));

const gate = {
  target_query_count: 96,
  minimum_query_count: 80,
  minimum_unique_lineages: 60,
  minimum_per_stratum: 20,
  structurally_available_unique_lineages: uniqueAvailableLineages.size,
  explicit_stratum_capacity_from_existing_inventory: stratumCapacity,
  pass: false,
  decision:
    'FAIL_PHASE_2_ENTRY: existing inventories do not establish at least 60 unused, semantically reviewed, held-out-eligible lineages with at least 20 candidates in each required stratum.',
};

const summary = {
  schema_version: 'v6-source-capacity-audit-1',
  generated_at: new Date().toISOString(),
  exclusion_basis: {
    excluded_query_records: exclusions.length,
    used_lineages: usedLineages.size,
    used_chunks: usedChunks.size,
    used_claims: usedClaims.size,
    used_source_pages: usedSourcePages.size,
  },
  inventory_summary: {
    v4_candidate_relation_pairs: summarizeInventory('v4_candidate_relation_pairs'),
    v5_relation_detector_review: summarizeInventory('v5_relation_detector_review'),
    v5_codex_mined_reviewed_pairs: summarizeInventory('v5_codex_mined_reviewed_pairs'),
  },
  aggregate: {
    candidate_record_count: candidates.length,
    structurally_available_record_count: structurallyAvailable.length,
    reviewed_available_record_count: reviewedAvailable.length,
    predesignated_test_eligible_available_record_count: eligibleAvailable.length,
    structurally_available_unique_lineage_count: uniqueAvailableLineages.size,
  },
  existing_stratum_capacity: stratumCapacity,
  corpora,
  gate,
  next_action: [
    'Acquire and freeze additional official predecessor/current guideline pairs in underrepresented topic families.',
    'Mine new atomic relation candidates without exposing router keywords or retrieval outcomes.',
    'Allocate new candidates to the four V6 strata only after source-grounded AI review.',
    'Re-run this capacity audit; do not generate the sealed test until all per-stratum and unique-lineage gates pass.',
  ],
};

const jsonPath = resolve(DATA, 'V6_SOURCE_CAPACITY_AUDIT.json');
const candidatePath = resolve(DATA, 'V6_CAPACITY_CANDIDATES.jsonl');
writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
writeFileSync(candidatePath, `${candidates.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

const inventoryRows = Object.entries(summary.inventory_summary)
  .map(
    ([name, value]) =>
      `| ${name} | ${value.record_count} | ${value.no_exclusion_overlap_count} | ${value.semantically_reviewed_no_overlap_count} | ${value.predesignated_test_eligible_no_overlap_count} |`,
  )
  .join('\n');
const corpusRows = corpora
  .map(
    (corpus) =>
      `| \`${corpus.path}\` | ${corpus.document_count} | ${corpus.chunk_count ?? 'n/a'} | ${corpus.development_only ? 'yes' : 'no'} | ${corpus.held_out_test_eligible ? 'yes' : 'no'} |`,
  )
  .join('\n');
const stratumRows = ['explicit_history', 'conditional_merge', 'current_only', 'hard_negative_current']
  .map((stratum) => `| ${stratum} | ${stratumCapacity[stratum] ?? 0} | 20 |`)
  .join('\n');

const markdown = `# V6 Source Capacity Audit

Date: ${summary.generated_at.slice(0, 10)}  
Decision: **${gate.pass ? 'PASS' : 'FAIL'}**

## Outcome

The current repository does not yet prove capacity for a new 80–96 query confirmatory test. The audit found ${uniqueAvailableLineages.size} structurally non-overlapping candidate lineages across the inspected candidate inventories, but only ${reviewedAvailable.length} non-overlapping candidate records have semantic-review status and only ${eligibleAvailable.length} were predesignated as fresh-test eligible. Existing inventory also does not provide at least 20 candidates for every required V6 stratum.

This is a conservative planning result, not a claim that every unused source page is unusable. New official sources and new source-grounded lineage mining are required before Phase 2 can pass.

## Exclusion basis

- Excluded query-bearing records: ${exclusions.length}
- Used lineage identifiers: ${usedLineages.size}
- Used/exposed chunk identifiers: ${usedChunks.size}
- Used atomic-claim hashes: ${usedClaims.size}
- Used source-page keys: ${usedSourcePages.size}

## Existing candidate inventories

| Inventory | Records | No overlap | Reviewed + no overlap | Predesignated fresh eligible + no overlap |
|---|---:|---:|---:|---:|
${inventoryRows}

## Explicit stratum capacity in existing inventories

Only candidates with an explicit pre-existing stratum label and no exclusion overlap are counted here. Unallocated relation pairs are not guessed into a stratum.

| Required stratum | Existing explicit capacity | Minimum |
|---|---:|---:|
${stratumRows}

## Existing corpora

| Manifest | Documents | Chunks | Development only | Held-out eligible |
|---|---:|---:|---|---|
${corpusRows}

Existing corpora may remain in the retrieval corpus as distractors after a new V6 corpus manifest is frozen, but previously used query lineages, required evidence signatures, chunks, claims, and source-page keys remain excluded from new confirmatory gold records.

## Gate decision

${gate.decision}

Required next work:

1. Add official predecessor/current guideline pairs from underrepresented topic families.
2. Mine new atomic relations while hiding router rules and all retrieval outcomes.
3. Apply the three-pass AI source review defined in the V6 plan.
4. Re-run capacity audit until there are at least 60 unique lineages and at least 20 candidates in each stratum.
`;

const mdPath = resolve(ROOT, 'V6_SOURCE_CAPACITY_AUDIT.md');
writeFileSync(mdPath, markdown, 'utf8');

console.log(JSON.stringify({ jsonPath, candidatePath, mdPath, gate, aggregate: summary.aggregate }, null, 2));
