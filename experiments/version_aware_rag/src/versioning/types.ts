export type RelationType =
  | 'duplicate'
  | 'superseded'
  | 'conflicting'
  | 'conditional_difference'
  | 'complementary';

export type PolicyState =
  | 'retain'
  | 'down_rank'
  | 'deprecated'
  | 'evicted';

export interface VersionRelation {
  relationId: string;
  sourceChunkId: string;
  targetChunkId: string;
  relationType: RelationType;
  policyState: PolicyState;
  validFrom?: string;
  validTo?: string;
  populations: string[];
  conditions: string[];
  confidence: number;
  provenance: 'gold' | 'predicted';
}

export interface AblationConfig {
  filter_only: boolean;
  filter_retain_boost: boolean;
  filter_compatibility_expansion: boolean;
  filter_condition_matching: boolean;
  full_version_aware: boolean;
  full_version_aware_no_div: boolean;
  
  retain_relation_boost?: number;
  condition_boost?: number;
  expansion_seed_threshold?: number;
  expansion_min_base_score?: number;
  diversification_penalty?: number;
}
