export interface FeatureActivationConfig {
  enableFilter: boolean;
  enableRetainBoost: boolean;
  enableConditionBoost: boolean;
  enableCompatibilityExpansion: boolean;
  enableDiversification: boolean;
  enableRecencyComponent: boolean;
  /** Development-only focused policy rule for explicit historical requests. */
  enableHistoricalIntentBoost?: boolean;
  /** Oracle-only relation expansion for explicit historical requests. */
  enableHistoricalLineageExpansion?: boolean;
  /** Document-context recovery for an explicit historical request. */
  enableHistoricalAdjacentExpansion?: boolean;
}

export interface FeatureExecutionMetrics {
  filter_decisions: number;
  retain_boosts_applied: number;
  condition_boosts_applied: number;
  expansion_attempts: number;
  expansion_acceptances: number;
  diversification_penalties_applied: number;
  recency_scores_applied: number;
}

export interface PolicyWeightConfig {
  w_base: number;
  w_recency: number;
  w_retain: number;
  w_condition: number;
  w_expansion: number;
  w_stale: number;
  w_duplicate: number;

  expansion_seed_threshold?: number;
  expansion_min_base_score?: number;
  diversification_penalty?: number;
}

export interface NormalizedScoreComponents {
  raw_base_score: number;
  normalized_base_score: number;
  recency_score: number;
  retain_relation_score: number;
  condition_match_score: number;
  compatibility_score: number;
  stale_penalty: number;
  diversification_penalty: number;
  final_score: number;
  rank_before_policy: number;
  rank_after_policy: number;
}

export type TemporalIntent =
  | { type: 'current' }
  | { type: 'historical'; targetYear: number }
  | { type: 'comparison'; years: number[] }
  | { type: 'unspecified' };

export interface ScopeDecisionEvent {
  query_id: string;
  chunk_id: string;
  temporal_applicable: boolean;
  population_applicable: boolean;
  condition_applicable: boolean;
  policy_state: string;
  scope_decision: 'retain' | 'deprecated' | 'evicted' | 'historical_retain';
  scope_decision_reason: string;
}

export interface ExpansionEvent {
  query_id: string;
  seed_chunk_id: string;
  expanded_chunk_id: string;
  relation_id: string;
  relation_type: string;
  candidate_existed_before_expansion: boolean;
  score_before_expansion: number;
  compatibility_score_added: number;
  score_after_expansion: number;
  rank_before_expansion: number;
  rank_after_expansion: number;
  accepted: boolean;
  rejection_reason: string | null;
}

export interface CandidatePoolAssignment {
  query_id: string;
  split: string;
  mode: string;
  pool_size: number;
  ordered_chunk_ids: string[];
  candidate_pool_hash: string;
}

export interface TracedCandidateEvent {
  chunkId: string;
  baseScore: number;
  baseRank: number | null;
  matchedRelationIds: string[];
  relationTypes: string[];
  policyLabels: string[];
  scopeMatched: boolean;
  scopeReason: string;
  retainedAfterFilter: boolean;
  filterReason: string;
  retainRelationBoost: number;
  conditionBoost: number;
  wasExpansionSeed: boolean;
  wasExpansionAdded: boolean;
  expansionParentId: string | null;
  expansionRelationId: string | null;
  expansionBeforeScore: number | null;
  expansionAfterScore: number | null;
  diversificationPenalty: number;
  finalScore: number;
  finalRank: number | null;
}

export interface RetrievalContext {
  queryId: string;
  question: string;
  targetPopulation: string[];
  conditions: string[];
  temporalIntent?: TemporalIntent;
  split?: string;
  onTraceEvent?: (event: TracedCandidateEvent) => void;
  onScopeEvent?: (event: ScopeDecisionEvent) => void;
  onExpansionEvent?: (event: ExpansionEvent) => void;
}

export interface SearchResult {
  chunkId: string;
  baseScore: number;
  finalScore: number;
  rank: number;
  scoreComponents: Record<string, number>;
  relationReason?: string;
  warnings?: string[];
  normalizedScoreComponents?: NormalizedScoreComponents;
}

export interface Retriever {
  retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]>;
}
