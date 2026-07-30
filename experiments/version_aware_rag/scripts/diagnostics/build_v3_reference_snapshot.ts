import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { selectFrozenV3Runs } from './select_frozen_v3_runs';

function calculateChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function buildV3ReferenceSnapshot() {
  const outDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/oracle_failure_diagnosis');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const runs = selectFrozenV3Runs();

  const inputFiles = {
    corpus: 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl',
    queries: 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl',
    judgments: 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl',
    relations: 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl',
    relation_pairs: 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl',
    development_split: 'experiments/version_aware_rag/data/splits_v3/development.json',
    validation_split: 'experiments/version_aware_rag/data/splits_v3/validation.json',
    test_split: 'experiments/version_aware_rag/data/splits_v3/test.json'
  };

  const inputChecksums: Record<string, string> = {};
  for (const [key, relPath] of Object.entries(inputFiles)) {
    const fullPath = path.resolve(process.cwd(), relPath);
    inputChecksums[key] = calculateChecksum(fullPath);
  }

  const snapshot = {
    dataset_version: 'v3',
    analysis_started_at: new Date().toISOString(),
    runs: {
      append_only: {
        run_id: runs.append_only.run_id,
        manifest_checksum: runs.append_only.manifest_checksum
      },
      recency_only: {
        run_id: runs.recency_only.run_id,
        manifest_checksum: runs.recency_only.manifest_checksum
      },
      oracle_version_aware: {
        run_id: runs.oracle_version_aware.run_id,
        manifest_checksum: runs.oracle_version_aware.manifest_checksum
      },
      predicted_version_aware: {
        run_id: runs.predicted_version_aware.run_id,
        manifest_checksum: runs.predicted_version_aware.manifest_checksum
      }
    },
    input_checksums: inputChecksums,
    artifacts_are_read_only: true
  };

  const snapshotPath = path.join(outDir, 'baseline_reference_v3.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  const checksumsPath = path.join(outDir, 'input_checksums_v3.json');
  fs.writeFileSync(checksumsPath, JSON.stringify(inputChecksums, null, 2), 'utf-8');

  const markdownContent = `# Baseline Reference Snapshot (v3 Held-Out)

- **Dataset Version**: v3
- **Analysis Started At**: ${snapshot.analysis_started_at}

## Selected Frozen Test Runs

| System Role | Selected Run ID | Manifest SHA-256 Checksum |
|---|---|---|
| **Append-Only** | \`${runs.append_only.run_id}\` | \`${runs.append_only.manifest_checksum}\` |
| **Recency-Only** | \`${runs.recency_only.run_id}\` | \`${runs.recency_only.manifest_checksum}\` |
| **Oracle Version-Aware** | \`${runs.oracle_version_aware.run_id}\` | \`${runs.oracle_version_aware.manifest_checksum}\` |
| **Predicted Version-Aware** | \`${runs.predicted_version_aware.run_id}\` | \`${runs.predicted_version_aware.manifest_checksum}\` |

## Verified Input Data Checksums

${Object.entries(inputChecksums).map(([k, v]) => `- **${k}**: \`${v}\``).join('\n')}
`;

  const mdPath = path.join(outDir, 'BASELINE_REFERENCE_V3.md');
  fs.writeFileSync(mdPath, markdownContent, 'utf-8');

  return snapshot;
}

if (import.meta.main) {
  const snapshot = buildV3ReferenceSnapshot();
  console.log('Built Reference Snapshot:', snapshot.runs);
}
