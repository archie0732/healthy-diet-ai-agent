import {
  R216ConfirmationAnnotation,
  R216ConfirmationAnnotationSchema,
} from "./r2_16_confirmation_schema";

export const R216_CONFIRMATION_MINIMUM_COUNTS = {
  conditional_merge: 10,
  compatible_history: 10,
  current_only: 6,
  hard_negative_current: 6,
} as const;

export interface R216ConfirmationValidationOptions {
  forbiddenLineageIds?: ReadonlySet<string>;
  forbiddenRequiredEvidenceKeys?: ReadonlySet<string>;
  candidateGroups?: ReadonlyMap<string, ReadonlySet<string>>;
  candidateGroupManifestSha256?: string;
  requireFreezeReady?: boolean;
}

export interface R216ConfirmationValidationError {
  type: string;
  id: string;
  message: string;
}

const EXPLICIT_HISTORY_CUE =
  /\b(?:19|20)\d{2}\b|\bhistorical(?:ly)?\b|\bprevious(?:ly)?\b|\bearlier\b|\bformerly\b|\bold\b|\bprior\b/i;

export function r216EvidenceKey(evidence: {
  source_sha256: string;
  locator: { chunk_id?: string; page_number?: number; printed_page_number?: number };
}): string {
  const locator =
    evidence.locator.chunk_id ??
    `pdf-page:${evidence.locator.page_number}:${evidence.locator.printed_page_number ?? ""}`;
  return `${evidence.source_sha256}:${locator}`;
}

export function validateR216ConfirmationLedger(
  rawRecords: unknown[],
  options: R216ConfirmationValidationOptions = {},
): R216ConfirmationValidationError[] {
  const errors: R216ConfirmationValidationError[] = [];
  const records: R216ConfirmationAnnotation[] = [];
  for (const [index, raw] of rawRecords.entries()) {
    const parsed = R216ConfirmationAnnotationSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        type: "Schema",
        id:
          typeof raw === "object" && raw !== null && "query_id" in raw
            ? String(raw.query_id)
            : `line-${index + 1}`,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
    } else {
      records.push(parsed.data);
    }
  }

  const queryIds = new Set<string>();
  const lineageIds = new Set<string>();
  const requiredOwners = new Map<string, string>();
  const counts: Record<keyof typeof R216_CONFIRMATION_MINIMUM_COUNTS, number> = {
    conditional_merge: 0,
    compatible_history: 0,
    current_only: 0,
    hard_negative_current: 0,
  };
  for (const record of records) {
    counts[record.stratum]++;
    if (queryIds.has(record.query_id)) {
      errors.push({ type: "DuplicateQuery", id: record.query_id, message: "query_id must be unique." });
    }
    queryIds.add(record.query_id);
    if (lineageIds.has(record.lineage_group_id)) {
      errors.push({ type: "DuplicateLineage", id: record.lineage_group_id, message: "lineage_group_id must be unique." });
    }
    lineageIds.add(record.lineage_group_id);
    if (options.forbiddenLineageIds?.has(record.lineage_group_id)) {
      errors.push({
        type: "PriorEvaluationLeakage",
        id: record.lineage_group_id,
        message: "Lineage appears in a prior Development evaluation, Validation, or fresh test.",
      });
    }
    if (
      options.candidateGroupManifestSha256 &&
      record.candidate_group_manifest_sha256 !== options.candidateGroupManifestSha256
    ) {
      errors.push({
        type: "CandidateGroupManifest",
        id: record.query_id,
        message: "Annotation is not bound to the frozen predeclared group manifest.",
      });
    }
    const implicit =
      record.stratum === "conditional_merge" ||
      record.stratum === "compatible_history";
    if (
      implicit &&
      (record.required_retained_evidence.length === 0 ||
        !record.implicit_retained_rationale ||
        record.implicit_retained_rationale.length < 20)
    ) {
      errors.push({
        type: "StratumContract",
        id: record.query_id,
        message: "Implicit stratum requires retained evidence and rationale.",
      });
    }
    if (implicit && EXPLICIT_HISTORY_CUE.test(record.query_text)) {
      errors.push({
        type: "ImplicitIntent",
        id: record.query_id,
        message: "Implicit query contains a year or explicit history cue.",
      });
    }
    if (!implicit && record.required_retained_evidence.length > 0) {
      errors.push({
        type: "StratumContract",
        id: record.query_id,
        message: "Non-implicit stratum may not require retained evidence.",
      });
    }
    if (
      record.stratum === "hard_negative_current" &&
      record.deprecated_evidence.length + record.forbidden_evidence.length === 0
    ) {
      errors.push({
        type: "StratumContract",
        id: record.query_id,
        message: "Hard negative requires a deprecated or forbidden distractor.",
      });
    }
    const fields = [
      ["required_current_evidence", "current"],
      ["required_retained_evidence", "retained"],
      ["deprecated_evidence", "deprecated"],
      ["forbidden_evidence", "forbidden"],
    ] as const;
    for (const [field, role] of fields) {
      for (const evidence of record[field]) {
        if (evidence.role !== role) {
          errors.push({
            type: "EvidenceRole",
            id: record.query_id,
            message: `${evidence.item_id} must have role ${role}.`,
          });
        }
      }
    }
    const required = [
      ...record.required_current_evidence,
      ...record.required_retained_evidence,
    ];
    const unsafe = new Set(
      [...record.deprecated_evidence, ...record.forbidden_evidence].map(r216EvidenceKey),
    );
    const declaredGroup = options.candidateGroups?.get(
      record.predeclared_candidate_group_id,
    );
    if (options.candidateGroups && !declaredGroup) {
      errors.push({
        type: "CandidateGroup",
        id: record.query_id,
        message: "Predeclared candidate group does not exist.",
      });
    }
    for (const evidence of required) {
      const key = r216EvidenceKey(evidence);
      if (unsafe.has(key)) {
        errors.push({
          type: "EvidenceConflict",
          id: record.query_id,
          message: "Required evidence is also unsafe.",
        });
      }
      if (options.forbiddenRequiredEvidenceKeys?.has(key)) {
        errors.push({
          type: "PriorEvidenceLeakage",
          id: record.query_id,
          message: "Required evidence was used in a prior evaluation cycle.",
        });
      }
      const owner = requiredOwners.get(key);
      if (owner && owner !== record.lineage_group_id) {
        errors.push({
          type: "EvidenceLeakage",
          id: record.query_id,
          message: `Required evidence is shared with lineage ${owner}.`,
        });
      }
      requiredOwners.set(key, record.lineage_group_id);
      if (declaredGroup && !declaredGroup.has(key)) {
        errors.push({
          type: "CandidateGroup",
          id: record.query_id,
          message: "Required evidence is absent from its predeclared group.",
        });
      }
    }
  }

  if (options.requireFreezeReady) {
    for (const [stratum, minimum] of Object.entries(R216_CONFIRMATION_MINIMUM_COUNTS)) {
      if (counts[stratum as keyof typeof counts] < minimum) {
        errors.push({
          type: "MinimumCount",
          id: stratum,
          message: `${stratum} requires at least ${minimum} records.`,
        });
      }
    }
    const unapproved = records.filter(
      (record) => record.review.status !== "project_owner_approved",
    ).length;
    if (unapproved > 0) {
      errors.push({
        type: "ReviewStatus",
        id: "ledger",
        message: `${unapproved} records are not project_owner_approved.`,
      });
    }
  }
  return errors;
}

