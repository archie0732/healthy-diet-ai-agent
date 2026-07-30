export type FailureCause =
  | 'judgment_or_alignment_issue'
  | 'base_candidate_recall_failure'
  | 'normalization_or_score_failure'
  | 'relation_coverage_gap'
  | 'relation_lookup_failure'
  | 'scope_resolution_failure'
  | 'policy_over_filtering'
  | 'policy_under_filtering'
  | 'boost_misranking'
  | 'compatibility_expansion_failure'
  | 'diversification_failure'
  | 'top_k_displacement'
  | 'metric_or_scoring_issue'
  | 'unresolved';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type QueryClassification = 'oracle_win' | 'recency_win' | 'tie_success' | 'tie_failure';

export interface ReferenceRunInfo {
  run_id: string;
  manifest_checksum: string;
}

export interface BaselineReferenceSnapshot {
  dataset_version: string;
  analysis_started_at: string;
  runs: {
    append_only: ReferenceRunInfo;
    recency_only: ReferenceRunInfo;
    oracle_version_aware: ReferenceRunInfo;
    predicted_version_aware: ReferenceRunInfo;
  };
  input_checksums: Record<string, string>;
  artifacts_are_read_only: boolean;
}

export interface PairedQueryResult {
  retrieved_chunk_ids: string[];
  scores: number[];
  recall_at_3: number;
  ndcg_at_3: number;
  stale_hit: boolean;
}

export interface PairedQueryComparisonRecord {
  query_id: string;
  stratum: string;
  question: string;
  required_chunk_ids: string[];
  preferred_chunk_ids: string[];
  deprecated_chunk_ids: string[];
  forbidden_chunk_ids: string[];
  recency: PairedQueryResult;
  oracle: PairedQueryResult;
  difference: {
    absolute_missing_required_chunks: string[];
    lost_required_chunks: string[];
    gained_required_chunks: string[];
    recall_delta: number;
    ndcg_delta: number;
    stale_delta: number;
  };
  requires_stage_trace: boolean;
  classification: QueryClassification;
}

export interface CandidateGoldStatus {
  required: boolean;
  preferred: boolean;
  deprecated: boolean;
  forbidden: boolean;
  citation_safe: boolean;
}

export interface CandidateStageRecord {
  query_id: string;
  split: string;
  candidate_pool_id: string;
  chunk_id: string;
  gold_status: CandidateGoldStatus;
  stages: {
    base: {
      present: boolean;
      rank: number | null;
      score: number;
    };
    relation_lookup: {
      matched_relation_ids: string[];
      relation_types: string[];
      policy_labels: string[];
    };
    scope: {
      query_population: string[];
      query_conditions: string[];
      relation_populations: string[];
      relation_conditions: string[];
      matched: boolean;
      reason: string;
    };
    filter: {
      retained: boolean;
      reason: string;
    };
    boost: {
      retain_relation_boost: number;
      condition_boost: number;
    };
    expansion: {
      was_seed: boolean;
      was_added: boolean;
      parent_chunk_id: string | null;
      reason: string | null;
    };
    diversification: {
      penalty: number;
      reason: string | null;
    };
    final: {
      present: boolean;
      rank: number | null;
      score: number;
    };
  };
}

export interface FailureAttributionRecord {
  query_id: string;
  chunk_id: string;
  primary_cause: FailureCause;
  first_failure_stage: string;
  secondary_causes: FailureCause[];
  evidence: {
    trace_record_ids: string[];
    relation_ids: string[];
    before_rank: number | null;
    after_rank: number | null;
    filter_reason: string | null;
  };
  confidence: ConfidenceLevel;
  diagnostic_note: string;
}

export interface FeatureActivationConfig {
  filter: boolean;
  retain_boost: boolean;
  condition_boost: boolean;
  expansion: boolean;
  diversification: boolean;
  recency_boost: boolean;
  recency_lambda?: number;
}

export interface CounterfactualModeResult {
  mode: string;
  recall_at_3: number;
  ndcg_at_3: number;
  stale_rate: number;
  unsafe_count: number;
  feature_activation: FeatureActivationConfig;
  candidate_pool_hash_sample?: string;
}

export interface SensitivityResult {
  pool_n: string;
  recency_recall_at_3: number;
  oracle_recall_at_3: number;
  delta_recall_at_3: number;
  oracle_stale_rate: number;
  recency_stale_rate: number;
}

export interface StageFunnelStep {
  stage_name: string;
  count: number;
  percentage: number;
  lost_count: number;
  affected_query_ids: string[];
  lost_query_chunk_ids: string[];
  strata_counts: Record<string, number>;
}

export interface StageFunnelReport {
  split: string;
  required_total: number;
  steps: StageFunnelStep[];
}

export interface OracleDiagnosisSummary {
  headline: string;
  root_cause_table: Array<{
    primary_cause: FailureCause;
    affected_queries: number;
    lost_required_chunks: number;
    metric_impact: string;
    confidence: ConfidenceLevel;
    query_ids: string[];
  }>;
  stage_funnels: Record<string, StageFunnelReport>;
  counterfactual_table: CounterfactualModeResult[];
  sensitivity_table: SensitivityResult[];
  repair_priorities: Array<{
    priority: number;
    action: string;
    rationale: string;
    expected_impact: string;
  }>;
  integrity_evidence: {
    v3_checksums_verified: boolean;
    test_not_rerun: boolean;
    configs_unmodified: boolean;
    diagnostics_off_unchanged: boolean;
    tests_passed: boolean;
    artifact_checksums: Record<string, string>;
    artifact_paths: string[];
  };
}
