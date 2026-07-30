import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const INPUT = path.join(EXP, 'data/annotations_v5/relation_detector_review/review_ledger.jsonl');
const OUT = path.join(EXP, 'results/v5/relation_detector_review');
const CALLS = path.join(OUT, 'second_opinion_calls');
const MODEL = 'gemini-3.1-flash-lite';
const CLASSES = ['duplicate', 'superseded', 'conflicting', 'conditional_difference', 'complementary'];
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SYSTEM = `Independently classify the relation between an OLD and NEW guideline excerpt. You must not infer from IDs. duplicate means materially the same claim and scope. conditional_difference means both remain applicable because NEW explicitly changes population, condition, setting, or exception. conflicting means the same scoped claim cannot both be true. superseded means NEW replaces or updates the same claim. complementary means distinct compatible claims are simultaneously needed; shared topic alone is insufficient. If the excerpts do not support a reliable relation, set reviewable=false. Return JSON only.`;

await mkdir(CALLS, { recursive: true });
const inputText = await readFile(INPUT, 'utf8'), rows = parseJsonl(inputText), key = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_AI_API required');
const results: any[] = [];
for (const [index, row] of rows.entries()) {
  const user = `OLD EXCERPT\n${row.old_context_window}\n\nNEW EXCERPT\n${row.new_context_window}\n\nReturn relation_type, confidence, reviewable, and concise rationale.`;
  const body = { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { temperature: 1, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' }, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { relation_type: { type: 'STRING', enum: CLASSES }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, reviewable: { type: 'BOOLEAN' }, rationale: { type: 'STRING' } }, required: ['relation_type', 'confidence', 'reviewable', 'rationale'] } } };
  const bodyText = JSON.stringify(body), callPath = path.join(CALLS, `${row.candidate_pair_id}.json`);
  let call: any = null;
  try { const cached = JSON.parse(await readFile(callPath, 'utf8')); if (cached.request_sha256 === sha256(bodyText)) call = cached; } catch {}
  if (!call) {
    let last = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      const started = performance.now();
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: bodyText });
      last = await response.text();
      if (response.ok) {
        try {
          const raw = JSON.parse(last), output = raw.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '', prediction = JSON.parse(output);
          call = { candidate_pair_id: row.candidate_pair_id, model_id: MODEL, prompt_version: 'v5-independent-relation-review-v1', system_prompt_sha256: sha256(SYSTEM), request_sha256: sha256(bodyText), response_sha256: sha256(last), prediction, latency_ms: Math.round(performance.now() - started), usage_metadata: raw.usageMetadata };
          await writeFile(callPath, JSON.stringify(call, null, 2) + '\n', 'utf8');
          break;
        } catch {}
      }
      if (!response.ok && response.status !== 429 && response.status < 500) throw new Error(`${MODEL} HTTP ${response.status}: ${last.slice(0, 200)}`);
      await delay(response.status === 429 ? 62000 : Math.min(10000, 1000 * 2 ** attempt));
    }
    if (!call) throw new Error(`${row.candidate_pair_id}: no valid structured response: ${last.slice(0, 200)}`);
  }
  results.push({ candidate_pair_id: row.candidate_pair_id, proposed_relation_type: row.proposed_relation_type, second_opinion_relation_type: call.prediction.relation_type, confidence: call.prediction.confidence, reviewable: call.prediction.reviewable, rationale: call.prediction.rationale, agrees_with_proposal: row.proposed_relation_type === call.prediction.relation_type });
  console.log(`completed ${index + 1}/${rows.length}`);
}
const jsonl = results.map((row) => JSON.stringify(row)).join('\n') + '\n';
await writeFile(path.join(OUT, 'SECOND_OPINION.jsonl'), jsonl, 'utf8');
const disagreements = results.filter((row) => !row.agrees_with_proposal || !row.reviewable);
const md = `# V5 Relation Gold Review — Independent Model Second Opinion\n\nModel: \`${MODEL}\`. The model did not receive proposed labels. This is triage assistance, not gold adjudication.\n\n- Records: ${results.length}\n- Agreement with proposed label: ${results.length - disagreements.length}/${results.length}\n- Priority manual review: ${disagreements.length}\n\n| Pair | Proposed | Second opinion | Confidence | Reviewable | Rationale |\n|---|---|---|---:|---|---|\n${disagreements.map((row) => `| ${row.candidate_pair_id} | ${row.proposed_relation_type} | ${row.second_opinion_relation_type} | ${row.confidence} | ${row.reviewable} | ${String(row.rationale).replace(/\|/g, '\\|')} |`).join('\n')}\n`;
await writeFile(path.join(OUT, 'SECOND_OPINION_REVIEW.md'), md, 'utf8');
await writeFile(path.join(OUT, 'SECOND_OPINION_MANIFEST.json'), JSON.stringify({ status: 'triage_only_not_adjudicated', model_id: MODEL, record_count: results.length, agreement_count: results.length - disagreements.length, priority_review_count: disagreements.length, input_sha256: sha256(inputText), predictions_sha256: sha256(jsonl), report_sha256: sha256(md) }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ agreement: results.length - disagreements.length, priority_review: disagreements.length }, null, 2));
