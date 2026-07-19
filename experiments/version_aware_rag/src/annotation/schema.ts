import { z } from 'zod';

export const EvaluationQuerySchema = z.object({
  query_id: z.string(),
  question: z.string(),
  stratum: z.enum(['current_only', 'compatible_history', 'conditional_merge', 'newer_irrelevant']),
  expected_answer_scope: z.string(),
  target_population: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  author_notes: z.string().optional()
});

export const QueryJudgmentSchema = z.object({
  query_id: z.string(),
  required_chunk_ids: z.array(z.string()),
  compatible_chunk_ids: z.array(z.string()),
  preferred_chunk_ids: z.array(z.string()),
  deprecated_chunk_ids: z.array(z.string()),
  forbidden_chunk_ids: z.array(z.string()),
  citation_safe_chunk_ids: z.array(z.string()),
  rationale: z.string().default(''),
  annotator_id: z.string()
});

export const RelationPairSchema = z.object({
  pair_id: z.string(),
  old_chunk_id: z.string(),
  new_chunk_id: z.string(),
  lineage_id: z.string()
});

export const RelationAnnotationSchema = z.object({
  pair_id: z.string(),
  relation_type: z.enum(['duplicate', 'superseded', 'conflicting', 'conditional_difference', 'complementary']),
  policy_label: z.enum(['retain', 'down_rank', 'deprecated', 'evicted']),
  condition_difference: z.string().optional(),
  rationale: z.string().default(''),
  annotator_id: z.string()
});

export type EvaluationQuery = z.infer<typeof EvaluationQuerySchema>;
export type QueryJudgment = z.infer<typeof QueryJudgmentSchema>;
export type RelationPair = z.infer<typeof RelationPairSchema>;
export type RelationAnnotation = z.infer<typeof RelationAnnotationSchema>;
