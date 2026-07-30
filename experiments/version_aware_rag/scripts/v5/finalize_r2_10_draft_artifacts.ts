import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_10_fresh_test_construction');
const files = [
  'SOURCE_CATALOG.md',
  'data/configs/v5_r2_10_frozen_policy/FROZEN_POLICY_PACKAGE.json',
  'data/configs/v5_r2_10_frozen_policy/FRESH_TEST_GUARD.json',
  'data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl',
  'data/annotations_v5/r2_10_fresh_test_draft/DRAFT_MANIFEST.json',
  'results/v5/r2_10_fresh_test_construction/R2_10_FRESH_TEST_REVIEW_PACKET.md',
  'scripts/v5/freeze_r2_10_policy_package.ts',
  'scripts/v5/build_r2_10_fresh_test_review_packet.ts',
  'scripts/v5/finalize_r2_10_draft_artifacts.ts',
  'tests/unit/v5_r2_10_construction.test.ts',
];
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const lines = await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(EXP, file)))}  ${file}`));
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'DRAFT_ARTIFACT_CHECKSUMS.sha256'), `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ artifact_count: files.length, output: path.relative(EXP, path.join(OUT, 'DRAFT_ARTIFACT_CHECKSUMS.sha256')) }, null, 2));
