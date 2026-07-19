import { describe, expect, test } from "bun:test";
import { loadExperimentConfig } from "../../src/shared/config";
import * as path from "path";
import * as fs from "fs";

describe("loadExperimentConfig", () => {
  test("successfully loads valid append-only config", () => {
    const configPath = path.resolve(
      process.cwd(),
      "experiments/version_aware_rag/configs/v3/baseline_append_only.yaml"
    );
    const config = loadExperimentConfig(configPath);
    expect(config.experiment.id).toBe("baseline_append_only");
    expect(config.retrieval.mode).toBe("append_only");
    expect(config.retrieval.top_k).toBe(3);
  });

  test("throws error when config file does not exist", () => {
    expect(() => loadExperimentConfig("nonexistent_config.yaml")).toThrow(/Config file not found/);
  });

  test("throws validation error on invalid configuration properties", () => {
    const tempConfigPath = path.resolve(process.cwd(), "temp_invalid_config.yaml");
    const invalidYaml = `
experiment:
  id: invalid-exp
  seed: -1
corpus:
  path: nonexistent_corpus.json
retrieval:
  mode: invalid_mode
  top_k: -5
evaluation:
  query_path: nonexistent_queries.json
  judgment_path: nonexistent_judgments.json
`;
    fs.writeFileSync(tempConfigPath, invalidYaml, "utf8");
    try {
      expect(() => loadExperimentConfig(tempConfigPath)).toThrow(/Config validation failed/);
    } finally {
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }
  });

  test("throws validation error on corpus checksum mismatch", () => {
    const tempConfigPath = path.resolve(process.cwd(), "temp_checksum_mismatch_config.yaml");
    const mismatchYaml = `
experiment:
  id: test-mismatch
  seed: 42
corpus:
  path: experiments/version_aware_rag/data/corpus_v3/chunks.jsonl
  checksum: invalid_checksum_hash_here
retrieval:
  mode: append_only
  top_k: 3
version_policy:
  relation_source: none
evaluation:
  query_path: experiments/version_aware_rag/data/annotations_v3/queries.jsonl
  judgment_path: experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl
output:
  root: experiments/version_aware_rag/results/v3
`;
    fs.writeFileSync(tempConfigPath, mismatchYaml, "utf8");
    try {
      expect(() => loadExperimentConfig(tempConfigPath)).toThrow(/Corpus checksum mismatch/);
    } finally {
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }
  });
});
