import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT_DIR = resolve(ROOT, 'data/v6_confirmatory');

const sources = [
  {
    id: 'v3_all_queries',
    records: 'data/annotations_v3/queries.jsonl',
    judgments: 'data/annotations_v3/judgments.adjudicated.jsonl',
    defaultSplit: 'v3_mixed_inspected',
  },
  {
    id: 'v4_development',
    records: 'data/annotations_v4/devval_expansion_user_approved/splits/development.jsonl',
    defaultSplit: 'development',
  },
  {
    id: 'v4_validation',
    records: 'data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl',
    defaultSplit: 'validation_inspected',
  },
  {
    id: 'v4_fresh_test',
    records: 'data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl',
    defaultSplit: 'fresh_test_used',
  },
  {
    id: 'v5_r2_6_development',
    records: 'data/configs/v5_r2_6_query_conditioned_action_detector/development.jsonl',
    defaultSplit: 'detector_development',
  },
  {
    id: 'v5_r2_6_validation',
    records: 'data/configs/v5_r2_6_query_conditioned_action_detector/validation.sealed.jsonl',
    defaultSplit: 'detector_validation_inspected',
  },
  {
    id: 'v5_r2_7_preaudit',
    records: 'data/annotations_v5/r2_7_preaudited_cross_version/pre_model_audit_ledger.jsonl',
    defaultSplit: 'retrieval_development_or_validation',
  },
  {
    id: 'v5_r2_8_development',
    records: 'data/configs/v5_r2_8_shared_pool_development/retrieval_inputs.jsonl',
    judgments: 'data/configs/v5_r2_8_shared_pool_development/judgments.sealed.jsonl',
    defaultSplit: 'retrieval_development',
  },
  {
    id: 'v5_r2_9_validation',
    records: 'data/configs/v5_r2_9_retrieval_validation/retrieval_inputs.jsonl',
    judgments: 'data/configs/v5_r2_9_retrieval_validation/judgments.sealed.jsonl',
    defaultSplit: 'retrieval_validation_used',
  },
  {
    id: 'v5_r2_10_fresh_test',
    records: 'data/configs/v5_r2_10_fresh_test/retrieval_inputs.jsonl',
    judgments: 'data/configs/v5_r2_10_fresh_test/judgments.sealed.jsonl',
    defaultSplit: 'fresh_test_used',
  },
  {
    id: 'v5_r2_11_development',
    records: 'data/configs/v5_r2_11_frozen_development/development.frozen.jsonl',
    judgments: 'data/configs/v5_r2_11_frozen_development/judgments.sealed.jsonl',
    defaultSplit: 'development_used',
  },
  {
    id: 'v5_r2_12_confirmation',
    records: 'data/configs/v5_r2_12_frozen_confirmation/confirmation.approved.frozen.jsonl',
    judgments: 'data/configs/v5_r2_12_frozen_confirmation/judgments.sealed.jsonl',
    defaultSplit: 'development_confirmation_used',
  },
  {
    id: 'v5_r2_14_confirmation',
    records: 'data/configs/v5_r2_14_frozen_confirmation/confirmation.approved.frozen.jsonl',
    judgments: 'data/configs/v5_r2_14_frozen_confirmation/judgments.sealed.jsonl',
    defaultSplit: 'development_confirmation_used',
  },
  {
    id: 'v5_r2_16_confirmation',
    records: 'data/configs/v5_r2_16_frozen_confirmation/confirmation.approved.frozen.jsonl',
    judgments: 'data/configs/v5_r2_16_frozen_confirmation/judgments.sealed.jsonl',
    defaultSplit: 'development_confirmation_used',
  },
  {
    id: 'v5_r2_20_confirmation',
    records: 'data/configs/v5_r2_20_frozen_confirmation/confirmation.approved.frozen.jsonl',
    judgments: 'data/configs/v5_r2_20_frozen_confirmation/judgments.sealed.jsonl',
    defaultSplit: 'development_confirmation_used',
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function readJsonl(relativePath) {
  const absolutePath = resolve(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing authoritative exclusion input: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${relativePath}:${index + 1}: ${error.message}`);
      }
    });
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function evidenceObjectRef(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const locator = evidence.locator ?? {};
  const claim = normalizedText(
    evidence.atomic_claim_text ?? evidence.text ?? evidence.source_text ?? evidence.normalized_source_excerpt,
  );
  const page = locator.page_number ?? evidence.page_number ?? evidence.pdf_page_number ?? null;
  return {
    item_id: evidence.item_id ?? null,
    chunk_id: locator.chunk_id ?? evidence.chunk_id ?? null,
    document_id: evidence.document_id ?? null,
    source_sha256: evidence.source_sha256 ?? null,
    page_number: page,
    claim_sha256: evidence.atomic_claim_sha256 ?? (claim ? sha256(claim) : null),
  };
}

function stringRef(value) {
  return {
    item_id: String(value),
    chunk_id: String(value),
    document_id: null,
    source_sha256: null,
    page_number: null,
    claim_sha256: null,
  };
}

function collectEvidence(record, judgment, required) {
  const refs = [];
  const add = (value) => {
    for (const item of asArray(value)) {
      const ref = typeof item === 'object' ? evidenceObjectRef(item) : stringRef(item);
      if (ref) refs.push(ref);
    }
  };

  if (required) {
    add(record.required_chunk_ids);
    add(record.required_current_chunk_ids);
    add(record.required_retained_chunk_ids);
    add(record.required_item_ids);
    add(record.judgment?.required_chunk_ids);
    add(record.required_current_evidence);
    add(record.required_retained_evidence);
    add(judgment?.required_chunk_ids);
    add(judgment?.required_item_ids);
  } else {
    add(record.old_evidence);
    add(record.current_evidence);
    add(record.evidence_items);
    add(record.deprecated_evidence);
    add(record.forbidden_evidence);
    add(record.judgment?.deprecated_chunk_ids);
    add(record.judgment?.forbidden_chunk_ids);
    add(judgment?.deprecated_item_ids);
    add(judgment?.forbidden_item_ids);
    add(judgment?.unsafe_item_ids);
  }

  const unique = new Map();
  for (const ref of refs) {
    const key = JSON.stringify(ref);
    unique.set(key, ref);
  }
  return [...unique.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function getQueryText(record) {
  if (typeof record.query_text === 'string') return record.query_text;
  if (typeof record.question === 'string') return record.question;
  if (typeof record.query === 'string') return record.query;
  if (record.query && typeof record.query.text === 'string') return record.query.text;
  return '';
}

function getQueryId(record, index) {
  return record.query_id ?? record.draft_id ?? record.pair_id ?? `record-${index + 1}`;
}

function getLineage(record) {
  return record.lineage_group_id ?? record.lineage_group ?? record.oracle_relation?.lineage_group_id ?? null;
}

function requiredSignature(refs) {
  const semanticKeys = refs.map((ref) =>
    [
      ref.source_sha256 ?? '',
      ref.document_id ?? '',
      ref.page_number ?? '',
      ref.claim_sha256 ?? '',
      ref.chunk_id ?? '',
      ref.item_id ?? '',
    ].join('|'),
  );
  return semanticKeys.length ? sha256(semanticKeys.sort().join('\n')) : null;
}

const output = [];
const inputManifest = [];

for (const source of sources) {
  const records = readJsonl(source.records);
  const judgmentRows = source.judgments ? readJsonl(source.judgments) : [];
  const judgments = new Map(
    judgmentRows.map((row) => [row.query_id ?? row.runtime_query_key ?? row.draft_id, row]),
  );
  const sourceBytes = readFileSync(resolve(ROOT, source.records));
  inputManifest.push({
    source_id: source.id,
    records_path: source.records,
    records_sha256: sha256(sourceBytes),
    record_count: records.length,
    judgments_path: source.judgments ?? null,
    judgments_sha256: source.judgments
      ? sha256(readFileSync(resolve(ROOT, source.judgments)))
      : null,
    judgment_count: judgmentRows.length,
  });

  records.forEach((record, index) => {
    const queryId = getQueryId(record, index);
    const judgment = judgments.get(queryId) ?? judgments.get(record.runtime_query_key) ?? null;
    const queryText = getQueryText(record);
    const requiredRefs = collectEvidence(record, judgment, true);
    const exposedRefs = collectEvidence(record, judgment, false);
    output.push({
      schema_version: 'v6-exclusion-record-1',
      exclusion_id: `${source.id}::${queryId}`,
      source_stage: source.id,
      source_path: source.records,
      query_id: queryId,
      split: record.split ?? source.defaultSplit,
      stratum: record.stratum ?? (record.action_label ? 'query_conditioned_detector' : 'unknown'),
      lineage_group_id: getLineage(record),
      topic_id: record.topic_id ?? record.topic ?? null,
      query_text: queryText || null,
      normalized_query_sha256: queryText ? sha256(normalizedText(queryText)) : null,
      required_evidence_refs: requiredRefs,
      required_evidence_signature_sha256: requiredSignature(requiredRefs),
      exposed_evidence_refs: exposedRefs,
    });
  });
}

output.sort((a, b) => a.exclusion_id.localeCompare(b.exclusion_id));

const unique = (values) => [...new Set(values.filter(Boolean))];
const stratumCounts = {};
const sourceCounts = {};
for (const row of output) {
  stratumCounts[row.stratum] = (stratumCounts[row.stratum] ?? 0) + 1;
  sourceCounts[row.source_stage] = (sourceCounts[row.source_stage] ?? 0) + 1;
}

const summary = {
  schema_version: 'v6-exclusion-summary-1',
  generated_at: new Date().toISOString(),
  policy: 'Conservative union of all authoritative query-bearing V3/V4/V5 development, validation, confirmation, and fresh-test artifacts listed in this script.',
  raw_record_count: output.length,
  unique_query_id_count: unique(output.map((row) => row.query_id)).length,
  unique_normalized_query_count: unique(output.map((row) => row.normalized_query_sha256)).length,
  unique_lineage_count: unique(output.map((row) => row.lineage_group_id)).length,
  unique_required_evidence_signature_count: unique(
    output.map((row) => row.required_evidence_signature_sha256),
  ).length,
  unique_required_chunk_count: unique(
    output.flatMap((row) => row.required_evidence_refs.map((ref) => ref.chunk_id)),
  ).length,
  unique_required_claim_count: unique(
    output.flatMap((row) => row.required_evidence_refs.map((ref) => ref.claim_sha256)),
  ).length,
  stratum_counts: Object.fromEntries(Object.entries(stratumCounts).sort()),
  source_counts: Object.fromEntries(Object.entries(sourceCounts).sort()),
  authoritative_inputs: inputManifest,
};

mkdirSync(OUTPUT_DIR, { recursive: true });
const ledgerPath = resolve(OUTPUT_DIR, 'V6_EXCLUSION_LEDGER.jsonl');
const summaryPath = resolve(OUTPUT_DIR, 'V6_EXCLUSION_SUMMARY.json');
writeFileSync(ledgerPath, `${output.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ ledgerPath, summaryPath, ...summary }, null, 2));
