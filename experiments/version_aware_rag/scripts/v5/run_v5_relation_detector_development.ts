import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = process.env.V5_DETECTOR_CONFIG_DIR ? path.resolve(process.env.V5_DETECTOR_CONFIG_DIR) : path.join(EXP, 'data/configs/v5_relation_detector');
const OUT = process.env.V5_DETECTOR_OUT_DIR ? path.resolve(process.env.V5_DETECTOR_OUT_DIR) : path.join(EXP, 'results/v5/relation_detector_development');
const GUARD_FILE = process.env.V5_DETECTOR_GUARD_FILE || 'DETECTOR_GUARD.json';
const CALLS = path.join(OUT, 'model_calls');
// 3.5 Flash was unavailable due to exhausted quota, 3.6 Flash failed the
// structured-output reliability check, and 2.5 Flash returned model-retired
// 404. Their traces are retained but do not enter selection. A model-agnostic
// health check selected 3.1 Flash-Lite (HTTP 200 + valid structured JSON).
const MODELS = ['gemma-4-31b-it', 'gemini-3.1-flash-lite'] as const;
const REQUEST_MODELS = (process.env.V5_REQUEST_MODELS?.split(',').filter((model) => MODELS.includes(model as any)) || [...MODELS]) as (typeof MODELS[number])[];
const CLASSES = ['duplicate', 'superseded', 'conflicting', 'conditional_difference', 'complementary'] as const;
const PAIR = new Set(['conditional_difference', 'complementary']);
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM = `You classify the semantic relation between an OLD and NEW guideline passage. Use only passage content, never IDs. Follow this decision order:\n1. duplicate: materially the same claims and scope.\n2. conditional_difference: both remain valid because the NEW passage explicitly changes applicability for a population, condition, setting, or exception.\n3. conflicting: both address the same claim/scope and cannot both be true.\n4. superseded: NEW replaces or updates the same claim, threshold, or recommendation.\n5. complementary: both are simultaneously applicable and contribute distinct compatible information.\nDo not use complementary merely because passages share a topic. If the passages do not clearly authorize retaining OLD alongside NEW, prefer superseded or conflicting. Return JSON only.`;
function prompt(row: any) {
  return `OLD PASSAGE\n${row.old_text}\n\nNEW PASSAGE\n${row.new_text}\n\nReturn relation_type, confidence from 0 to 1, and a concise rationale quoting the decisive semantic distinction.`;
}
const rowKey = (row: any) => row.endpoint_key || row.pair_id;
const oldText = (row: any) => row.old_text || row.old_evidence?.text;
const newText = (row: any) => row.new_text || row.current_evidence?.text;
async function classify(model: string, row: any) {
  const userPrompt = `OLD PASSAGE\n${oldText(row)}\n\nNEW PASSAGE\n${newText(row)}\n\nReturn relation_type, confidence from 0 to 1, and a concise rationale quoting the decisive semantic distinction.`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: model.startsWith('gemini-3') ? 1 : 0,
      maxOutputTokens: 1024,
      ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } }
        : model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { relation_type: { type: 'STRING', enum: CLASSES }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, rationale: { type: 'STRING' } }, required: ['relation_type', 'confidence', 'rationale'] }
    }
  };
  const bodyText = JSON.stringify(body);
  const cachePath = path.join(CALLS, `${sha256(rowKey(row)).slice(0, 16)}.${model}.json`);
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    if (cached.request_sha256 === sha256(bodyText)) return cached;
  } catch {}
  const key = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_AI_API is required');
  const started = performance.now();
  let last = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: bodyText });
    last = await response.text();
    if (response.ok) {
      const raw = JSON.parse(last);
      const text = raw.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
      let prediction: any;
      try {
        prediction = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
        if (!CLASSES.includes(prediction.relation_type) || typeof prediction.confidence !== 'number' || typeof prediction.rationale !== 'string') throw new Error('response schema mismatch');
      } catch (error: any) {
        await writeFile(cachePath.replace(/\.json$/, `.attempt-${attempt + 1}.invalid.json`), JSON.stringify({ model_id: model, endpoint_key: rowKey(row), request_sha256: sha256(bodyText), response_sha256: sha256(last), finish_reason: raw.candidates?.[0]?.finishReason, parse_error: error.message, raw_response: raw }, null, 2) + '\n', 'utf8');
        if (attempt === 7) throw new Error(`${model} returned invalid JSON after retries: ${error.message}`);
        await delay(Math.min(10000, 500 * 2 ** attempt));
        continue;
      }
      const result = { endpoint_key: rowKey(row), model_id: model, prompt_version: 'v5-relation-decision-v1', system_prompt_sha256: sha256(SYSTEM), temperature: body.generationConfig.temperature, thinking_level: model.startsWith('gemini-3') ? 'minimal' : model.startsWith('gemini-2.5') ? 'disabled_budget_0' : 'not_applicable', request_sha256: sha256(bodyText), response_sha256: sha256(last), prediction, latency_ms: Math.round(performance.now() - started), usage_metadata: raw.usageMetadata };
      await writeFile(cachePath, JSON.stringify(result, null, 2) + '\n', 'utf8');
      return result;
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`${model} HTTP ${response.status}: ${last.slice(0, 300)}`);
    await delay(response.status === 429 ? 62000 : Math.min(30000, 1000 * 2 ** attempt));
  }
  throw new Error(`${model} failed: ${last.slice(0, 300)}`);
}

function evaluate(rows: any[], predictions: Map<string, string>) {
  const confusion: any = Object.fromEntries(CLASSES.map((gold) => [gold, Object.fromEntries(CLASSES.map((pred) => [pred, 0]))]));
  let correct = 0, falseSafeExpansion = 0, predictedPair = 0, truePairPredictions = 0, goldPair = 0;
  for (const row of rows) {
    const pred = predictions.get(rowKey(row))!;
    confusion[row.relation_type][pred]++;
    if (pred === row.relation_type) correct++;
    if (PAIR.has(row.relation_type)) goldPair++;
    if (PAIR.has(pred)) {
      predictedPair++;
      if (PAIR.has(row.relation_type)) truePairPredictions++;
      else falseSafeExpansion++;
    }
  }
  const perClass: any = {};
  for (const cls of CLASSES) {
    const tp = confusion[cls][cls], fp = CLASSES.reduce((sum, gold) => sum + (gold === cls ? 0 : confusion[gold][cls]), 0), fn = CLASSES.reduce((sum, pred) => sum + (pred === cls ? 0 : confusion[cls][pred]), 0);
    const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
    perClass[cls] = { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
  }
  return {
    accuracy: correct / rows.length,
    macro_f1: CLASSES.reduce((sum, cls) => sum + perClass[cls].f1, 0) / CLASSES.length,
    false_safe_expansion_count: falseSafeExpansion,
    pair_preserving_precision: predictedPair ? truePairPredictions / predictedPair : 0,
    pair_preserving_recall: goldPair ? truePairPredictions / goldPair : 0,
    per_class: perClass,
    confusion_matrix: confusion
  };
}

await mkdir(CALLS, { recursive: true });
const [devText, manifestText, guardText] = await Promise.all([readFile(path.join(CONFIG, 'development.jsonl'), 'utf8'), readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'), readFile(path.join(CONFIG, GUARD_FILE), 'utf8')]);
const guard = JSON.parse(guardText), manifest = JSON.parse(manifestText);
const expectedDevSha = manifest.artifact_checksums?.development_sha256 || manifest.development_sha256;
if (!['development_selection_unlocked','development_unlocked'].includes(guard.status) || guard.development_selection_complete || sha256(devText) !== expectedDevSha) throw new Error('Development detector guard failed');
const rows = parseJsonl(devText);
const calls: any[] = [];
for (const [index, row] of rows.entries()) {
  for (const model of REQUEST_MODELS) calls.push({ row, call: await classify(model, row) });
  console.log(`completed ${index + 1}/${rows.length}`);
}
// Merge calls already cached by an earlier partial run. This lets temporary
// provider outages resume without repeating successful requests.
for (const row of rows) for (const model of MODELS) {
  if (calls.some((item) => rowKey(item.row) === rowKey(row) && item.call.model_id === model)) continue;
  const cachePath = path.join(CALLS, `${sha256(rowKey(row)).slice(0, 16)}.${model}.json`);
  try { calls.push({ row, call: JSON.parse(await readFile(cachePath, 'utf8')) }); } catch {}
}
const missingCalls = rows.flatMap((row) => MODELS.filter((model) => !calls.some((item) => rowKey(item.row) === rowKey(row) && item.call.model_id === model)).map((model) => ({ endpoint_key: rowKey(row), model_id: model })));
if (missingCalls.length) {
  const incomplete = { status: 'development_calls_incomplete_provider_unavailable', requested_models: REQUEST_MODELS, completed_call_count: calls.length, required_call_count: rows.length * MODELS.length, missing_calls: missingCalls, validation_labels_read: false, fresh_v4_data_read: false };
  await writeFile(path.join(OUT, 'DEVELOPMENT_CALL_STATUS.json'), JSON.stringify(incomplete, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(incomplete, null, 2));
  process.exit(2);
}
const configs: any = {};
for (const model of MODELS) {
  const preds = new Map(calls.filter((item) => item.call.model_id === model).map((item) => [rowKey(item.row), item.call.prediction.relation_type]));
  configs[model] = { type: 'single_model', models: [model], metrics: evaluate(rows, preds), predictions: Object.fromEntries(preds) };
}
const consensus = new Map<string, string>();
for (const row of rows) {
  const a = calls.find((item) => rowKey(item.row) === rowKey(row) && item.call.model_id === MODELS[0])!.call.prediction;
  const b = calls.find((item) => rowKey(item.row) === rowKey(row) && item.call.model_id === MODELS[1])!.call.prediction;
  // Pair-preserving expansion is allowed only on exact, high-confidence agreement.
  // All other cases fail closed to conflicting (no retained expansion).
  consensus.set(rowKey(row), a.relation_type === b.relation_type && PAIR.has(a.relation_type) && a.confidence >= 0.8 && b.confidence >= 0.8 ? a.relation_type : 'conflicting');
}
configs['fail_closed_consensus_0.8'] = { type: 'fail_closed_consensus', models: [...MODELS], confidence_threshold: 0.8, metrics: evaluate(rows, consensus), predictions: Object.fromEntries(consensus) };
const eligible = Object.entries(configs).filter(([, config]: any) => config.metrics.false_safe_expansion_count === 0 && config.metrics.pair_preserving_precision >= 0.8);
eligible.sort(([, a]: any, [, b]: any) => b.metrics.pair_preserving_recall - a.metrics.pair_preserving_recall || b.metrics.macro_f1 - a.metrics.macro_f1);
const selected = eligible[0]?.[0] || null;
const report = { status: selected ? 'development_detector_selected' : 'blocked_no_safe_detector', development_only: true, validation_labels_read: false, fresh_v4_data_read: false, prompt_version: 'v5-relation-decision-v1', system_prompt: SYSTEM, system_prompt_sha256: sha256(SYSTEM), configs, selection_rule: 'false_safe_expansion_count=0 and pair_preserving_precision>=0.8; maximize pair-preserving recall, then macro-F1', selected_config: selected };
await writeFile(path.join(OUT, 'DEVELOPMENT_SELECTION.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
await writeFile(path.join(OUT, 'DEVELOPMENT_PREDICTIONS.jsonl'), calls.map(({ row, call }) => JSON.stringify({ endpoint_key: rowKey(row), gold: row.relation_type, model_id: call.model_id, prediction: call.prediction, latency_ms: call.latency_ms, usage_metadata: call.usage_metadata })).join('\n') + '\n', 'utf8');
await writeFile(path.join(CONFIG, GUARD_FILE), JSON.stringify({ ...guard, status: selected ? 'development_selection_frozen_validation_unlocked' : 'blocked_no_safe_detector', development_selection_complete: true, selected_config: selected, development_selection_sha256: sha256(JSON.stringify(report, null, 2) + '\n'), validation_execution_count: 0, tuning_after_validation_allowed: false }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, selected_config: selected, metrics: selected ? configs[selected].metrics : configs }, null, 2));
