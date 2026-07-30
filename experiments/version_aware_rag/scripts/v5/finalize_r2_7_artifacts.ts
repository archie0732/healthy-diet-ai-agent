import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_7_explicit_historical_router_cycle');
const files = [
  'V5_R2_7_EXPLICIT_HISTORICAL_ROUTER_RESULT.md',
  'SOURCE_CATALOG.md',
  'data/sources_v5/who_fao/MANIFEST.json',
  'data/sources_v5/who_fao/WHO_FAO_TRS_916_2003_part2.pdf',
  'data/annotations_v5/r2_7_preaudited_cross_version/pre_model_audit_ledger.jsonl',
  'data/configs/v5_r2_7_preaudited_cross_version/development.jsonl',
  'data/configs/v5_r2_7_preaudited_cross_version/validation.sealed.jsonl',
  'data/configs/v5_r2_7_preaudited_cross_version/SPLIT_MANIFEST.json',
  'data/configs/v5_r2_7_preaudited_cross_version/EXECUTION_GUARD.json',
  'results/v5/r2_7_temporal_intent_development/DEVELOPMENT_SELECTION.json',
  'results/v5/r2_7_temporal_intent_validation/VALIDATION_RESULT.json',
  'scripts/v5/build_r2_7_preaudited_cross_version_split.ts',
  'scripts/v5/run_r2_7_temporal_intent_development.ts',
  'scripts/v5/run_r2_7_temporal_intent_validation.ts',
  'scripts/v5/finalize_r2_7_artifacts.ts',
  'tests/unit/v5_r2_7_protocol.test.ts',
];
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const lines = await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(EXP, file)))}  ${file}`));
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ artifact_count: files.length, output: path.relative(EXP, path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256')) }, null, 2));
