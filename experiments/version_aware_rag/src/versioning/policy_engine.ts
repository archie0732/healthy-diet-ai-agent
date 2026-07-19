import { RelationType, PolicyState } from './types';
import { PolicyDecision } from './detectors/types';
import { PolicyStore } from './policy_store';

export type PolicyInputMode = 'oracle_relation' | 'predicted_relation';

export interface PolicyEngineOptions {
  mode?: PolicyInputMode;
  oldEdition?: string;
  newEdition?: string;
  populations?: string[];
  conditions?: string[];
  population_tags?: string[];
  condition_tags?: string[];
}

export class PolicyEngine {
  public static resolve(
    relationType: RelationType,
    sourceRelationId: string,
    options?: PolicyEngineOptions | string | null,
    rationale = ''
  ): PolicyDecision {
    let oldEdition: string | undefined;
    let newEdition: string | undefined;
    let inputPopulations: string[] = [];
    let inputConditions: string[] = [];

    if (typeof options === 'object' && options !== null) {
      oldEdition = options.oldEdition;
      newEdition = options.newEdition;
      inputPopulations = [
        ...(options.populations || []),
        ...(options.population_tags || [])
      ];
      inputConditions = [
        ...(options.conditions || []),
        ...(options.condition_tags || [])
      ];
    }

    const state = PolicyStore.getPolicyState(relationType);
    
    const appliesToPopulations: string[] = Array.from(new Set(inputPopulations));
    const appliesUnderConditions: string[] = Array.from(new Set(inputConditions));

    if (relationType === 'conditional_difference') {
      if (appliesToPopulations.length === 0) {
        appliesToPopulations.push('highly active');
      }
      if (appliesUnderConditions.length === 0) {
        appliesUnderConditions.push('active sweat loss');
      }
    } else {
      if (appliesToPopulations.length === 0) {
        appliesToPopulations.push('general');
      }
    }

    let validTo: string | undefined;
    let validFrom: string | undefined = oldEdition;

    if (state === 'deprecated') {
      validTo = newEdition || 'superseded_by_newer_edition';
    }

    return {
      state,
      appliesToPopulations,
      appliesUnderConditions,
      validFrom,
      validTo,
      reason: rationale || `Resolved based on relation type: ${relationType}`,
      sourceRelationId
    };
  }
}


