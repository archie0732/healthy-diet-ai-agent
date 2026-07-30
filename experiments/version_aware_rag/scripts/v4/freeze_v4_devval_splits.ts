import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const APPROVED = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl');
const SPLIT_DIR = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const approvedText = await readFile(APPROVED, 'utf8');
const records = approvedText.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const development = records.filter((record) => record.split === 'development');
const validation = records.filter((record) => record.split === 'validation');
if (development.length !== 16 || validation.length !== 8) {
  throw new Error(`Expected 16 development and 8 validation records; found ${development.length}/${validation.length}`);
}
const developmentText = `${development.map((record) => JSON.stringify(record)).join('\n')}\n`;
const validationText = `${validation.map((record) => JSON.stringify(record)).join('\n')}\n`;
const manifest = {
  status: 'frozen_devval_split',
  source_approved_ledger_sha256: sha256(approvedText),
  development: {
    path: 'development.jsonl',
    record_count: development.length,
    sha256: sha256(developmentText),
    model_selection_read_allowed: true,
  },
  validation: {
    path: 'validation.sealed.jsonl',
    record_count: validation.length,
    sha256: sha256(validationText),
    sealed: true,
    read_allowed_now: false,
    unlock_condition: 'A single development-selected model, prompt, policy, weights, and artifact manifest are frozen.',
  },
  fresh_test_read_allowed: false,
};
await mkdir(SPLIT_DIR, { recursive: true });
await writeFile(path.join(SPLIT_DIR, 'development.jsonl'), developmentText, 'utf8');
await writeFile(path.join(SPLIT_DIR, 'validation.sealed.jsonl'), validationText, 'utf8');
await writeFile(path.join(SPLIT_DIR, 'split_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
