import { describe, expect, test } from "bun:test";
import { validateAnnotations } from "../../src/annotation/validate_annotations";
import * as path from "path";
import * as fs from "fs";

describe("validateAnnotations", () => {
  test("flags overlapping required and deprecated chunks", () => {
    const tempCorpus = path.resolve(process.cwd(), "temp_corpus.jsonl");
    const tempQueries = path.resolve(process.cwd(), "temp_queries.jsonl");
    const tempJudgments = path.resolve(process.cwd(), "temp_judgments.jsonl");
    const tempPairs = path.resolve(process.cwd(), "temp_pairs.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations.jsonl");

    // Write chunk
    const chunk = { chunk_id: "c-1", document_id: "doc-1", edition: "2015-2020", text: "text" };
    fs.writeFileSync(tempCorpus, JSON.stringify(chunk) + "\n", "utf8");

    // Write query
    const query = { query_id: "q-1", question: "question", stratum: "current_only", expected_answer_scope: "current_only" };
    fs.writeFileSync(tempQueries, JSON.stringify(query) + "\n", "utf8");

    // Write overlapping judgment: c-1 is in both required and deprecated
    const judgment = {
      query_id: "q-1",
      required_chunk_ids: ["c-1"],
      compatible_chunk_ids: [],
      preferred_chunk_ids: ["c-1"],
      deprecated_chunk_ids: ["c-1"],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ["c-1"],
      rationale: "invalid overlap",
      annotator_id: "tester"
    };
    fs.writeFileSync(tempJudgments, JSON.stringify(judgment) + "\n", "utf8");
    
    // Empty relation files
    fs.writeFileSync(tempPairs, "", "utf8");
    fs.writeFileSync(tempRelations, "", "utf8");

    try {
      const errors = validateAnnotations(tempCorpus, tempQueries, tempJudgments, tempPairs, tempRelations);
      expect(errors.length).toBeGreaterThan(0);
      const overlapErr = errors.find(e => e.message.includes("marked as both required and deprecated"));
      expect(overlapErr).toBeDefined();
    } finally {
      if (fs.existsSync(tempCorpus)) fs.unlinkSync(tempCorpus);
      if (fs.existsSync(tempQueries)) fs.unlinkSync(tempQueries);
      if (fs.existsSync(tempJudgments)) fs.unlinkSync(tempJudgments);
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });

  test("flags missing chunk ID reference", () => {
    const tempCorpus = path.resolve(process.cwd(), "temp_corpus2.jsonl");
    const tempQueries = path.resolve(process.cwd(), "temp_queries2.jsonl");
    const tempJudgments = path.resolve(process.cwd(), "temp_judgments2.jsonl");
    const tempPairs = path.resolve(process.cwd(), "temp_pairs2.jsonl");
    const tempRelations = path.resolve(process.cwd(), "temp_relations2.jsonl");

    // Corpus has no chunks
    fs.writeFileSync(tempCorpus, "", "utf8");

    // Write query
    const query = { query_id: "q-1", question: "question", stratum: "current_only", expected_answer_scope: "current_only" };
    fs.writeFileSync(tempQueries, JSON.stringify(query) + "\n", "utf8");

    // Write judgment referencing non-existent c-99
    const judgment = {
      query_id: "q-1",
      required_chunk_ids: ["c-99"],
      compatible_chunk_ids: [],
      preferred_chunk_ids: [],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: [],
      rationale: "missing ref",
      annotator_id: "tester"
    };
    fs.writeFileSync(tempJudgments, JSON.stringify(judgment) + "\n", "utf8");
    fs.writeFileSync(tempPairs, "", "utf8");
    fs.writeFileSync(tempRelations, "", "utf8");

    try {
      const errors = validateAnnotations(tempCorpus, tempQueries, tempJudgments, tempPairs, tempRelations);
      expect(errors.length).toBeGreaterThan(0);
      const refErr = errors.find(e => e.message.includes("does not exist in corpus"));
      expect(refErr).toBeDefined();
    } finally {
      if (fs.existsSync(tempCorpus)) fs.unlinkSync(tempCorpus);
      if (fs.existsSync(tempQueries)) fs.unlinkSync(tempQueries);
      if (fs.existsSync(tempJudgments)) fs.unlinkSync(tempJudgments);
      if (fs.existsSync(tempPairs)) fs.unlinkSync(tempPairs);
      if (fs.existsSync(tempRelations)) fs.unlinkSync(tempRelations);
    }
  });
});
