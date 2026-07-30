import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = process.env.V5_R2_CONFIG_DIR ? path.resolve(process.env.V5_R2_CONFIG_DIR) : path.join(EXP, 'data/configs/v5_r2_action_detector');
const DEV = process.env.V5_R2_DEV_SELECTION ? path.resolve(process.env.V5_R2_DEV_SELECTION) : path.join(EXP, 'results/v5/r2_action_detector_development/DEVELOPMENT_SELECTION.json');
const OUT = process.env.V5_R2_VALIDATION_OUT_DIR ? path.resolve(process.env.V5_R2_VALIDATION_OUT_DIR) : path.join(EXP, 'results/v5/r2_action_detector_validation');
const CALLS = path.join(OUT, 'model_calls');
const MODELS = ['gemma-4-31b-it', 'gemini-3.1-flash-lite'] as const;
const LABELS = ['PAIR_PRESERVE', 'BLOCK_RETAINED'] as const;
const STATUSES = ['RETAINS_DISTINCT', 'ADDS_SCOPE_OR_EXCEPTION', 'DUPLICATES', 'REPLACES_OR_CONFLICTS', 'UNCERTAIN'] as const;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Guard and frozen Development selection are deliberately read before the
// validation artifact. A failed guard exits without opening validation labels.
const [guardText, devText] = await Promise.all([
  readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'), readFile(DEV, 'utf8'),
]);
const guard = JSON.parse(guardText), dev = JSON.parse(devText);
if (guard.status !== 'development_selection_frozen_validation_unlocked' || !guard.development_selection_complete || guard.validation_execution_count !== 0 || !guard.selected_config || dev.selected_config !== guard.selected_config) {
  throw new Error('R2 validation remains locked: no frozen Development configuration passed the gate');
}

const [manifestText, validationText] = await Promise.all([
  readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'), readFile(path.join(CONFIG, 'validation.sealed.jsonl'), 'utf8'),
]);
const manifest = JSON.parse(manifestText);
if (sha256(validationText) !== manifest.validation_sealed_sha256 || sha256(devText) !== guard.development_selection_sha256) throw new Error('R2 frozen artifact checksum mismatch');
const rows = parseJsonl(validationText);
const selected = dev.configs[dev.selected_config];
const promptMode = dev.prompt_mode || 'simple_v2';
const system = dev.system_prompt;

function userPrompt(row: any) {
  return promptMode === 'decomposed_v3'
    ? `OLD PASSAGE\n${row.old_evidence.text}\n\nCURRENT PASSAGE\n${row.current_evidence.text}\n\nReturn retention_status, old_unique_information, confidence from 0 to 1, and a concise rationale.`
    : `OLD PASSAGE\n${row.old_evidence.text}\n\nCURRENT PASSAGE\n${row.current_evidence.text}\n\nShould OLD be retrieved alongside CURRENT? Return action_label, confidence from 0 to 1, and a concise rationale naming the decisive distinction.`;
}

async function classify(model: typeof MODELS[number], row: any) {
  const schema = promptMode === 'decomposed_v3' ? { type: 'OBJECT', properties: {
    retention_status: { type: 'STRING', enum: STATUSES }, old_unique_information: { type: 'STRING' }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, rationale: { type: 'STRING' },
  }, required: ['retention_status', 'old_unique_information', 'confidence', 'rationale'] } : { type: 'OBJECT', properties: {
    action_label: { type: 'STRING', enum: LABELS }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, rationale: { type: 'STRING' },
  }, required: ['action_label', 'confidence', 'rationale'] };
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: userPrompt(row) }] }], generationConfig: {
    temperature: model.startsWith('gemini-3') ? 1 : 0, maxOutputTokens: 768,
    ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}), responseMimeType: 'application/json', responseSchema: schema,
  } };
  const bodyText = JSON.stringify(body), key = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_AI_API is required');
  for (let attempt = 0; attempt < 7; attempt++) {
    const started = performance.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: bodyText });
    const rawText = await response.text();
    if (response.ok) {
      try {
        const raw = JSON.parse(rawText), text = raw.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
        const prediction = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
        if (promptMode === 'decomposed_v3') prediction.action_label = ['RETAINS_DISTINCT', 'ADDS_SCOPE_OR_EXCEPTION'].includes(prediction.retention_status) ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED';
        if (!LABELS.includes(prediction.action_label) || typeof prediction.confidence !== 'number') throw new Error('schema mismatch');
        const call = { pair_id: row.pair_id, model_id: model, prompt_version: dev.prompt_version, request_sha256: sha256(bodyText), response_sha256: sha256(rawText), prediction, latency_ms: Math.round(performance.now() - started), usage_metadata: raw.usageMetadata };
        await writeFile(path.join(CALLS, `${row.pair_id}.${model}.json`), JSON.stringify(call, null, 2) + '\n', 'utf8');
        return call;
      } catch {}
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`${model} HTTP ${response.status}`);
    await delay(response.status === 429 ? 62000 : Math.min(15000, 1000 * 2 ** attempt));
  }
  throw new Error(`${row.pair_id}/${model} returned no valid response`);
}

await mkdir(CALLS, { recursive: true });
const calls: any[] = [];
for (const row of rows) for (const model of selected.models) calls.push(await classify(model, row));
let falsePreserve = 0, predictedPreserve = 0, truePreserve = 0, goldPreserve = 0, correct = 0;
const predictions: any[] = [];
for (const row of rows) {
  const modelPredictions = selected.models.map((model: string) => calls.find((call) => call.pair_id === row.pair_id && call.model_id === model).prediction);
  const predicted = selected.type === 'fail_closed_consensus'
    ? (modelPredictions.every((p: any) => p.action_label === 'PAIR_PRESERVE' && p.confidence >= selected.confidence_threshold) ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED')
    : modelPredictions[0].action_label;
  if (predicted === row.action_label) correct++;
  if (row.action_label === 'PAIR_PRESERVE') goldPreserve++;
  if (predicted === 'PAIR_PRESERVE') { predictedPreserve++; if (row.action_label === 'PAIR_PRESERVE') truePreserve++; else falsePreserve++; }
  predictions.push({ pair_id: row.pair_id, gold: row.action_label, predicted, model_predictions: modelPredictions });
}
const metrics = { query_count: rows.length, accuracy: correct / rows.length, false_preserve_count: falsePreserve, pair_preserve_precision: predictedPreserve ? truePreserve / predictedPreserve : 0, pair_preserve_recall: goldPreserve ? truePreserve / goldPreserve : 0, invalid_output_count: 0 };
const gates = { zero_false_preserve: falsePreserve === 0, perfect_preserve_precision: metrics.pair_preserve_precision === 1, preserve_recall_at_least_half: metrics.pair_preserve_recall >= 0.5, zero_invalid_outputs: true };
const result = { status: 'r2_validation_executed_once', selected_config: dev.selected_config, validation_execution_count: 1, tuning_after_validation: false, metrics, gates, full_gate_passed: Object.values(gates).every(Boolean), validation_input_sha256: sha256(validationText), development_selection_sha256: sha256(devText), predictions };
const resultText = JSON.stringify(result, null, 2) + '\n';
await writeFile(path.join(OUT, 'VALIDATION_RESULT.json'), resultText, 'utf8');
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), JSON.stringify({ ...guard, status: result.full_gate_passed ? 'validation_passed_freeze_eligible' : 'validation_failed_no_retuning', validation_execution_count: 1, validation_result_sha256: sha256(resultText), tuning_after_validation_allowed: false }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: result.status, passed: result.full_gate_passed, metrics, gates }, null, 2));
