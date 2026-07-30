import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_6_query_conditioned_cycle');
const files = [
  'V5_R2_6_QUERY_CONDITIONED_RESULT.md',
  'SOURCE_CATALOG.md',
  'data/configs/v5_r2_6_query_conditioned_action_detector/development.jsonl',
  'data/configs/v5_r2_6_query_conditioned_action_detector/validation.sealed.jsonl',
  'data/configs/v5_r2_6_query_conditioned_action_detector/SPLIT_MANIFEST.json',
  'data/configs/v5_r2_6_query_conditioned_action_detector/EXECUTION_GUARD.json',
  'data/annotations_v5/r2_6_query_conditioned_development_audit/audit_ledger.jsonl',
  'data/annotations_v5/r2_6_query_conditioned_development_audit/AUDIT_SUMMARY.json',
  'results/v5/r2_6_query_conditioned_development/DEVELOPMENT_SELECTION.json',
  'scripts/v5/build_r2_6_query_conditioned_split.ts',
  'scripts/v5/run_r2_6_query_conditioned_development.ts',
  'scripts/v5/audit_r2_6_development_labels.ts',
  'scripts/v5/finalize_r2_6_artifacts.ts',
  'tests/unit/v5_r2_6_protocol.test.ts',
];
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const lines = await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(EXP, file)))}  ${file}`));
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ artifact_count: files.length, output: path.relative(EXP, path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256')) }, null, 2));
