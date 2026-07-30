import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_10_fresh_test_cycle');
const files = [
  'SOURCE_CATALOG.md',
  'data/configs/v5_r2_10_frozen_policy/FROZEN_POLICY_PACKAGE.json',
  'data/configs/v5_r2_10_frozen_policy/FRESH_TEST_GUARD.json',
  'data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl',
  'data/annotations_v5/r2_10_fresh_test_draft/DRAFT_MANIFEST.json',
  'data/configs/v5_r2_10_fresh_test/approved_review_ledger.jsonl',
  'data/configs/v5_r2_10_fresh_test/retrieval_inputs.jsonl',
  'data/configs/v5_r2_10_fresh_test/judgments.sealed.jsonl',
  'data/configs/v5_r2_10_fresh_test/PROJECT_OWNER_SIGNOFF.json',
  'data/configs/v5_r2_10_fresh_test/MANIFEST.json',
  'data/configs/v5_r2_10_fresh_test/EXECUTION_GUARD.json',
  'results/v5/r2_10_fresh_test_construction/R2_10_FRESH_TEST_REVIEW_PACKET.md',
  'results/v5/r2_10_fresh_test/raw_retrieval_results.jsonl',
  'results/v5/r2_10_fresh_test/FRESH_TEST_RESULT.json',
  'results/v5/r2_10_fresh_test/INDEPENDENT_AUDIT.json',
  'V5_R2_10_FRESH_TEST_RESULT.md',
  'scripts/v5/record_r2_10_owner_signoff.ts',
  'scripts/v5/run_r2_10_fresh_test.ts',
  'scripts/v5/audit_r2_10_fresh_test.ts',
  'scripts/v5/finalize_r2_10_artifacts.ts',
  'tests/unit/v5_r2_10_construction.test.ts',
  'tests/unit/v5_r2_10_fresh_test.test.ts',
];
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const lines = await Promise.all(files.map(async (file) => `${sha256(await readFile(path.join(EXP, file)))}  ${file}`));
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ artifact_count: files.length, output: path.relative(EXP, path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256')) }, null, 2));
