import { describe, expect, test } from "bun:test";
import { getGitStatus, generateRunManifest } from "../../src/shared/manifest";
import { getFileChecksum } from "../../src/shared/hash";
import * as path from "path";
import * as fs from "fs";

describe("manifest and hash utilities", () => {
  test("getGitStatus returns commit hash and dirty status", () => {
    const git = getGitStatus();
    expect(git).toHaveProperty("commit");
    expect(git).toHaveProperty("dirty");
    expect(typeof git.commit).toBe("string");
    expect(typeof git.dirty).toBe("boolean");
  });

  test("getFileChecksum computes valid sha256 checksum and changes when file changes", () => {
    const tempFile = path.resolve(process.cwd(), "temp_hash_test.txt");
    fs.writeFileSync(tempFile, "hello world", "utf8");
    try {
      const hash1 = getFileChecksum(tempFile);
      expect(hash1).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"); // sha256 of "hello world"

      fs.writeFileSync(tempFile, "hello world updated", "utf8");
      const hash2 = getFileChecksum(tempFile);
      expect(hash2).not.toBe(hash1);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  test("generateRunManifest returns complete manifest payload", () => {
    const mockConfig = {
      experiment: { id: "test-run", seed: 42, split: "development" }
    };
    const mockChecksums = { corpus: "fake-checksum" };
    const manifest = generateRunManifest("run-12345", mockConfig, mockChecksums, 100);

    expect(manifest.run_id).toBe("run-12345");
    expect(manifest.git).toHaveProperty("commit");
    expect(manifest.config).toEqual(mockConfig);
    expect(manifest.input_checksums).toEqual(mockChecksums);
    expect(manifest.seed).toBe(42);
    expect(manifest.duration_ms).toBe(100);
  });
});
