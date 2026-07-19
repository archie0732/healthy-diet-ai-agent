import { describe, expect, test } from "bun:test";
import { auditCorpus } from "../../src/corpus/audit_corpus";
import * as path from "path";
import * as fs from "fs";

describe("auditCorpus", () => {
  test("generates stats and finds exact duplicates", () => {
    const tempFile = path.resolve(process.cwd(), "temp_mock_chunks.jsonl");
    const chunk1 = {
      chunk_id: "doc-page-1-pass-0-hash",
      document_id: "doc-2015",
      edition: "2015-2020",
      published_at: "2015-12-01",
      source_url: "http://example.com",
      source_checksum: "checksum",
      page_number: 1,
      passage_index: 0,
      char_start: 0,
      char_end: 20,
      text: "hello world duplicate",
      topic_ids: ["lineage-dairy"],
      population_tags: ["general"],
      condition_tags: [],
      numeric_claims: [],
      lineage_id: "lineage-dairy"
    };

    const chunk2 = { ...chunk1, chunk_id: "doc-page-1-pass-1-hash" }; // exact duplicate text
    const chunk3 = { ...chunk1, chunk_id: "doc-page-2-pass-0-hash", page_number: 2, text: "different content here" };

    fs.writeFileSync(tempFile, [chunk1, chunk2, chunk3].map(c => JSON.stringify(c)).join("\n"), "utf8");
    
    try {
      const report = auditCorpus(tempFile);
      expect(report.total_chunks).toBe(3);
      expect(report.exact_duplicates).toBe(1);
      expect(report.null_lineage_rate).toBe(0);
      expect(report.version_distribution["2015-2020"]).toBe(3);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
