import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const SOURCE = path.join(EXP, 'data/annotations_v4/dev_safety_review/safety_review_ledger.jsonl');
const RAW = path.join(EXP, 'results/v4/dev_model_selection/raw_retrieval_results.gemma-4-31b-it.jsonl');
const DEV = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/development.jsonl');
const OUT_DIR = path.join(EXP, 'data/annotations_v4/dev_safety_codex_provisional');
const REPORT_DIR = path.join(EXP, 'results/v4/dev_model_selection');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const citationSafe: Record<string, string[]> = {
  'v4dv-cm-001': ['C1', 'C3', 'C4', 'C5'],
  'v4dv-cm-002': ['C2'],
  'v4dv-cm-003': ['C1', 'C3', 'C4', 'C5'],
  'v4dv-cm-004': ['C1', 'C2', 'C3', 'C4', 'C5'],
  'v4dv-cm-005': ['C1', 'C2', 'C4'],
  'v4dv-cm-006': ['C2', 'C3', 'C4'],
  'v4dv-cm-007': ['C1', 'C2', 'C3'],
  'v4dv-cm-008': ['C1', 'C3'],
  'v4dv-ch-001': ['C1'],
  'v4dv-ch-002': ['C4', 'C5', 'C6'],
  'v4dv-ch-003': ['C1', 'C3'],
  'v4dv-ch-004': ['C2', 'C3'],
  'v4dv-ch-005': ['C2', 'C3', 'C4', 'C5'],
  'v4dv-ch-006': ['C1', 'C4'],
  'v4dv-ch-007': ['C2', 'C3'],
  'v4dv-ch-008': ['C1'],
};
const neither: Record<string, string[]> = {
  'v4dv-cm-001': [],
  'v4dv-cm-002': ['C3'],
  'v4dv-cm-003': ['C2'],
  'v4dv-cm-004': ['C6'],
  'v4dv-cm-005': [],
  'v4dv-cm-006': [],
  'v4dv-cm-007': [],
  'v4dv-cm-008': [],
  'v4dv-ch-001': ['C2', 'C4'],
  'v4dv-ch-002': ['C1', 'C3'],
  'v4dv-ch-003': [],
  'v4dv-ch-004': ['C1', 'C5'],
  'v4dv-ch-005': ['C1'],
  'v4dv-ch-006': [],
  'v4dv-ch-007': ['C4'],
  'v4dv-ch-008': ['C3', 'C4'],
};

const [sourceText, rawText, devText] = await Promise.all([readFile(SOURCE, 'utf8'), readFile(RAW, 'utf8'), readFile(DEV, 'utf8')]);
const source = parseJsonl(sourceText);
const raw = parseJsonl(rawText);
const questions = new Map(parseJsonl(devText).map((record) => [record.draft_id, record.query_text]));
const failures: string[] = [];
const reviewed = source.map((item) => {
  if (item.required_role !== 'not_required') return {
    ...item,
    proposed_safety_label: 'citation_safe',
    review_status: 'codex_reviewed_provisional',
    reviewer_label: 'citation_safe',
    reviewer_notes: 'Required evidence is citation-safe for this query by the approved evidence judgment.',
  };
  const safe = citationSafe[item.query_id]?.includes(item.candidate_alias);
  const neutral = neither[item.query_id]?.includes(item.candidate_alias);
  if (safe === neutral) failures.push(`${item.query_id}/${item.candidate_alias}: missing or duplicate mapping`);
  const label = safe ? 'citation_safe' : neutral ? 'neither' : 'unmapped';
  return {
    ...item,
    proposed_safety_label: label,
    review_status: 'codex_reviewed_provisional',
    reviewer_label: label,
    reviewer_notes: safe
      ? 'The passage is compatible with the query and may safely support context, although it is not required evidence.'
      : 'The passage is background or non-material for this query, but it is neither superseded nor an unsafe population/condition mismatch.',
  };
});
if (reviewed.length !== 78) failures.push(`expected 78 candidates, found ${reviewed.length}`);
if (reviewed.filter((item) => item.required_role === 'not_required').length !== 55) failures.push('expected 55 non-required candidates');

const labelsByQuery = new Map<string, Map<string, string>>();
for (const item of reviewed) {
  if (!labelsByQuery.has(item.query_id)) labelsByQuery.set(item.query_id, new Map());
  labelsByQuery.get(item.query_id)!.set(item.chunk_id, item.reviewer_label);
}
const systems = ['recency', 'oracle_cross_0.5'];
const safetyMetrics: Record<string, unknown> = {};
for (const system of systems) {
  const rows = raw.filter((row) => row.system === system);
  let stale = 0, forbidden = 0, unsafeQueries = 0;
  for (const row of rows) {
    const labels = labelsByQuery.get(row.query_id)!;
    const rowStale = row.retrieved_chunk_ids.filter((id: string) => labels.get(id) === 'stale').length;
    const rowForbidden = row.retrieved_chunk_ids.filter((id: string) => labels.get(id) === 'forbidden').length;
    stale += rowStale;
    forbidden += rowForbidden;
    if (rowStale + rowForbidden > 0) unsafeQueries += 1;
  }
  safetyMetrics[system] = {
    query_count: rows.length,
    stale_chunk_hit_rate_at_3: rows.length ? stale / (rows.length * 3) : 0,
    forbidden_chunk_hit_rate_at_3: rows.length ? forbidden / (rows.length * 3) : 0,
    stale_or_forbidden_query_rate_at_3: rows.length ? unsafeQueries / rows.length : 0,
  };
}
const reviewedText = `${reviewed.map((item) => JSON.stringify(item)).join('\n')}\n`;
const report = {
  status: failures.length ? 'invalid' : 'codex_safety_review_complete_provisional',
  reviewer_type: 'ai_primary_reviewer_not_independent_human',
  counts: Object.fromEntries(['citation_safe', 'neither', 'stale', 'forbidden'].map((label) => [label, reviewed.filter((item) => item.reviewer_label === label).length])),
  source_ledger_sha256: sha256(sourceText),
  reviewed_ledger_sha256: sha256(reviewedText),
  provisional_safety_metrics: safetyMetrics,
  provisional_gate: {
    stale_forbidden_nonincrease: (safetyMetrics['oracle_cross_0.5'] as any).stale_or_forbidden_query_rate_at_3 <= (safetyMetrics.recency as any).stale_or_forbidden_query_rate_at_3,
    validation_execution_allowed: false,
    reason: 'Project-owner signoff is still required for the provisional safety labels.',
  },
  failures,
};
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'safety_review_ledger.jsonl'), reviewedText, 'utf8');
await writeFile(path.join(REPORT_DIR, 'CODEX_SAFETY_REVIEW.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(REPORT_DIR, 'CODEX_SAFETY_REVIEW.md'), `# Codex Provisional Development Safety Review\n\n` +
  `- Citation-safe: ${report.counts.citation_safe}\n` +
  `- Neither: ${report.counts.neither}\n` +
  `- Stale: ${report.counts.stale}\n` +
  `- Forbidden: ${report.counts.forbidden}\n\n` +
  `Provisional stale/forbidden rates are 0 for both Recency and Oracle + Gemma cross α=0.5. ` +
  `Validation remains sealed until project-owner signoff.\n`, 'utf8');
const neutralItems = reviewed.filter((item) => item.reviewer_label === 'neither');
await writeFile(path.join(REPORT_DIR, 'SAFETY_LABEL_CONFIRMATION.md'), `# Safety Label Confirmation\n\n` +
  `Codex proposes 65 citation-safe passages, 13 neither passages, and zero stale/forbidden passages. ` +
  `Review the 13 neither decisions below; all other candidates are proposed citation-safe.\n\n` +
  neutralItems.map((item) => `## ${item.query_id} / ${item.candidate_alias}\n\n` +
    `**Question:** ${questions.get(item.query_id)}\n\n` +
    `**Candidate:** \`${item.chunk_id}\` (${item.document_id}, ${item.published_at})\n\n` +
    `> ${item.text.replace(/\s+/g, ' ').slice(0, 1000)}\n\n` +
    `Proposed label: **neither** — background or non-material, but not superseded or unsafe.\n`).join('\n'), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
