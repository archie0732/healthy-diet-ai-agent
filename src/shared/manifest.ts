import { execSync } from 'child_process';

export interface RunManifest {
  run_id: string;
  timestamp: string;
  git: {
    commit: string;
    dirty: boolean;
  };
  config: any;
  input_checksums: Record<string, string>;
  runtime: {
    bun_version?: string;
    node_version: string;
  };
  seed: number;
  duration_ms: number;
  held_out?: boolean;
}

/**
 * Gets the current Git commit hash and whether the workspace has uncommitted changes.
 */
export function getGitStatus(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const status = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return {
      commit,
      dirty: status.length > 0,
    };
  } catch (error) {
    return {
      commit: 'unknown',
      dirty: false,
    };
  }
}

/**
 * Generates the full run manifest structure.
 */
export function generateRunManifest(
  runId: string,
  config: any,
  inputChecksums: Record<string, string>,
  durationMs: number,
  isHeldOut: boolean = false
): RunManifest {
  const gitStatus = getGitStatus();
  return {
    run_id: runId,
    timestamp: new Date().toISOString(),
    git: gitStatus,
    config,
    input_checksums: inputChecksums,
    runtime: {
      bun_version: (process as any).versions.bun || undefined,
      node_version: process.versions.node,
    },
    seed: config.experiment?.seed ?? 42,
    duration_ms: durationMs,
    held_out: isHeldOut ? true : undefined,
  };
}
