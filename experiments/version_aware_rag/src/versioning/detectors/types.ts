import { CorpusChunk } from '../../corpus/types';
import { RelationType, PolicyState } from '../types';

export interface RelationDetector {
  classify(input: {
    oldChunk: CorpusChunk;
    newChunk: CorpusChunk;
  }): Promise<{
    relationType: RelationType;
    confidence: number;
    rationale: string;
    modelInfo: Record<string, string | number>;
  }>;
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
