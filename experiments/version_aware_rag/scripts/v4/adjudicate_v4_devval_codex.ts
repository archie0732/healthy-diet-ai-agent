import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const EXP = path.join(ROOT, 'experiments/version_aware_rag');
const SOURCE = path.join(EXP, 'data/annotations_v4/devval_expansion_draft/review_ledger.jsonl');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const OUT_DIR = path.join(EXP, 'data/annotations_v4/devval_expansion_codex_reviewed');
const REPORT_DIR = path.join(EXP, 'results/v4/devval_expansion');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (text: string) => text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

type Revision = {
  query_text?: string;
  lineage_group_id?: string;
  required_current_chunk_ids?: string[];
  required_retained_chunk_ids?: string[];
  notes: string;
};

const revisions: Record<string, Revision> = {
  'v4dv-cm-001': {
    query_text: 'Using the original 2012 sodium guideline together with the 2025 lower-sodium salt substitute guidance, what adult sodium target remains applicable, and which current population or clinical exclusions constrain use of potassium-containing LSSS?',
    required_current_chunk_ids: ['who-lsss-2025-page-42-pass-1-c373e2f64f'],
    notes: 'The original current passage repeated the complete 2012 target and made retained evidence unnecessary. Replaced it with the current LSSS scope/exclusion passage so both versions are materially required.',
  },
  'v4dv-cm-006': {
    query_text: 'For adults, how should potassium-containing lower-sodium salt substitutes be used within the retained WHO sodium target of less than 2 g/day, and which population-level safety uncertainty makes the current LSSS recommendation conditional?',
    notes: 'Removed children because the selected current passage does not contain the child-specific LSSS exclusion.',
  },
  'v4dv-ch-001': {
    query_text: 'How does the 2025 lower-sodium salt substitute guidance preserve the 2012 position that sodium reduction and salt iodization are compatible, and what new LSSS-specific iodization action is required?',
    lineage_group_id: 'who-ch-salt-iodization-continuity',
    required_current_chunk_ids: ['who-lsss-2025-page-43-pass-0-2fa6c205f7'],
    required_retained_chunk_ids: ['who-sodium-2012-page-27-pass-0-aee1a17991'],
    notes: 'Replaced an exact duplicate evidence pair with a distinct historical-continuity case about salt iodization.',
  },
  'v4dv-ch-002': {
    query_text: 'Under WHO guidance to reduce sodium and increase potassium together, what sodium-to-potassium molar ratio is expected if both older guidelines are achieved, which natural foods are preferred for potassium, and which conditions or treatments exclude adults from the current LSSS recommendation?',
    notes: 'Clarified that kidney and medication exclusions constrain LSSS use, not the general potassium recommendation as originally worded.',
  },
  'v4dv-ch-005': {
    query_text: 'How do WHO general potassium guidance and the newer lower-sodium salt substitute recommendation differ for pregnant women, and what exception or safety caution applies in each case?',
    notes: 'The older potassium recommendation includes pregnant women except where urinary potassium excretion is impaired; it does not generally exclude pregnancy.',
  },
  'v4dv-ch-006': {
    query_text: 'How does the 2025 guideline restate the 2012 recommendation to reduce sodium intake in children, including the instruction to adjust the adult maximum downward according to children\'s energy requirements?',
    lineage_group_id: 'who-ch-child-sodium-reaffirmed',
    required_current_chunk_ids: ['who-lsss-2025-page-40-pass-0-16cb9713ae'],
    required_retained_chunk_ids: ['who-sodium-2012-page-26-pass-2-b9dbdf82b0'],
    notes: 'Replaced an exact duplicate free-sugar/NSS pair with a distinct child-sodium carry-forward case.',
  },
};

const [sourceText, corpusText] = await Promise.all([readFile(SOURCE, 'utf8'), readFile(CORPUS, 'utf8')]);
const source = parseJsonl(sourceText);
const chunks = parseJsonl(corpusText);
const chunkIds = new Set(chunks.map((chunk) => chunk.chunk_id));

const reviewed = source.map((record) => {
  const revision = revisions[record.draft_id];
  const wasPreliminarilyRevised = Boolean(record.codex_preliminary_revision);
  const decision = revision || wasPreliminarilyRevised ? 'revise' : 'accept';
  const updated = {
    ...record,
    ...(revision?.query_text ? { query_text: revision.query_text } : {}),
    ...(revision?.lineage_group_id ? { lineage_group_id: revision.lineage_group_id } : {}),
    ...(revision?.required_current_chunk_ids ? { required_current_chunk_ids: revision.required_current_chunk_ids } : {}),
    ...(revision?.required_retained_chunk_ids ? { required_retained_chunk_ids: revision.required_retained_chunk_ids } : {}),
    review_status: 'codex_reviewed_provisional',
    reviewer_id: 'codex-gpt5-primary-review',
    reviewer_type: 'ai_primary_reviewer_not_independent_human',
    reviewer_decision: decision,
    reviewer_notes: revision?.notes ?? (wasPreliminarilyRevised
      ? 'Accepted after the recorded Codex preliminary wording/evidence correction.'
      : 'Accepted: query scope, population, conditions, and both required evidence sets are supported by the cited source passages.'),
    reviewed_at: '2026-07-21',
    eligible_for_development_exploratory_evaluation: true,
    eligible_for_validation_confirmation: false,
    human_signoff_required_before_promotion: true,
  };
  for (const id of [...updated.required_current_chunk_ids, ...updated.required_retained_chunk_ids]) {
    if (!chunkIds.has(id)) throw new Error(`${record.draft_id}: missing evidence ${id}`);
  }
  return updated;
});

if (reviewed.length !== 24) throw new Error(`Expected 24 records, found ${reviewed.length}`);
if (new Set(reviewed.map((record) => record.lineage_group_id)).size !== 24) throw new Error('Lineage groups are not unique');
for (const stratum of ['conditional_merge', 'compatible_history']) {
  if (reviewed.filter((record) => record.stratum === stratum).length !== 12) throw new Error(`${stratum} must contain 12 records`);
}
const signatures = reviewed.map((record) => [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids].sort().join('|'));
if (new Set(signatures).size !== signatures.length) throw new Error('Exact evidence signatures are not independent');

const ledgerText = reviewed.map((record) => JSON.stringify(record)).join('\n') + '\n';
await mkdir(OUT_DIR, { recursive: true });
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'review_ledger.jsonl'), ledgerText, 'utf8');

const report = {
  status: 'codex_review_complete_provisional',
  reviewer: 'codex-gpt5-primary-review',
  reviewer_independence: 'not_an_independent_human_reviewer',
  counts: {
    total: reviewed.length,
    accepted_without_change: reviewed.filter((record) => record.reviewer_decision === 'accept').length,
    revised_then_accepted: reviewed.filter((record) => record.reviewer_decision === 'revise').length,
    rejected: reviewed.filter((record) => record.reviewer_decision === 'reject').length,
    conditional_merge: reviewed.filter((record) => record.stratum === 'conditional_merge').length,
    compatible_history: reviewed.filter((record) => record.stratum === 'compatible_history').length,
    unique_evidence_signatures: new Set(signatures).size,
  },
  source_ledger_sha256: sha256(sourceText),
  reviewed_ledger_sha256: sha256(ledgerText),
  development_exploratory_evaluation_allowed: true,
  validation_confirmation_allowed: false,
  promotion_allowed: false,
  limitation: 'Codex is not an independent human annotator. These labels can support development-only exploratory evaluation, but validation confirmation and promotion require user or independent human signoff.',
};
await writeFile(path.join(REPORT_DIR, 'CODEX_REVIEW_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(REPORT_DIR, 'CODEX_REVIEW_REPORT.md'), `# Codex Review Report\n\n` +
  `Status: **${report.status}**\n\n` +
  `- Accepted without change: ${report.counts.accepted_without_change}\n` +
  `- Revised then accepted: ${report.counts.revised_then_accepted}\n` +
  `- Rejected: ${report.counts.rejected}\n` +
  `- Conditional merge groups: ${report.counts.conditional_merge}\n` +
  `- Compatible history groups: ${report.counts.compatible_history}\n` +
  `- Unique exact evidence signatures: ${report.counts.unique_evidence_signatures}\n\n` +
  `## Methodological status\n\n${report.limitation}\n`, 'utf8');

console.log(JSON.stringify(report, null, 2));
