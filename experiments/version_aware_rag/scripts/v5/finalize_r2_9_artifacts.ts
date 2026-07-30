import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_9_retrieval_validation_cycle');
const files = [
  'R2_9_RETRIEVAL_VALIDATION_PROTOCOL.md',
  'V5_R2_9_RETRIEVAL_VALIDATION_RESULT.md',
  'SOURCE_CATALOG.md',
  'data/annotations_v5/r2_9_retrieval_validation/pre_retrieval_audit_ledger.jsonl',
  'data/configs/v5_r2_9_retrieval_validation/retrieval_inputs.jsonl',
  'data/configs/v5_r2_9_retrieval_validation/judgments.sealed.jsonl',
  'data/configs/v5_r2_9_retrieval_validation/MANIFEST.json',
  'data/configs/v5_r2_9_retrieval_validation/EXECUTION_GUARD.json',
  'results/v5/r2_9_retrieval_validation/raw_retrieval_results.jsonl',
  'results/v5/r2_9_retrieval_validation/VALIDATION_RESULT.json',
  'results/v5/r2_9_retrieval_validation/INDEPENDENT_AUDIT.json',
  'scripts/v5/build_r2_9_retrieval_validation.ts',
  'scripts/v5/run_r2_9_retrieval_validation.ts',
  'scripts/v5/audit_r2_9_retrieval_validation.ts',
  'scripts/v5/finalize_r2_9_artifacts.ts',
  'tests/unit/v5_r2_9_protocol.test.ts',
];
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const lines = await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(EXP, file)))}  ${file}`));
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ artifact_count: files.length, output: path.relative(EXP, path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256')) }, null, 2));
