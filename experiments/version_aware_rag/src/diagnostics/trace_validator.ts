import { CandidateStageRecord } from './diagnostic_types';

export interface ValidationViolation {
  query_id: string;
  chunk_id: string;
  rule: string;
  message: string;
}

export function validateCandidateTrace(record: CandidateStageRecord): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const { stages, query_id, chunk_id } = record;

  // Invariant 1: Filtered candidate must not appear in final output
  if (!stages.filter.retained && stages.final.present) {
    violations.push({
      query_id,
      chunk_id,
      rule: 'FILTERED_CANDIDATE_IN_FINAL_OUTPUT',
      message: `Candidate ${chunk_id} was filtered out in S5 (retained=false) but present in final output.`
    });
  }

  // Invariant 2: Expanded candidate must specify a valid parent_chunk_id
  if (stages.expansion.was_added && !stages.expansion.parent_chunk_id) {
    violations.push({
      query_id,
      chunk_id,
      rule: 'EXPANDED_CANDIDATE_MISSING_PARENT',
      message: `Candidate ${chunk_id} was marked as expanded (was_added=true) but lacks parent_chunk_id.`
    });
  }

  // Invariant 3: Score components sum validation
  const baseScore = stages.base.score;
  const retainBoost = stages.boost.retain_relation_boost;
  const conditionBoost = stages.boost.condition_boost;
  const divPenalty = stages.diversification.penalty;
  
  if (stages.final.present) {
    const calculatedScore = (baseScore + retainBoost + conditionBoost) * divPenalty;
    const diff = Math.abs(stages.final.score - calculatedScore);
    if (diff > 1e-4) {
      violations.push({
        query_id,
        chunk_id,
        rule: 'SCORE_COMPONENTS_MISMATCH',
        message: `Final score (${stages.final.score}) does not match component calculation (${calculatedScore.toFixed(4)}).`
      });
    }
  }

  return violations;
}

export function validateMonotonicFunnel(steps: Array<{ count: number; stage_name: string }>): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    if (curr.count > prev.count) {
      violations.push({
        query_id: 'GLOBAL',
        chunk_id: 'FUNNEL',
        rule: 'NON_MONOTONIC_FUNNEL',
        message: `Funnel count increased from stage "${prev.stage_name}" (${prev.count}) to "${curr.stage_name}" (${curr.count}).`
      });
    }
  }
  return violations;
}
