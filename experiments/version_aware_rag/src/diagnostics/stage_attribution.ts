import {
  CandidateStageRecord,
  FailureAttributionRecord,
  FailureCause,
  ConfidenceLevel
} from './diagnostic_types';

export function attributeFailure(
  queryId: string,
  chunkId: string,
  traceRecord: CandidateStageRecord | undefined,
  context?: {
    goldChunkExists?: boolean;
    relationInDatasetExists?: boolean;
    oraclePredictedIdentical?: boolean;
    isTestSplitPosthoc?: boolean;
  }
): FailureAttributionRecord {
  const secondaryCauses: FailureCause[] = [];
  let primaryCause: FailureCause = 'unresolved';
  let firstFailureStage = 'UNKNOWN';
  let confidence: ConfidenceLevel = 'high';
  let diagnosticNote = '';

  const traceRecordIds = traceRecord ? [`${queryId}:${chunkId}`] : [];
  const relationIds = traceRecord?.stages.relation_lookup.matched_relation_ids || [];
  const beforeRank = traceRecord?.stages.base.rank ?? null;
  const afterRank = traceRecord?.stages.final.rank ?? null;
  const filterReason = traceRecord?.stages.filter.reason ?? null;

  // 1. Judgment or alignment issue (S0)
  if (context?.goldChunkExists === false) {
    primaryCause = 'judgment_or_alignment_issue';
    firstFailureStage = 'S0';
    confidence = 'high';
    diagnosticNote = `Chunk ${chunkId} listed as gold required but does not exist in corpus.`;
    return buildRecord();
  }

  // 2. Base candidate recall failure (S1) - Required chunk NOT in S1 candidate pool
  if (!traceRecord || !traceRecord.stages.base.present) {
    if (context?.isTestSplitPosthoc) {
      primaryCause = 'unresolved';
      firstFailureStage = 'S1';
      confidence = 'medium';
      diagnosticNote = `Test split artifact lacks full S1-S9 stage trace; post-hoc observational analysis only.`;
    } else {
      primaryCause = 'base_candidate_recall_failure';
      firstFailureStage = 'S1';
      confidence = 'high';
      diagnosticNote = `Required chunk ${chunkId} did not enter the S1 BM25 candidate retrieval pool.`;
    }
    return buildRecord();
  }

  const { stages } = traceRecord;

  // 3. Normalization or score failure (S2)
  if (Number.isNaN(stages.base.score) || stages.base.score < 0) {
    primaryCause = 'normalization_or_score_failure';
    firstFailureStage = 'S2';
    confidence = 'high';
    diagnosticNote = `Base score for chunk ${chunkId} is invalid/NaN (${stages.base.score}).`;
    return buildRecord();
  }

  // 4. Relation lookup failure vs Relation coverage gap (S3)
  if (stages.relation_lookup.matched_relation_ids.length === 0) {
    if (context?.relationInDatasetExists) {
      primaryCause = 'relation_lookup_failure';
      firstFailureStage = 'S3';
      confidence = 'high';
      diagnosticNote = `Relation exists in dataset but relation graph lookup failed for chunk ${chunkId}.`;
      return buildRecord();
    } else if (!stages.filter.retained) {
      primaryCause = 'relation_coverage_gap';
      firstFailureStage = 'S3';
      secondaryCauses.push('policy_over_filtering');
      confidence = 'high';
      diagnosticNote = `No applicable oracle relation annotated for chunk ${chunkId}, causing policy filter drop.`;
      return buildRecord();
    }
  }

  // 5. Scope resolution failure (S4)
  if (!stages.scope.matched && !stages.filter.retained) {
    primaryCause = 'scope_resolution_failure';
    firstFailureStage = 'S4';
    secondaryCauses.push('policy_over_filtering');
    confidence = 'high';
    diagnosticNote = `Scope resolution failed for chunk ${chunkId}: ${stages.scope.reason}`;
    return buildRecord();
  }

  // 6. Policy over-filtering (S5)
  if (!stages.filter.retained) {
    primaryCause = 'policy_over_filtering';
    firstFailureStage = 'S5';
    confidence = 'high';
    diagnosticNote = `Required chunk ${chunkId} was filtered out by policy engine in S5: ${stages.filter.reason}`;
    return buildRecord();
  }

  // 7. Policy under-filtering (S5 - for deprecated/forbidden chunks)
  if (traceRecord.gold_status.deprecated || traceRecord.gold_status.forbidden) {
    if (stages.filter.retained && stages.final.present && (stages.final.rank ?? 99) <= 3) {
      primaryCause = 'policy_under_filtering';
      firstFailureStage = 'S5';
      confidence = 'high';
      diagnosticNote = `Stale/forbidden chunk ${chunkId} passed policy filter and reached top-3.`;
      return buildRecord();
    }
  }

  // 8. Compatibility expansion failure (S7)
  if (stages.expansion.was_added && stages.final.rank !== null && stages.final.rank > 3) {
    primaryCause = 'compatibility_expansion_failure';
    firstFailureStage = 'S7';
    confidence = 'high';
    diagnosticNote = `Chunk ${chunkId} was added by compatibility expansion but score was insufficient for top-3 (rank ${stages.final.rank}).`;
    return buildRecord();
  }

  // 9. Diversification failure (S8)
  if (stages.diversification.penalty < 1.0 && stages.final.rank !== null && stages.final.rank > 3) {
    primaryCause = 'diversification_failure';
    firstFailureStage = 'S8';
    confidence = 'high';
    diagnosticNote = `Required chunk ${chunkId} suffered diversification penalty (${stages.diversification.penalty}) and fell to rank ${stages.final.rank}.`;
    return buildRecord();
  }

  // 10. Boost misranking (S6) vs Top-K Displacement (S9)
  if (stages.filter.retained && stages.final.rank !== null && stages.final.rank > 3) {
    if (stages.boost.retain_relation_boost > 0 || stages.boost.condition_boost > 0) {
      primaryCause = 'boost_misranking';
      firstFailureStage = 'S6';
      confidence = 'high';
      diagnosticNote = `Required chunk ${chunkId} passed policy filter (base rank ${beforeRank}) but boost weight/score was insufficient to elevate or maintain in top-3 (final rank ${stages.final.rank}).`;
      return buildRecord();
    } else if (beforeRank !== null && beforeRank <= 3) {
      primaryCause = 'top_k_displacement';
      firstFailureStage = 'S9';
      confidence = 'high';
      diagnosticNote = `Required chunk ${chunkId} was in top-3 at base (rank ${beforeRank}) but displaced to rank ${stages.final.rank} in final truncation.`;
      return buildRecord();
    } else {
      primaryCause = 'boost_misranking';
      firstFailureStage = 'S6';
      confidence = 'high';
      diagnosticNote = `Required chunk ${chunkId} passed policy filter (base rank ${beforeRank}) but score was insufficient to elevate into top-3 (final rank ${stages.final.rank}).`;
      return buildRecord();
    }
  }

  // 11. Metric or scoring issue (S10)
  if (stages.final.rank !== null && stages.final.rank <= 3 && !traceRecord.gold_status.required) {
    primaryCause = 'metric_or_scoring_issue';
    firstFailureStage = 'S10';
    confidence = 'high';
    diagnosticNote = `Metric scoring calculation mismatch for chunk ${chunkId}.`;
    return buildRecord();
  }

  // 12. Unresolved fallback
  primaryCause = 'unresolved';
  firstFailureStage = 'UNRESOLVED';
  confidence = 'low';
  diagnosticNote = `Chunk ${chunkId} state cannot be conclusively attributed with current stage evidence.`;

  return buildRecord();

  function buildRecord(): FailureAttributionRecord {
    return {
      query_id: queryId,
      chunk_id: chunkId,
      primary_cause: primaryCause,
      first_failure_stage: firstFailureStage,
      secondary_causes: secondaryCauses,
      evidence: {
        trace_record_ids: traceRecordIds,
        relation_ids: relationIds,
        before_rank: beforeRank,
        after_rank: afterRank,
        filter_reason: filterReason
      },
      confidence,
      diagnostic_note: diagnosticNote
    };
  }
}
