import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v4/dev_model_selection');
const CALLS = path.join(OUT, 'model_calls');
const files = await readdir(CALLS);
const percentile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1))] || 0;

async function summarize(model: string) {
  const names = files.filter((file) => file.endsWith(`.${model}.cross_encoder.json`));
  const calls = await Promise.all(names.map(async (file) => JSON.parse(await readFile(path.join(CALLS, file), 'utf8'))));
  const latencies = calls.map((call) => Number(call.trace.latencyMs)).sort((a, b) => a - b);
  const repairCalls = calls.filter((call) => call.trace?.rawResponse?.repair || call.trace?.rawResponse?.some?.((response: any) => response?.repair)).length;
  return {
    model_id: model,
    completed_queries: calls.length,
    expected_queries: 16,
    complete: calls.length === 16,
    latency_ms: {
      mean: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
      median: latencies.length ? percentile(latencies, 0.5) : null,
      p95: latencies.length ? percentile(latencies, 0.95) : null,
      min: latencies[0] || null,
      max: latencies.at(-1) || null,
    },
    repair_query_count: repairCalls,
    artifact_files: names.sort(),
  };
}

const gemma = await summarize('gemma-4-31b-it');
const gemini = await summarize('gemini-3.5-flash');
const summary = {
  status: 'development_cross_encoder_comparison',
  selected_complete_model: 'gemma-4-31b-it',
  selected_mode: 'oracle_cross_0.5',
  models: { gemma_4_31b_it: gemma, gemini_3_5_flash: gemini },
  gemini_limitation: gemini.complete ? null : 'Gemini 3.5 Flash full run was stopped because long-request latency and rolling quota made the 16-query run impractical. Partial calls are not used for model selection.',
};
await writeFile(path.join(OUT, 'RERANKER_MODEL_COMPARISON.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, 'RERANKER_MODEL_COMPARISON.md'), `# Development Reranker Model Comparison\n\n` +
  `- Selected complete model: \`${summary.selected_complete_model}\`\n` +
  `- Selected mode: \`${summary.selected_mode}\`\n` +
  `- Gemma completed queries: ${gemma.completed_queries}/16; median latency: ${gemma.latency_ms.median} ms\n` +
  `- Gemini completed queries: ${gemini.completed_queries}/16; median latency: ${gemini.latency_ms.median ?? 'n/a'} ms\n\n` +
  `Gemini partial calls are retained as feasibility and latency artifacts but are excluded from model selection.\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
