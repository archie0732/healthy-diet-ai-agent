import { createHash } from "crypto";
import { readFileSync } from "fs";
import {
  R211_MINIMUM_STRATUM_COUNTS,
  validateR211DevelopmentLedger,
} from "../../src/annotation/validate_r2_11_development";

function readJsonl(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON at ${path}:${index + 1}`);
      }
    });
}

function readForbiddenLineages(paths: string[]): Set<string> {
  const ids = new Set<string>();
  for (const path of paths) {
    for (const record of readJsonl(path) as Record<string, unknown>[]) {
      for (const key of ["lineage_group_id", "lineage_group", "lineage_id"]) {
        if (typeof record[key] === "string") ids.add(record[key] as string);
      }
    }
  }
  return ids;
}

const args = process.argv.slice(2);
const ledgerPath = args[0];
const exclusionPaths = args.slice(1);

if (!ledgerPath) {
  console.error(
    "Usage: bun scripts/v5/validate_r2_11_development_ledger.ts LEDGER.jsonl [PRIOR_LEDGER.jsonl ...]",
  );
  process.exit(2);
}

const ledgerBytes = readFileSync(ledgerPath);
const records = readJsonl(ledgerPath);
const forbiddenLineageIds = readForbiddenLineages(exclusionPaths);
const errors = validateR211DevelopmentLedger(records, {
  forbiddenLineageIds,
  requireFreezeReady: true,
});

const result = {
  schema_version: "v5-r2.11-development-ledger-validation-1",
  status: errors.length === 0 ? "freeze_ready" : "blocked",
  ledger_path: ledgerPath,
  ledger_sha256: createHash("sha256").update(ledgerBytes).digest("hex"),
  record_count: records.length,
  minimum_stratum_counts: R211_MINIMUM_STRATUM_COUNTS,
  exclusion_paths: exclusionPaths,
  forbidden_lineage_count: forbiddenLineageIds.size,
  errors,
};

console.log(JSON.stringify(result, null, 2));
process.exit(errors.length === 0 ? 0 : 1);

