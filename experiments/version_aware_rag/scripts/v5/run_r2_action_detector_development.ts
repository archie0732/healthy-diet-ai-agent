import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = process.env.V5_R2_CONFIG_DIR ? path.resolve(process.env.V5_R2_CONFIG_DIR) : path.join(EXP, 'data/configs/v5_r2_action_detector');
const OUT = process.env.V5_R2_OUT_DIR ? path.resolve(process.env.V5_R2_OUT_DIR) : path.join(EXP, 'results/v5/r2_action_detector_development');
const CALLS = path.join(OUT, 'model_calls');
const MODELS = ['gemma-4-31b-it', 'gemini-3.1-flash-lite'] as const;
const LABELS = ['PAIR_PRESERVE', 'BLOCK_RETAINED'] as const;
const STATUSES = ['RETAINS_DISTINCT', 'ADDS_SCOPE_OR_EXCEPTION', 'DUPLICATES', 'REPLACES_OR_CONFLICTS', 'UNCERTAIN'] as const;
const PROMPT_MODE = process.env.V5_R2_PROMPT_MODE || 'simple_v2';
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SIMPLE_SYSTEM = `Decide the retrieval action for an OLD guideline passage when a CURRENT passage is available. Use passage content only; never use IDs, dates, labels, or hidden judgments.

PAIR_PRESERVE: retrieve both passages only when they provide distinct, compatible, currently applicable evidence, or when OLD remains necessary for a population, condition, exception, implementation detail, or safety constraint not displaced by CURRENT.

BLOCK_RETAINED: do not retrieve OLD when CURRENT explicitly replaces or updates it, when OLD materially duplicates the same instruction, when they conflict, or when continued applicability of OLD is uncertain.

Sharing a topic is not enough for PAIR_PRESERVE. Safety is fail-closed: if the passages do not clearly justify retaining OLD alongside CURRENT, choose BLOCK_RETAINED.

Abstract examples (not drawn from evaluation judgments):
- OLD gives the same threshold and scope as CURRENT -> BLOCK_RETAINED.
- CURRENT explicitly says it replaces OLD -> BLOCK_RETAINED.
- OLD gives a quantitative ceiling while CURRENT gives a compatible implementation method without restating that ceiling -> PAIR_PRESERVE.
- OLD gives the general rule while CURRENT adds an explicit population exception or applicability boundary -> PAIR_PRESERVE.
- OLD and CURRENT merely recommend the same food in different words -> BLOCK_RETAINED.

Return JSON only.`;

const DECOMPOSED_SYSTEM = `Analyze whether an OLD guideline passage contains evidence that must still be retrieved when a CURRENT passage is available. Use passage content only; never use IDs, dates, labels, or hidden judgments.

First identify the concrete obligation, threshold, population scope, exception, implementation method, or safety constraint in OLD that is not stated in CURRENT. Then classify CURRENT's effect on OLD as exactly one status:
- RETAINS_DISTINCT: OLD contains a distinct compatible constraint that CURRENT neither restates nor displaces.
- ADDS_SCOPE_OR_EXCEPTION: CURRENT explicitly adds a population boundary, condition, or exception while OLD remains necessary to state the general rule.
- DUPLICATES: CURRENT materially restates or subsumes OLD, even if it is more detailed.
- REPLACES_OR_CONFLICTS: CURRENT explicitly replaces, changes, or contradicts OLD.
- UNCERTAIN: the passages do not clearly establish continued applicability.

Abstract examples (not drawn from evaluation judgments):
- Same threshold and scope in both passages -> DUPLICATES.
- CURRENT says it replaces OLD -> REPLACES_OR_CONFLICTS.
- OLD gives a quantitative ceiling; CURRENT only gives a compatible implementation method -> RETAINS_DISTINCT.
- OLD gives a general rule; CURRENT adds a population exception not present in OLD -> ADDS_SCOPE_OR_EXCEPTION.
- Same food advice rephrased with extra examples -> DUPLICATES.

Return JSON only. Do not directly choose the retrieval action; a fixed policy will map RETAINS_DISTINCT and ADDS_SCOPE_OR_EXCEPTION to preserve, and all other statuses to block.`;
const SYSTEM = PROMPT_MODE === 'decomposed_v3' ? DECOMPOSED_SYSTEM : SIMPLE_SYSTEM;
const PROMPT_VERSION = PROMPT_MODE === 'decomposed_v3' ? 'v5-r2-action-v3-decomposed' : 'v5-r2-action-v2';

function prompt(row: any) {
  return PROMPT_MODE === 'decomposed_v3'
    ? `OLD PASSAGE\n${row.old_evidence.text}\n\nCURRENT PASSAGE\n${row.current_evidence.text}\n\nReturn retention_status, old_unique_information, confidence from 0 to 1, and a concise rationale.`
    : `OLD PASSAGE\n${row.old_evidence.text}\n\nCURRENT PASSAGE\n${row.current_evidence.text}\n\nShould OLD be retrieved alongside CURRENT? Return action_label, confidence from 0 to 1, and a concise rationale naming the decisive distinction.`;
}

async function classify(model: typeof MODELS[number], row: any) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt(row) }] }],
    generationConfig: {
      temperature: model.startsWith('gemini-3') ? 1 : 0,
      maxOutputTokens: 768,
      ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
      responseMimeType: 'application/json',
      responseSchema: PROMPT_MODE === 'decomposed_v3' ? { type: 'OBJECT', properties: {
        retention_status: { type: 'STRING', enum: STATUSES }, old_unique_information: { type: 'STRING' }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, rationale: { type: 'STRING' },
      }, required: ['retention_status', 'old_unique_information', 'confidence', 'rationale'] } : { type: 'OBJECT', properties: {
        action_label: { type: 'STRING', enum: LABELS }, confidence: { type: 'NUMBER', minimum: 0, maximum: 1 }, rationale: { type: 'STRING' },
      }, required: ['action_label', 'confidence', 'rationale'] },
    },
  };
  const bodyText = JSON.stringify(body);
  const callPath = path.join(CALLS, `${row.pair_id}.${model}.json`);
  try {
    const cached = JSON.parse(await readFile(callPath, 'utf8'));
    if (cached.request_sha256 === sha256(bodyText)) return cached;
  } catch {}
  const key = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_AI_API is required');
  let last = '';
  for (let attempt = 0; attempt < 7; attempt++) {
    const started = performance.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: bodyText,
    });
    last = await response.text();
    if (response.ok) {
      try {
        const raw = JSON.parse(last);
        const text = raw.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
        const prediction = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
        if (PROMPT_MODE === 'decomposed_v3') {
          if (!STATUSES.includes(prediction.retention_status) || typeof prediction.old_unique_information !== 'string' || typeof prediction.confidence !== 'number' || typeof prediction.rationale !== 'string') throw new Error('decomposed schema mismatch');
          prediction.action_label = ['RETAINS_DISTINCT', 'ADDS_SCOPE_OR_EXCEPTION'].includes(prediction.retention_status) ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED';
        } else if (!LABELS.includes(prediction.action_label) || typeof prediction.confidence !== 'number' || typeof prediction.rationale !== 'string') throw new Error('schema mismatch');
        const result = { pair_id: row.pair_id, model_id: model, prompt_version: PROMPT_VERSION, system_prompt_sha256: sha256(SYSTEM), request_sha256: sha256(bodyText), response_sha256: sha256(last), prediction, latency_ms: Math.round(performance.now() - started), usage_metadata: raw.usageMetadata };
        await writeFile(callPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
        return result;
      } catch (error: any) {
        await writeFile(callPath.replace(/\.json$/, `.attempt-${attempt + 1}.invalid.json`), JSON.stringify({ model_id: model, pair_id: row.pair_id, request_sha256: sha256(bodyText), response_sha256: sha256(last), error: error.message, raw_response: last }, null, 2) + '\n', 'utf8');
      }
    }
    if (response.status !== 429 && response.status < 500) throw new Error(`${model} HTTP ${response.status}: ${last.slice(0, 300)}`);
    await delay(response.status === 429 ? 62000 : Math.min(15000, 1000 * 2 ** attempt));
  }
  throw new Error(`${row.pair_id}/${model} failed: ${last.slice(0, 300)}`);
}

function evaluate(rows: any[], predictions: Map<string, string>) {
  let correct = 0, falsePreserve = 0, predictedPreserve = 0, truePreserve = 0, goldPreserve = 0;
  const confusion: any = Object.fromEntries(LABELS.map((gold) => [gold, Object.fromEntries(LABELS.map((pred) => [pred, 0]))]));
  for (const row of rows) {
    const pred = predictions.get(row.pair_id)!;
    confusion[row.action_label][pred]++;
    if (pred === row.action_label) correct++;
    if (row.action_label === 'PAIR_PRESERVE') goldPreserve++;
    if (pred === 'PAIR_PRESERVE') {
      predictedPreserve++;
      if (row.action_label === 'PAIR_PRESERVE') truePreserve++; else falsePreserve++;
    }
  }
  return {
    query_count: rows.length, accuracy: correct / rows.length, false_preserve_count: falsePreserve,
    pair_preserve_precision: predictedPreserve ? truePreserve / predictedPreserve : 0,
    pair_preserve_recall: goldPreserve ? truePreserve / goldPreserve : 0, confusion_matrix: confusion,
  };
}

await mkdir(CALLS, { recursive: true });
const [devText, manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, 'development.jsonl'), 'utf8'), readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'), readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'),
]);
const manifest = JSON.parse(manifestText), guard = JSON.parse(guardText);
if (guard.status !== 'development_unlocked' || guard.development_selection_complete || sha256(devText) !== manifest.development_sha256) throw new Error('R2 development guard failed');
const rows = parseJsonl(devText);
const calls: any[] = [];
for (const [index, row] of rows.entries()) {
  for (const model of MODELS) calls.push(await classify(model, row));
  console.log(`completed ${index + 1}/${rows.length}`);
}

const configs: any = {};
for (const model of MODELS) {
  const predictions = new Map(calls.filter((call) => call.model_id === model).map((call) => [call.pair_id, call.prediction.action_label]));
  configs[model] = { type: 'single_model', models: [model], metrics: evaluate(rows, predictions), predictions: Object.fromEntries(predictions) };
}
for (const threshold of [0.7, 0.8, 0.9]) {
  const predictions = new Map<string, string>();
  for (const row of rows) {
    const a = calls.find((call) => call.pair_id === row.pair_id && call.model_id === MODELS[0]).prediction;
    const b = calls.find((call) => call.pair_id === row.pair_id && call.model_id === MODELS[1]).prediction;
    predictions.set(row.pair_id, a.action_label === 'PAIR_PRESERVE' && b.action_label === 'PAIR_PRESERVE' && a.confidence >= threshold && b.confidence >= threshold ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED');
  }
  configs[`fail_closed_consensus_${threshold}`] = { type: 'fail_closed_consensus', models: [...MODELS], confidence_threshold: threshold, metrics: evaluate(rows, predictions), predictions: Object.fromEntries(predictions) };
}
const eligible = Object.entries(configs).filter(([, config]: any) => config.metrics.false_preserve_count === 0 && config.metrics.pair_preserve_precision === 1 && config.metrics.pair_preserve_recall >= 0.5);
eligible.sort(([, a]: any, [, b]: any) => b.metrics.pair_preserve_recall - a.metrics.pair_preserve_recall || b.metrics.accuracy - a.metrics.accuracy);
const selected = eligible[0]?.[0] || null;
const report = {
  status: selected ? 'r2_development_action_detector_selected' : 'blocked_no_safe_r2_action_detector', development_only: true,
  validation_labels_read: false, prompt_version: PROMPT_VERSION, prompt_mode: PROMPT_MODE, system_prompt: SYSTEM, system_prompt_sha256: sha256(SYSTEM),
  configs, selection_rule: 'false_preserve_count=0, pair_preserve_precision=1, and pair-preserve recall>=0.5; maximize pair-preserve recall, then accuracy', selected_config: selected,
};
const reportText = JSON.stringify(report, null, 2) + '\n';
await writeFile(path.join(OUT, 'DEVELOPMENT_SELECTION.json'), reportText, 'utf8');
await writeFile(path.join(OUT, 'DEVELOPMENT_PREDICTIONS.jsonl'), calls.map((call) => JSON.stringify({ pair_id: call.pair_id, model_id: call.model_id, prediction: call.prediction, latency_ms: call.latency_ms, usage_metadata: call.usage_metadata })).join('\n') + '\n', 'utf8');
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), JSON.stringify({ ...guard,
  status: selected ? 'development_selection_frozen_validation_unlocked' : 'blocked_no_safe_r2_action_detector', development_selection_complete: true,
  selected_config: selected, development_selection_sha256: sha256(reportText), validation_execution_count: 0, tuning_after_validation_allowed: false,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, selected_config: selected, metrics: selected ? configs[selected].metrics : configs }, null, 2));
