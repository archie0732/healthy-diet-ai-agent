import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

export const ExperimentConfigSchema = z.object({
  experiment: z.object({
    id: z.string(),
    seed: z.number().int().default(42),
    split: z.enum(['development', 'validation', 'test']).default('development'),
  }),
  corpus: z.object({
    path: z.string().refine(
      (val) => fs.existsSync(val) || fs.existsSync(path.resolve(process.cwd(), val)),
      { message: 'Corpus file path does not exist' }
    ),
    checksum: z.string().nullable().optional(),
  }),
  retrieval: z.object({
    mode: z.enum(['append_only', 'recency_only', 'proposed']),
    backend: z.string().default('bm25'),
    top_k: z.number().int().positive(),
    recency_weight: z.number().nonnegative().default(0),
  }),
  version_policy: z.object({
    relation_source: z.enum(['none', 'gold', 'predicted']).default('none'),
    deprecated_filter: z.boolean().default(false),
    compatibility_expansion: z.boolean().default(false),
    confidence_threshold: z.number().nonnegative().default(0.7),
    ablation_mode: z.enum([
      'filter_only',
      'filter_retain_boost',
      'filter_compatibility_expansion',
      'filter_condition_matching',
      'full_version_aware',
      'full_version_aware_no_div'
    ]).optional(),
    retain_relation_boost: z.number().nonnegative().default(0.1),
    condition_boost: z.number().nonnegative().default(0.15),
    expansion_seed_threshold: z.number().nonnegative().default(0.05),
    expansion_min_base_score: z.number().nonnegative().default(0.01),
    diversification_penalty: z.number().nonnegative().default(0.9)
  }),
  evaluation: z.object({
    query_path: z.string().refine(
      (val) => fs.existsSync(val) || fs.existsSync(path.resolve(process.cwd(), val)),
      { message: 'Query file path does not exist' }
    ),
    judgment_path: z.string().refine(
      (val) => fs.existsSync(val) || fs.existsSync(path.resolve(process.cwd(), val)),
      { message: 'Judgment file path does not exist' }
    ),
    strata: z.boolean().default(true),
  }),
  output: z.object({
    root: z.string().default('results/v3'),
  }),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;
