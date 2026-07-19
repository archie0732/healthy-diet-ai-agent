import { z } from 'zod';
import { CorpusChunk } from '../../corpus/types';
import { RelationType, PolicyState } from '../types';

export const RelationDetectionSchema = z.object({
  relationType: z.enum(['duplicate', 'superseded', 'conflicting', 'conditional_difference', 'complementary']),
  confidence: z.number().min(0).max(1),
  rationale: z.string()
});

export type RelationDetectionResult = z.infer<typeof RelationDetectionSchema>;

export interface RelationDetectorOutput {
  relationType: RelationType;
  confidence: number;
  rationale: string;
  modelInfo: Record<string, string | number | boolean>;
  isError?: boolean;
  errorReason?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface RelationDetector {
  classify(input: {
    oldChunk: CorpusChunk;
    newChunk: CorpusChunk;
  }): Promise<RelationDetectorOutput>;
}

export interface PolicyDecision {
  state: PolicyState;
  appliesToPopulations: string[];
  appliesUnderConditions: string[];
  validFrom?: string;
  validTo?: string;
  reason: string;
  sourceRelationId: string;
}

