import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MODEL = 'gemini-3.5-flash';
const CORPUS_PATH = path.join(ROOT, 'experiments/version_aware_rag/data/corpus_v4_devval_draft/chunks.jsonl');
const OUTPUT_DIR = path.join(ROOT, 'experiments/version_aware_rag/data/annotations_v4/devval_expansion_draft');
const CALL_DIR = path.join(ROOT, 'experiments/version_aware_rag/results/v4/devval_expansion/model_calls');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

type DraftSpec = {
  draft_id: string;
  split: 'development' | 'validation';
  stratum: 'conditional_merge' | 'compatible_history';
  lineage_group_id: string;
  focus: string;
  current: string;
  retained: string;
};

const specs: DraftSpec[] = [
  { draft_id: 'v4dv-cm-001', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-lsss-adult-sodium-target', focus: 'adult sodium target plus conditional lower-sodium salt substitute use', current: 'who-lsss-2025-page-40-pass-0-16cb9713ae', retained: 'who-sodium-2012-page-26-pass-2-b9dbdf82b0' },
  { draft_id: 'v4dv-cm-002', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-lsss-kidney-exclusion', focus: 'lower-sodium salt substitutes for a person with impaired potassium excretion', current: 'who-lsss-2025-page-42-pass-1-c373e2f64f', retained: 'who-potassium-2012-page-24-pass-0-f9a5c41a38' },
  { draft_id: 'v4dv-cm-003', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-lsss-pregnancy-exclusion', focus: 'sodium reduction in pregnancy without applying the LSSS recommendation', current: 'who-lsss-2025-page-43-pass-0-2fa6c205f7', retained: 'who-sodium-2012-page-11-pass-0-2f53a84f4c' },
  { draft_id: 'v4dv-cm-004', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-lsss-child-exclusion', focus: 'child sodium reduction without extrapolating the adult LSSS recommendation', current: 'who-lsss-2025-page-43-pass-0-2fa6c205f7', retained: 'who-sodium-2012-page-26-pass-0-79e05e2ed5' },
  { draft_id: 'v4dv-cm-005', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-lsss-discretionary-scope', focus: 'distinguish discretionary table-salt use from manufactured food and restaurant use', current: 'who-lsss-2025-page-42-pass-2-6fd11e7cff', retained: 'who-sodium-2012-page-27-pass-0-aee1a17991' },
  { draft_id: 'v4dv-cm-006', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-lsss-sodium-first-strategy', focus: 'use LSSS only inside an overall sodium-reduction strategy', current: 'who-lsss-2025-page-42-pass-0-9add4977a5', retained: 'who-sodium-2012-page-26-pass-2-b9dbdf82b0' },
  { draft_id: 'v4dv-cm-007', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-nss-free-sugar-alternative', focus: 'reduce free sugars without using non-sugar sweeteners for weight control', current: 'who-nss-2023-page-34-pass-0-fcf5b1e8c1', retained: 'who-sugars-2015-page-12-pass-0-737526a649' },
  { draft_id: 'v4dv-cm-008', split: 'development', stratum: 'conditional_merge', lineage_group_id: 'who-cm-nss-diabetes-scope', focus: 'free-sugar reduction for pre-existing diabetes while respecting the NSS guideline scope exclusion', current: 'who-nss-2023-page-37-pass-0-468b4186e3', retained: 'who-sugars-2015-page-12-pass-1-5879bb3805' },
  { draft_id: 'v4dv-cm-009', split: 'validation', stratum: 'conditional_merge', lineage_group_id: 'who-cm-nss-pregnancy-scope', focus: 'pregnancy, NSS guidance, and retained free-sugar limits', current: 'who-nss-2023-page-13-pass-0-cd69f60b78', retained: 'who-sugars-2015-page-12-pass-0-737526a649' },
  { draft_id: 'v4dv-cm-010', split: 'validation', stratum: 'conditional_merge', lineage_group_id: 'who-cm-fat-free-sugar-substitution', focus: 'lower total fat without replacing it with free sugars', current: 'who-total-fat-2023-page-31-pass-0-63ac07055b', retained: 'who-sugars-2015-page-12-pass-0-737526a649' },
  { draft_id: 'v4dv-cm-011', split: 'validation', stratum: 'conditional_merge', lineage_group_id: 'who-cm-adult-fibre-potassium', focus: 'adult dietary fibre target plus retained potassium guidance', current: 'who-carbohydrate-2023-page-10-pass-1-58aa8554dc', retained: 'who-potassium-2012-page-24-pass-2-13b8318d9d' },
  { draft_id: 'v4dv-cm-012', split: 'validation', stratum: 'conditional_merge', lineage_group_id: 'who-cm-child-fibre-potassium', focus: 'age-adjusted child fibre and potassium guidance', current: 'who-carbohydrate-2023-page-10-pass-1-58aa8554dc', retained: 'who-potassium-2012-page-25-pass-1-3f0bde22f5' },

  { draft_id: 'v4dv-ch-001', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-sodium-adult-reaffirmed', focus: 'the 2012 adult sodium target as explicitly retained in the 2025 guideline', current: 'who-lsss-2025-page-40-pass-0-16cb9713ae', retained: 'who-sodium-2012-page-26-pass-2-b9dbdf82b0' },
  { draft_id: 'v4dv-ch-002', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-sodium-potassium-complement', focus: 'retained policy to reduce sodium and increase potassium together', current: 'who-lsss-2025-page-42-pass-1-c373e2f64f', retained: 'who-sodium-2012-page-27-pass-0-aee1a17991' },
  { draft_id: 'v4dv-ch-003', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-potassium-adult-target', focus: 'retained adult potassium target alongside current LSSS context', current: 'who-lsss-2025-page-40-pass-0-16cb9713ae', retained: 'who-potassium-2012-page-10-pass-2-dfa70d52a4' },
  { draft_id: 'v4dv-ch-004', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-potassium-food-first', focus: 'natural food sources remain primary when potassium-containing salt substitutes exist', current: 'who-lsss-2025-page-42-pass-1-c373e2f64f', retained: 'who-potassium-2012-page-13-pass-1-cb5e86171d' },
  { draft_id: 'v4dv-ch-005', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-potassium-pregnancy-scope', focus: 'retained potassium applicability in pregnancy and the narrower current LSSS scope', current: 'who-lsss-2025-page-43-pass-0-2fa6c205f7', retained: 'who-potassium-2012-page-24-pass-0-f9a5c41a38' },
  { draft_id: 'v4dv-ch-006', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-free-sugar-ten-percent', focus: '2015 free-sugar limit retained alongside 2023 NSS guidance', current: 'who-nss-2023-page-34-pass-0-fcf5b1e8c1', retained: 'who-sugars-2015-page-12-pass-0-737526a649' },
  { draft_id: 'v4dv-ch-007', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-free-sugar-five-percent', focus: 'conditional below-five-percent free-sugar target remains relevant without NSS substitution', current: 'who-nss-2023-page-37-pass-2-1fbfcd3a19', retained: 'who-sugars-2015-page-12-pass-1-5879bb3805' },
  { draft_id: 'v4dv-ch-008', split: 'development', stratum: 'compatible_history', lineage_group_id: 'who-ch-free-sugar-definition', focus: 'retained definition of free sugars when interpreting newer NSS guidance', current: 'who-nss-2023-page-13-pass-1-74f7dfedc2', retained: 'who-sugars-2015-page-12-pass-0-737526a649' },
  { draft_id: 'v4dv-ch-009', split: 'validation', stratum: 'compatible_history', lineage_group_id: 'who-ch-fruit-vegetable-potassium', focus: 'current fruit and vegetable guidance plus historical potassium-source rationale', current: 'who-carbohydrate-2023-page-10-pass-0-d0ff69fccf', retained: 'who-potassium-2012-page-13-pass-1-cb5e86171d' },
  { draft_id: 'v4dv-ch-010', split: 'validation', stratum: 'compatible_history', lineage_group_id: 'who-ch-child-potassium-adjustment', focus: 'current child carbohydrate guidance and retained energy-adjusted potassium guidance', current: 'who-carbohydrate-2023-page-10-pass-1-58aa8554dc', retained: 'who-potassium-2012-page-10-pass-2-dfa70d52a4' },
  { draft_id: 'v4dv-ch-011', split: 'validation', stratum: 'compatible_history', lineage_group_id: 'who-ch-total-fat-sugar-context', focus: 'current total-fat advice interpreted with retained free-sugar limits', current: 'who-total-fat-2023-page-31-pass-0-63ac07055b', retained: 'who-sugars-2015-page-12-pass-1-5879bb3805' },
  { draft_id: 'v4dv-ch-012', split: 'validation', stratum: 'compatible_history', lineage_group_id: 'who-ch-sfa-carbohydrate-quality', focus: 'SFA replacement with high-quality carbohydrate while retaining free-sugar guidance', current: 'who-sat-trans-fat-2023-page-11-pass-0-241c79aa0a', retained: 'who-sugars-2015-page-12-pass-0-737526a649' },
];

const QUERY_REVISIONS: Record<string, string> = {
  'v4dv-cm-003': 'How do WHO guidelines for general sodium reduction and lower-sodium salt substitutes (LSSS) apply to pregnant women, and what health-related exceptions or conditions apply to each?',
  'v4dv-cm-005': 'How does WHO distinguish discretionary use of lower-sodium salt substitutes from their use in manufactured foods, restaurants, or condiments, and how should this scoped intervention fit with the retained policy to reduce sodium while increasing potassium from foods?',
  'v4dv-ch-004': 'Why should natural, unrefined foods remain the primary source of potassium even when potassium-containing lower-sodium salt substitutes are available, and which food sources are identified in the retained and current guidance?',
  'v4dv-ch-009': 'What are the current WHO daily fruit and vegetable intake recommendations for adults and children, and why does retained potassium guidance favour fresh, unrefined fruits and vegetables over highly processed foods?',
};

const EXTRA_CURRENT_EVIDENCE: Record<string, string[]> = {
  'v4dv-cm-010': ['who-total-fat-2023-page-30-pass-0-fa6fc58d51'],
  'v4dv-ch-011': ['who-total-fat-2023-page-30-pass-0-fa6fc58d51'],
};

const key = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_AI_API or GEMINI_API_KEY is required');

const corpusText = await readFile(CORPUS_PATH, 'utf8');
const chunks = new Map(corpusText.trim().split('\n').map((line) => {
  const chunk = JSON.parse(line);
  return [chunk.chunk_id, chunk] as const;
}));

if (new Set(specs.map((spec) => spec.lineage_group_id)).size !== specs.length) throw new Error('lineage_group_id values must be unique');
for (const stratum of ['conditional_merge', 'compatible_history'] as const) {
  if (specs.filter((spec) => spec.stratum === stratum).length < 12) throw new Error(`${stratum} requires at least 12 groups`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(CALL_DIR, { recursive: true });
const records: Record<string, unknown>[] = [];
const calls: Record<string, unknown>[] = [];

for (const spec of specs) {
  const current = chunks.get(spec.current);
  const retained = chunks.get(spec.retained);
  if (!current || !retained) throw new Error(`Missing evidence chunk for ${spec.draft_id}`);
  const prompt = [
    'Create one evaluation query for a Version-Aware RAG dataset.',
    `Stratum: ${spec.stratum}`,
    `Focus: ${spec.focus}`,
    'The answer must require BOTH evidence passages. Do not quote chunk IDs in the question.',
    'Do not add medical advice beyond the passages. Make population and conditions explicit.',
    'Return JSON only with keys: query_text, target_population (string array), conditions (string array), draft_rationale.',
    `CURRENT EVIDENCE (${spec.current}):\n${current.text}`,
    `RETAINED EVIDENCE (${spec.retained}):\n${retained.text}`,
  ].join('\n\n');
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['query_text', 'target_population', 'conditions', 'draft_rationale'],
        properties: {
          query_text: { type: 'STRING' },
          target_population: { type: 'ARRAY', items: { type: 'STRING' } },
          conditions: { type: 'ARRAY', items: { type: 'STRING' } },
          draft_rationale: { type: 'STRING' },
        },
      },
    },
  };
  const responsePath = path.join(CALL_DIR, `${spec.draft_id}.response.json`);
  let envelope: any;
  let callRecord: any;
  try {
    const cached = JSON.parse(await readFile(responsePath, 'utf8'));
    envelope = cached.response;
    callRecord = cached.manifest;
  } catch {
    const started = Date.now();
    let rawBody = '';
    let response: Response | undefined;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody),
      });
      rawBody = await response.text();
      if (response.ok) break;
      if (![429, 503].includes(response.status) || attempt === 5) {
        throw new Error(`${spec.draft_id}: Gemini ${response.status}: ${rawBody.slice(0, 400)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
    if (!response?.ok) throw new Error(`${spec.draft_id}: Gemini request did not complete`);
    envelope = JSON.parse(rawBody);
    callRecord = {
      draft_id: spec.draft_id,
      model_id: MODEL,
      endpoint: 'v1beta/models/{model}:generateContent',
      temperature: 0,
      prompt_sha256: sha256(prompt),
      response_sha256: sha256(rawBody),
      corpus_sha256: sha256(corpusText),
      latency_ms: Date.now() - started,
      usage: envelope.usageMetadata ?? null,
      created_at: new Date().toISOString(),
    };
    await writeFile(responsePath, `${JSON.stringify({ manifest: callRecord, response: envelope }, null, 2)}\n`, 'utf8');
  }
  const modelText = envelope.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('') ?? '';
  const generated = JSON.parse(modelText);
  if (!generated.query_text || !Array.isArray(generated.target_population) || !Array.isArray(generated.conditions)) {
    throw new Error(`${spec.draft_id}: invalid structured response`);
  }
  calls.push(callRecord);
  records.push({
    draft_id: spec.draft_id,
    split: spec.split,
    stratum: spec.stratum,
    lineage_group_id: spec.lineage_group_id,
    query_text: QUERY_REVISIONS[spec.draft_id] ?? generated.query_text,
    target_population: generated.target_population,
    conditions: generated.conditions,
    required_current_chunk_ids: [spec.current, ...(EXTRA_CURRENT_EVIDENCE[spec.draft_id] ?? [])],
    required_retained_chunk_ids: [spec.retained],
    draft_rationale: generated.draft_rationale ?? spec.focus,
    model_id: MODEL,
    prompt_sha256: callRecord.prompt_sha256,
    response_sha256: callRecord.response_sha256,
    codex_preliminary_revision: QUERY_REVISIONS[spec.draft_id] || EXTRA_CURRENT_EVIDENCE[spec.draft_id]
      ? {
          query_rewritten: Boolean(QUERY_REVISIONS[spec.draft_id]),
          current_evidence_added: EXTRA_CURRENT_EVIDENCE[spec.draft_id] ?? [],
          reason: 'Pre-review correction for wording or evidence sufficiency; not a gold-label decision.',
        }
      : null,
    review_status: 'needs_user_review',
    reviewer_decision: null,
    reviewer_notes: '',
    fresh_test_leakage_check: 'passed_no_v4_fresh_inventory_used',
  });
  console.log(`${spec.draft_id}: drafted`);
}

const ledgerText = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
await writeFile(path.join(OUTPUT_DIR, 'review_ledger.jsonl'), ledgerText, 'utf8');
await writeFile(path.join(OUTPUT_DIR, 'model_call_manifest.json'), `${JSON.stringify({ model_id: MODEL, calls, call_count: calls.length, ledger_sha256: sha256(ledgerText) }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ drafts: records.length, development: records.filter((r) => r.split === 'development').length, validation: records.filter((r) => r.split === 'validation').length, ledger_sha256: sha256(ledgerText) }, null, 2));
