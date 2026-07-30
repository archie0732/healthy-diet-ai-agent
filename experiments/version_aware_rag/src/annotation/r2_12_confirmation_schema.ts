import { z } from "zod";
import {
  R211EvidenceSchema,
  R211StratumSchema,
} from "./r2_11_schema";

export const R212ConfirmationAnnotationSchema = z.object({
  schema_version: z.literal("v5-r2.12-confirmation-annotation-1"),
  query_id: z.string().min(1),
  split: z.literal("development_confirmation"),
  stratum: R211StratumSchema,
  lineage_group_id: z.string().min(1),
  topic_id: z.string().min(1),
  query_text: z.string().min(10),
  predeclared_candidate_group_id: z.string().min(1),
  candidate_group_manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  required_current_evidence: z.array(R211EvidenceSchema).min(1),
  required_retained_evidence: z.array(R211EvidenceSchema),
  deprecated_evidence: z.array(R211EvidenceSchema),
  forbidden_evidence: z.array(R211EvidenceSchema).default([]),
  implicit_retained_rationale: z.string().optional(),
  annotation_rationale: z.string().min(20),
  review: z.object({
    status: z.enum(["draft", "codex_provisional", "project_owner_approved"]),
    reviewer_id: z.string().min(1),
    reviewer_type: z.string().min(1),
    independent_blinded_or_clinical_review: z.boolean(),
    retrieval_outcomes_observed: z.literal(false),
    r2_10_outcomes_used: z.literal(false),
    r2_11_outcomes_used: z.literal(false),
    r2_12_diagnostic_outcomes_used: z.literal(false),
  }),
});

export type R212ConfirmationAnnotation = z.infer<
  typeof R212ConfirmationAnnotationSchema
>;
