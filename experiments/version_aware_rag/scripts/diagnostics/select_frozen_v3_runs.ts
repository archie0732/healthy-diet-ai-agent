import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ManifestData {
  run_id: string;
  timestamp: string;
  git: { commit: string; dirty: boolean };
  config: {
    experiment: { id: string; seed: number; split: string };
  };
  input_checksums: Record<string, string>;
  held_out?: boolean;
}

export function selectFrozenV3Runs() {
  const v3ResultsDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3');
  const dirEntries = fs.readdirSync(v3ResultsDir, { withFileTypes: true });

  const candidateRuns: Record<string, Array<{ dirName: string; manifest: ManifestData }>> = {
    append_only: [],
    recency_only: [],
    oracle_version_aware: [],
    predicted_version_aware: []
  };

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(v3ResultsDir, entry.name);
    const manifestPath = path.join(runDir, 'manifest.json');
    const rawPath = path.join(runDir, 'results_raw.json');
    const summaryPath = path.join(runDir, 'results_summary.json');

    if (!fs.existsSync(manifestPath) || !fs.existsSync(rawPath) || !fs.existsSync(summaryPath)) {
      continue;
    }

    try {
      const manifest: ManifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.held_out !== true || manifest.config.experiment.split !== 'test') {
        continue;
      }

      const expId = manifest.config.experiment.id;
      if (expId.includes('append_only')) {
        candidateRuns.append_only.push({ dirName: entry.name, manifest });
      } else if (expId.includes('recency_only')) {
        candidateRuns.recency_only.push({ dirName: entry.name, manifest });
      } else if (expId === 'proposed_full_version_aware' || expId === 'proposed_version_aware') {
        candidateRuns.oracle_version_aware.push({ dirName: entry.name, manifest });
      } else if (expId === 'proposed_predicted_relations') {
        candidateRuns.predicted_version_aware.push({ dirName: entry.name, manifest });
      }
    } catch {
      // skip invalid JSON
    }
  }

  const selectedRuns: Record<string, { run_id: string; manifest_checksum: string; dir_path: string }> = {};

  for (const [key, list] of Object.entries(candidateRuns)) {
    if (list.length === 0) {
      throw new Error(`No eligible frozen run found for ${key} (split=test, held_out=true)`);
    }

    // Sort by timestamp ascending (earliest formal run)
    list.sort((a, b) => a.manifest.timestamp.localeCompare(b.manifest.timestamp));
    const chosen = list[0];
    const manifestFile = path.join(v3ResultsDir, chosen.dirName, 'manifest.json');
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex');

    selectedRuns[key] = {
      run_id: chosen.manifest.run_id,
      manifest_checksum: checksum,
      dir_path: path.join(v3ResultsDir, chosen.dirName)
    };
  }

  return selectedRuns;
}

if (import.meta.main) {
  const runs = selectFrozenV3Runs();
  console.log('Selected Frozen V3 Runs:', JSON.stringify(runs, null, 2));
}
