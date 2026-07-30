import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const BASE = path.join(process.cwd(), "experiments/version_aware_rag");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

describe("V5 R2.22 GPT-5.6 blinded independent-context review", () => {
  test("keeps the packet blind and validates all 32 judgments", () => {
    const reviewDir = path.join(
      BASE,
      "data/annotations_v5/r2_22_gpt56_blind_review",
    );
    const sealedDir = path.join(
      BASE,
      "data/configs/v5_r2_22_gpt56_blind_review",
    );
    const manifest = JSON.parse(
      readFileSync(path.join(reviewDir, "MANIFEST.json"), "utf8"),
    );
    const packetText = readFileSync(
      path.join(reviewDir, "BLIND_PACKET.jsonl"),
      "utf8",
    );
    const mappingText = readFileSync(
      path.join(sealedDir, "SEALED_MAPPING.jsonl"),
      "utf8",
    );
    const reviewText = readFileSync(
      path.join(reviewDir, "GPT56_BLIND_REVIEW.jsonl"),
      "utf8",
    );
    const result = JSON.parse(
      readFileSync(path.join(reviewDir, "AGREEMENT_RESULT.json"), "utf8"),
    );
    const packet = packetText.trim().split("\n").map(JSON.parse);
    const mapping = mappingText.trim().split("\n").map(JSON.parse);
    const reviews = reviewText.trim().split("\n").map(JSON.parse);

    expect(packet).toHaveLength(32);
    expect(mapping).toHaveLength(32);
    expect(reviews).toHaveLength(32);
    expect(new Set(reviews.map((row: any) => row.blind_item_id)).size).toBe(32);
    expect(packet.every((row: any) =>
      row.stratum === undefined &&
      row.query_id === undefined &&
      row.retrieval_outcomes === undefined)).toBe(true);
    expect(mapping.filter((row: any) => row.swapped)).toHaveLength(15);
    expect(sha256(packetText)).toBe(manifest.packet_sha256);
    expect(sha256(mappingText)).toBe(manifest.sealed_mapping_sha256);
    expect(sha256(reviewText)).toBe(result.checksums.gpt56_review_sha256);
    expect(result.review_count).toBe(32);
    expect(result.schema_error_count).toBe(0);
    expect(result.answerability_counts.fully_answerable).toBe(31);
    expect(result.overall.contract_exact).toBe(19 / 32);
    expect(result.overall.contract_role_compatible).toBe(21 / 32);
    expect(result.by_stratum.current_only.contract_exact).toBe(1);
    expect(result.by_stratum.hard_negative_current.contract_exact).toBe(1);
  });
});
