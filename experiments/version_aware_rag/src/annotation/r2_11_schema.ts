import { z } from "zod";

export const R211StratumSchema = z.enum([
  "conditional_merge",
  "compatible_history",
  "current_only",
  "hard_negative_current",
]);

export const R211EvidenceRoleSchema = z.enum([
  "current",
  "retained",
  "deprecated",
  "forbidden",
]);

export const R211EvidenceLocatorSchema = z
  .object({
    page_number: z.number().int().positive().optional(),
    printed_page_number: z.number().int().positive().optional(),
    chunk_id: z.string().min(1).optional(),
  })
  .refine((value) => value.page_number !== undefined || value.chunk_id !== undefined, {
    message: "Evidence must have page_number or chunk_id.",
  });

export const R211EvidenceSchema = z.object({
  item_id: z.string().min(1),
  role: R211EvidenceRoleSchema,
  document_id: z.string().min(1),
  atomic_claim_text: z.string().min(10),
  official_record_url: z.string().url(),
  official_pdf_url: z.string().url().optional(),
  local_path: z.string().min(1),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  locator: R211EvidenceLocatorSchema,
});

export const R211DevelopmentAnnotationSchema = z.object({
  schema_version: z.literal("v5-r2.11-development-annotation-1"),
  query_id: z.string().min(1),
  split: z.literal("development"),
  stratum: R211StratumSchema,
  lineage_group_id: z.string().min(1),
  topic_id: z.string().min(1),
  query_text: z.string().min(10),
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
  }),
});

export type R211Stratum = z.infer<typeof R211StratumSchema>;
export type R211Evidence = z.infer<typeof R211EvidenceSchema>;
export type R211DevelopmentAnnotation = z.infer<
  typeof R211DevelopmentAnnotationSchema
>;

