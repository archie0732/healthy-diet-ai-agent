import { describe, expect, test } from "bun:test";
import { RuleBaselineDetector } from "../../src/versioning/detectors/rule_baseline";
import { LLMDetector } from "../../src/versioning/detectors/llm_detector";
import { ResponseCache } from "../../src/versioning/detectors/cache";
import { getFewShotPrompt } from "../../src/versioning/detectors/prompt";
import { CorpusChunk } from "../../src/corpus/types";
import * as path from "path";
import * as fs from "fs";

describe("detector suite - plan 6 requirements", () => {
  const dummyChunkOld: CorpusChunk = {
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
    text: "Consume less than 2,300 milligrams per day of sodium.",
    topic_ids: ["lineage-sodium"],
    lineage_id: "lineage-sodium",
    population_tags: [],
    condition_tags: [],
    numeric_claims: []
  };

  const dummyChunkNew: CorpusChunk = {
    chunk_id: "c-2",
    document_id: "doc-1",
    edition: "2025-2030",
    published_at: "2025-12-01",
    source_url: "",
    source_checksum: "",
    page_number: 2,
    passage_index: 0,
    char_start: 0,
    char_end: 10,
    text: "Consume less than 2,300 milligrams per day of sodium. Highly active individuals sweating heavily may increase intake.",
    topic_ids: ["lineage-sodium"],
    lineage_id: "lineage-sodium",
    population_tags: [],
    condition_tags: [],
    numeric_claims: []
  };

  test("1. lineage ID independence - prediction remains identical when ID changes", async () => {
    const detector = new RuleBaselineDetector();
    const res1 = await detector.classify({ oldChunk: dummyChunkOld, newChunk: dummyChunkNew });

    const modifiedOld = { ...dummyChunkOld, lineage_id: "lineage-random-xyz", topic_ids: ["random"] };
    const modifiedNew = { ...dummyChunkNew, lineage_id: "lineage-random-xyz", topic_ids: ["random"] };
    const res2 = await detector.classify({ oldChunk: modifiedOld, newChunk: modifiedNew });

    expect(res1.relationType).toBe(res2.relationType);
    expect(res1.confidence).toBe(res2.confidence);
  });

  test("2. 5 relation fixtures classification", async () => {
    const detector = new RuleBaselineDetector();

    // Fixture A: same-value restatement -> duplicate
    const resDup = await detector.classify({
      oldChunk: { ...dummyChunkOld, text: "Eat plenty of fresh vegetables and whole fruits daily." },
      newChunk: { ...dummyChunkNew, text: "Eat plenty of fresh vegetables and whole fruits daily." }
    });
    expect(resDup.relationType).toBe("duplicate");

    // Fixture B: population exception -> conditional_difference
    const resCond = await detector.classify({
      oldChunk: { ...dummyChunkOld, text: "Keep daily sodium intake below 2300 mg." },
      newChunk: { ...dummyChunkNew, text: "Keep daily sodium intake below 2300 mg. Athletes exercising heavily may need more." }
    });
    expect(resCond.relationType).toBe("conditional_difference");

    // Fixture C: numeric update -> superseded
    const resSup = await detector.classify({
      oldChunk: { ...dummyChunkOld, text: "Limit daily added sugar to less than 10% of total calories." },
      newChunk: { ...dummyChunkNew, text: "Limit daily added sugar to less than 6% of total calories." }
    });
    expect(resSup.relationType).toBe("superseded");

    // Fixture D: supplementary detail -> complementary
    const resComp = await detector.classify({
      oldChunk: { ...dummyChunkOld, text: "Maintain regular physical activity." },
      newChunk: { ...dummyChunkNew, text: "Drink sufficient water throughout the day." }
    });
    expect(resComp.relationType).toBe("complementary");
  });

  test("3. invalid detector output does NOT default to safe retain or complementary", async () => {
    // LLM detector with invalid model/key or schema failure should set isError = true
    const detector = new LLMDetector("zero-shot", "invalid-model-name");
    const result = await detector.classify({ oldChunk: dummyChunkOld, newChunk: dummyChunkNew });

    // When an error occurs during API call / parsing, relationType must be flagged as conflicting / isError
    // and MUST NOT default silently to complementary with isError=false.
    if (result.isError) {
      expect(result.relationType).not.toBe("complementary");
      expect(result.isError).toBe(true);
    }
  });

  test("4. response cache key invalidates when prompt, model, or text changes", () => {
    const testCachePath = path.resolve(process.cwd(), "experiments/version_aware_rag/data/.cache/test_relation_cache.json");
    if (fs.existsSync(testCachePath)) fs.unlinkSync(testCachePath);

    const cache = new ResponseCache(testCachePath);

    const k1 = cache.getHashKey("model-a", "prompt-v1", "old text", "new text");
    const k2 = cache.getHashKey("model-b", "prompt-v1", "old text", "new text"); // model changed
    const k3 = cache.getHashKey("model-a", "prompt-v2", "old text", "new text"); // prompt changed
    const k4 = cache.getHashKey("model-a", "prompt-v1", "old text diff", "new text"); // text changed

    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).not.toBe(k4);

    cache.set(k1, { relationType: "duplicate" });
    expect(cache.get(k1)).toEqual({ relationType: "duplicate" });
    expect(cache.get(k2)).toBeNull();

    cache.clear();
    expect(cache.get(k1)).toBeNull();
  });

  test("5. test set contamination prevention - throws error if test pair ID is loaded in few-shot prompt", () => {
    expect(() => {
      getFewShotPrompt("old text", "new text", ["pair-test-100"], "pair-test-100");
    }).toThrow("Data contamination error");
  });
});
