import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const SOURCE = path.join(EXP, 'data/configs/v5_r2_7_preaudited_cross_version');
const OUT = path.join(EXP, 'data/configs/v5_r2_8_shared_pool_development');
const PROTOCOL = path.join(EXP, 'R2_8_SHARED_POOL_RETRIEVAL_PROTOCOL.md');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [developmentText, sourceManifestText, protocolText] = await Promise.all([
  readFile(path.join(SOURCE, 'development.jsonl'), 'utf8'),
  readFile(path.join(SOURCE, 'SPLIT_MANIFEST.json'), 'utf8'),
  readFile(PROTOCOL, 'utf8'),
]);
const sourceManifest = JSON.parse(sourceManifestText);
if (sha256(developmentText) !== sourceManifest.development_sha256) throw new Error('R2.7 Development checksum mismatch');
const rows = parseJsonl(developmentText);
const yearOf = (edition: string) => Number(edition.match(/\d{4}/)?.[0] || 2025);
const retrievalInputs = rows.map((row: any) => ({
  query_id: row.pair_id,
  query: row.query.text,
  lineage_group: row.lineage_group,
  evidence_items: [
    {
      item_id: `${row.pair_id}::OLD`,
      lineage_group: row.lineage_group,
      role: 'OLD',
      year: 2003,
      text: row.old_evidence.atomic_claim_text,
      source: {
        document_id: row.old_evidence.document_id,
        official_pdf_url: row.old_evidence.official_pdf_url,
        source_sha256: row.old_evidence.source_sha256,
        pdf_page_number: row.old_evidence.pdf_page_number,
        printed_page_number: row.old_evidence.printed_page_number,
      },
    },
    {
      item_id: `${row.pair_id}::CURRENT`,
      lineage_group: row.lineage_group,
      role: 'CURRENT',
      year: yearOf(row.current_evidence.edition),
      text: row.current_evidence.atomic_claim_text,
      source: {
        document_id: row.current_evidence.document_id,
        official_url: row.current_evidence.official_url,
        official_pdf_url: row.current_evidence.official_pdf_url,
        source_sha256: row.current_evidence.source_sha256,
        page_number: row.current_evidence.page_number,
        chunk_id: row.current_evidence.chunk_id,
      },
    },
  ],
}));
const judgments = rows.map((row: any) => ({
  query_id: row.pair_id,
  stratum: row.action_label,
  required_item_ids: row.action_label === 'PAIR_PRESERVE'
    ? [`${row.pair_id}::OLD`, `${row.pair_id}::CURRENT`]
    : [`${row.pair_id}::CURRENT`],
  deprecated_item_ids: row.action_label === 'BLOCK_RETAINED' ? [`${row.pair_id}::OLD`] : [],
}));
const inputText = `${retrievalInputs.map((row) => JSON.stringify(row)).join('\n')}\n`;
const judgmentText = `${judgments.map((row) => JSON.stringify(row)).join('\n')}\n`;
const manifest = {
  schema_version: 'v5-r2.8-shared-pool-development-1',
  status: 'development_inputs_and_judgments_separated_before_retrieval',
  source_r2_7_development_sha256: sha256(developmentText),
  protocol_sha256: sha256(protocolText),
  query_count: rows.length,
  corpus_item_count: rows.length * 2,
  candidate_pool_size: 20,
  top_k: 3,
  recency_lambda: 0.75,
  history_pair_boost: 0.75,
  retrieval_inputs_sha256: sha256(inputText),
  judgments_sealed_sha256: sha256(judgmentText),
  validation_file_read: false,
  external_model_api_used: false,
  retrieval_execution_count: 0,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const guard = {
  status: 'r2_8_development_retrieval_unlocked',
  manifest_sha256: sha256(manifestText),
  retrieval_execution_count: 0,
  judgments_may_be_read_only_after_all_retrieval_calls: true,
  validation_execution_count: 0,
  external_model_api_allowed: false,
  fresh_v5_test_created: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, 'retrieval_inputs.jsonl'), inputText, 'utf8'),
  writeFile(path.join(OUT, 'judgments.sealed.jsonl'), judgmentText, 'utf8'),
  writeFile(path.join(OUT, 'MANIFEST.json'), manifestText, 'utf8'),
  writeFile(path.join(OUT, 'EXECUTION_GUARD.json'), `${JSON.stringify(guard, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify(manifest, null, 2));
