import { RelationType, PolicyState } from './types';
import { PolicyDecision } from './detectors/types';
import { PolicyStore } from './policy_store';

export class PolicyEngine {
  public static resolve(
    relationType: RelationType,
    sourceRelationId: string,
    oldChunkLineage: string | null = null,
    rationale = ''
  ): PolicyDecision {
    const state = PolicyStore.getPolicyState(relationType);
    
    const appliesToPopulations: string[] = [];
    const appliesUnderConditions: string[] = [];

    if (relationType === 'conditional_difference' || oldChunkLineage === 'lineage-sodium') {
      appliesToPopulations.push('highly active');
      appliesUnderConditions.push('active sweat loss');
    }

    return {
      state,
      appliesToPopulations,
      appliesUnderConditions,
      reason: rationale || `Resolved based on relation type: ${relationType}`,
      sourceRelationId
    };
  }
}
