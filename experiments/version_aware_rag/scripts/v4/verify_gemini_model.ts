import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'experiments/version_aware_rag/results/v4/model_registry');
const MODEL = 'gemini-3.5-flash';

export async function verifyGeminiModel() {
  const key = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_AI_API or GEMINI_API_KEY is required.');
  const prompt = 'Reply with exactly: ok';
  const started = Date.now();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 8 } })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Gemini verification failed: ${response.status} ${body.slice(0, 400)}`);
  const parsed: any = JSON.parse(body);
  const corpus = path.join(ROOT, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const sha = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
  const manifest = {
    status: 'verified', model_id: MODEL, endpoint: 'v1beta/models/{model}:generateContent', credential_source: process.env.GEMINI_AI_API ? 'GEMINI_AI_API' : 'GEMINI_API_KEY',
    temperature: 0, prompt_sha256: sha(prompt), response_sha256: sha(body), corpus_sha256: sha(fs.readFileSync(corpus)),
    latency_ms: Date.now() - started, usage: parsed.usageMetadata || null, verified_at: new Date().toISOString()
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gemini-3.5-flash.manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (require.main === module) verifyGeminiModel().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
