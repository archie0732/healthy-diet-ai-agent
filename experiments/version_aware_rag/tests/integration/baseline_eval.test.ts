import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { BM25Retriever } from "../../src/retrieval/bm25";
import { verifyNoOracle } from "../../src/evaluation/validate_no_oracle";
import { RetrievalContext } from "../../src/retrieval/types";
import { CorpusChunk } from "../../src/corpus/types";

describe("no-oracle integration", () => {
  const tmpDir = path.resolve(process.cwd(), "experiments/version_aware_rag/tests/integration/tmp_test");

  beforeAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const mockChunks: CorpusChunk[] = [
    {
      chunk_id: "c-1",
      document_id: "doc-1",
      edition: "2015-2020",
      published_at: "2015-12-01",
      source_url: "",
      source_checksum: "",
      page_number: 1,
      passage_index: 0,
      char_start: 0,
      char_end: 10,
      text: "dairy is healthy, drink whole milk",
      topic_ids: ["lineage-dairy"],
      lineage_id: "lineage-dairy",
      population_tags: [],
      condition_tags: [],
      numeric_claims: []
    },
    {
      chunk_id: "c-2",
      document_id: "doc-1",
      edition: "2020-2025",
      published_at: "2020-12-01",
      source_url: "",
      source_checksum: "",
      page_number: 2,
      passage_index: 0,
      char_start: 0,
      char_end: 10,
      text: "low-fat milk is better for adults",
      topic_ids: ["lineage-dairy"],
      lineage_id: "lineage-dairy",
      population_tags: [],
      condition_tags: [],
      numeric_claims: []
    }
  ];

  test("asserts that changes to judgments do not affect retriever output in-memory", async () => {
    const retriever = new BM25Retriever(mockChunks);
    const query: RetrievalContext = {
      queryId: "q-1",
      question: "whole milk or low-fat dairy guidelines?",
      targetPopulation: [],
      conditions: []
    };

    let mockJudgments = {
      required: ["c-2"]
    };

    const modifyJudgments = () => {
      mockJudgments.required = ["c-1"];
    };

    const isOracleFree = await verifyNoOracle(retriever, query, 2, modifyJudgments);
    expect(isOracleFree).toBe(true);
  });

  // Real Runner End-to-End No-Oracle test (validates disk-loading sequence boundary)
  test("asserts that changes to judgments file do not affect real runner retrieval output and verifies sequential event ordering", () => {
    // Write test data
    const corpusPath = path.join(tmpDir, "corpus.jsonl");
    const queriesPath = path.join(tmpDir, "queries.jsonl");
    const judgmentsPath = path.join(tmpDir, "judgments.jsonl");
    const configPath = path.join(tmpDir, "config.yaml");
    const resultsRoot = path.join(tmpDir, "results");

    fs.writeFileSync(corpusPath, mockChunks.map(c => JSON.stringify(c)).join("\n"));
    
    const mockQuery = {
      query_id: "q-1",
      question: "whole milk dairy options",
      target_population: [],
      conditions: [],
      stratum: "current_only"
    };
    fs.writeFileSync(queriesPath, JSON.stringify(mockQuery) + "\n");

    const configContent = `
experiment:
  id: integration_test_baseline
  seed: 42
  split: development
corpus:
  path: ${corpusPath.replace(/\\/g, "/")}
retrieval:
  mode: append_only
  backend: bm25
  top_k: 2
  recency_weight: 0.0
version_policy:
  relation_source: none
  deprecated_filter: false
  compatibility_expansion: false
evaluation:
  query_path: ${queriesPath.replace(/\\/g, "/")}
  judgment_path: ${judgmentsPath.replace(/\\/g, "/")}
  strata: false
output:
  root: ${resultsRoot.replace(/\\/g, "/")}
`;
    fs.writeFileSync(configPath, configContent);

    // Initial judgments: c-2 is required
    const initialJudgment = {
      query_id: "q-1",
      required_chunk_ids: ["c-2"],
      compatible_chunk_ids: [],
      preferred_chunk_ids: [],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ["c-2"]
    };
    fs.writeFileSync(judgmentsPath, JSON.stringify(initialJudgment) + "\n");

    // Run 1 and capture stdout
    const stdout1 = execSync(`bun experiments/version_aware_rag/scripts/v3/run_experiment.ts --config ${configPath} --split all`, {
      encoding: "utf-8"
    });

    // Verify correct event execution sequence (START_RETRIEVAL -> END_RETRIEVAL -> READ_JUDGMENT_CHECKSUM -> LOAD_JUDGMENTS -> START_SCORING -> END_SCORING)
    const events = stdout1.split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("[EVENT]"))
      .map(line => line.substring("[EVENT] ".length));

    expect(events).toEqual([
      "START_RETRIEVAL",
      "END_RETRIEVAL",
      "READ_JUDGMENT_CHECKSUM",
      "LOAD_JUDGMENTS",
      "START_SCORING",
      "END_SCORING"
    ]);

    // Extract Retrieved IDs from Run 1
    const runDirs1 = fs.readdirSync(resultsRoot);
    expect(runDirs1.length).toBe(1);
    const run1Dir = path.join(resultsRoot, runDirs1[0]);
    const run1Results = JSON.parse(fs.readFileSync(path.join(run1Dir, "results_raw.json"), "utf-8"));
    const retrievedIds1 = run1Results[0].retrieved.map((r: any) => r.chunkId);

    // Clean up results dir for run 2
    fs.rmSync(resultsRoot, { recursive: true, force: true });
    fs.mkdirSync(resultsRoot, { recursive: true });

    // Modified judgments: completely different judgments (c-1 required, c-2 deprecated, etc.)
    const modifiedJudgment = {
      query_id: "q-1",
      required_chunk_ids: ["c-1"],
      compatible_chunk_ids: ["c-2"],
      preferred_chunk_ids: ["c-1"],
      deprecated_chunk_ids: ["c-2"],
      forbidden_chunk_ids: ["c-1"],
      citation_safe_chunk_ids: []
    };
    fs.writeFileSync(judgmentsPath, JSON.stringify(modifiedJudgment) + "\n");

    // Run 2
    execSync(`bun experiments/version_aware_rag/scripts/v3/run_experiment.ts --config ${configPath} --split all`, {
      stdio: "ignore"
    });

    // Extract Retrieved IDs from Run 2
    const runDirs2 = fs.readdirSync(resultsRoot);
    expect(runDirs2.length).toBe(1);
    const run2Dir = path.join(resultsRoot, runDirs2[0]);
    const run2Results = JSON.parse(fs.readFileSync(path.join(run2Dir, "results_raw.json"), "utf-8"));
    const retrievedIds2 = run2Results[0].retrieved.map((r: any) => r.chunkId);

    // Assert retrieved chunk IDs are exactly identical despite judgment modifications
    expect(retrievedIds1).toEqual(retrievedIds2);
    expect(retrievedIds1.length).toBeGreaterThan(0);
  });
});
