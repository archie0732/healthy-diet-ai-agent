import {
  R211DevelopmentAnnotation,
  R211DevelopmentAnnotationSchema,
  R211Evidence,
  R211Stratum,
} from "./r2_11_schema";

export interface R211ValidationError {
  type: string;
  id: string;
  message: string;
}

export interface R211ValidationOptions {
  forbiddenLineageIds?: ReadonlySet<string>;
  requireFreezeReady?: boolean;
}

export const R211_MINIMUM_STRATUM_COUNTS: Record<R211Stratum, number> = {
  conditional_merge: 16,
  compatible_history: 16,
  current_only: 12,
  hard_negative_current: 12,
};

const EXPLICIT_HISTORY_CUE =
  /\b(?:19|20)\d{2}\b|\bhistorical(?:ly)?\b|\bprevious(?:ly)?\b|\bearlier\b|\bformerly\b|\bold\b|\bprior\b/i;

function evidenceKey(evidence: R211Evidence): string {
  const locator =
    evidence.locator.chunk_id ??
    `pdf-page:${evidence.locator.page_number}:${evidence.locator.printed_page_number ?? ""}`;
  return `${evidence.source_sha256}:${locator}`;
}

function pushRoleErrors(
  errors: R211ValidationError[],
  record: R211DevelopmentAnnotation,
  evidence: R211Evidence[],
  expectedRole: R211Evidence["role"],
): void {
  for (const item of evidence) {
    if (item.role !== expectedRole) {
      errors.push({
        type: "EvidenceRole",
        id: record.query_id,
        message: `Evidence "${item.item_id}" must have role "${expectedRole}", not "${item.role}".`,
      });
    }
  }
}

export function validateR211DevelopmentLedger(
  rawRecords: unknown[],
  options: R211ValidationOptions = {},
): R211ValidationError[] {
  const errors: R211ValidationError[] = [];
  const records: R211DevelopmentAnnotation[] = [];

  for (const [index, raw] of rawRecords.entries()) {
    const parsed = R211DevelopmentAnnotationSchema.safeParse(raw);
    if (!parsed.success) {
      const id =
        typeof raw === "object" && raw !== null && "query_id" in raw
          ? String((raw as { query_id: unknown }).query_id)
          : `line-${index + 1}`;
      errors.push({
        type: "Schema",
        id,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
      continue;
    }
    records.push(parsed.data);
  }

  const queryIds = new Set<string>();
  const lineageIds = new Set<string>();
  const itemIds = new Set<string>();
  const requiredEvidenceOwners = new Map<string, string>();
  const stratumCounts: Record<R211Stratum, number> = {
    conditional_merge: 0,
    compatible_history: 0,
    current_only: 0,
    hard_negative_current: 0,
  };

  for (const record of records) {
    stratumCounts[record.stratum]++;

    if (queryIds.has(record.query_id)) {
      errors.push({
        type: "DuplicateQuery",
        id: record.query_id,
        message: `Duplicate query_id "${record.query_id}".`,
      });
    }
    queryIds.add(record.query_id);

    if (lineageIds.has(record.lineage_group_id)) {
      errors.push({
        type: "DuplicateLineage",
        id: record.lineage_group_id,
        message: `Each R2.11 record must use a distinct lineage_group_id.`,
      });
    }
    lineageIds.add(record.lineage_group_id);

    if (options.forbiddenLineageIds?.has(record.lineage_group_id)) {
      errors.push({
        type: "PriorEvaluationLeakage",
        id: record.lineage_group_id,
        message: `Lineage "${record.lineage_group_id}" appears in a prior Validation or fresh-test artifact.`,
      });
    }

    const needsRetained =
      record.stratum === "conditional_merge" ||
      record.stratum === "compatible_history";
    if (needsRetained) {
      if (record.required_retained_evidence.length === 0) {
        errors.push({
          type: "StratumContract",
          id: record.query_id,
          message: `${record.stratum} requires retained evidence.`,
        });
      }
      if (!record.implicit_retained_rationale || record.implicit_retained_rationale.length < 20) {
        errors.push({
          type: "StratumContract",
          id: record.query_id,
          message: `${record.stratum} requires an implicit_retained_rationale of at least 20 characters.`,
        });
      }
      if (EXPLICIT_HISTORY_CUE.test(record.query_text)) {
        errors.push({
          type: "ImplicitIntent",
          id: record.query_id,
          message: "Implicit retained-evidence queries may not contain a year or an explicit history cue.",
        });
      }
    } else if (record.required_retained_evidence.length > 0) {
      errors.push({
        type: "StratumContract",
        id: record.query_id,
        message: `${record.stratum} may not require retained evidence.`,
      });
    }

    if (
      record.stratum === "hard_negative_current" &&
      record.deprecated_evidence.length + record.forbidden_evidence.length === 0
    ) {
      errors.push({
        type: "StratumContract",
        id: record.query_id,
        message: "hard_negative_current requires at least one deprecated or forbidden distractor.",
      });
    }

    pushRoleErrors(errors, record, record.required_current_evidence, "current");
    pushRoleErrors(errors, record, record.required_retained_evidence, "retained");
    pushRoleErrors(errors, record, record.deprecated_evidence, "deprecated");
    pushRoleErrors(errors, record, record.forbidden_evidence, "forbidden");

    const required = [
      ...record.required_current_evidence,
      ...record.required_retained_evidence,
    ];
    const unsafeKeys = new Set(
      [...record.deprecated_evidence, ...record.forbidden_evidence].map(evidenceKey),
    );
    for (const evidence of required) {
      const key = evidenceKey(evidence);
      if (unsafeKeys.has(key)) {
        errors.push({
          type: "EvidenceConflict",
          id: record.query_id,
          message: `Required evidence "${evidence.item_id}" is also deprecated or forbidden.`,
        });
      }
      const owner = requiredEvidenceOwners.get(key);
      if (owner && owner !== record.lineage_group_id) {
        errors.push({
          type: "EvidenceLeakage",
          id: record.query_id,
          message: `Required evidence is shared with lineage "${owner}".`,
        });
      } else {
        requiredEvidenceOwners.set(key, record.lineage_group_id);
      }
    }

    for (const evidence of [
      ...required,
      ...record.deprecated_evidence,
      ...record.forbidden_evidence,
    ]) {
      if (itemIds.has(evidence.item_id)) {
        errors.push({
          type: "DuplicateEvidenceId",
          id: record.query_id,
          message: `Duplicate evidence item_id "${evidence.item_id}".`,
        });
      }
      itemIds.add(evidence.item_id);
    }
  }

  if (options.requireFreezeReady) {
    for (const [stratum, minimum] of Object.entries(R211_MINIMUM_STRATUM_COUNTS)) {
      const count = stratumCounts[stratum as R211Stratum];
      if (count < minimum) {
        errors.push({
          type: "MinimumCount",
          id: stratum,
          message: `${stratum} has ${count} lineage groups; freeze requires at least ${minimum}.`,
        });
      }
    }
    const nonApproved = records.filter(
      (record) => record.review.status !== "project_owner_approved",
    );
    if (nonApproved.length > 0) {
      errors.push({
        type: "ReviewStatus",
        id: "ledger",
        message: `${nonApproved.length} records are not project_owner_approved.`,
      });
    }
  }

  return errors;
}
