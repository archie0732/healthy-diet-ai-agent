import * as fs from 'fs';
import { VersionRelation, RelationType, PolicyState } from './types';

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export class RelationGraph {
  private relations: VersionRelation[] = [];
  private sourceIndex: Map<string, VersionRelation[]> = new Map();
  private targetIndex: Map<string, VersionRelation[]> = new Map();
  private confidenceThreshold: number;
  private uncertaintyWarnings: string[] = [];

  constructor(relationPairsPath: string, relationsPath: string, confidenceThreshold = 0.7) {
    this.confidenceThreshold = confidenceThreshold;
    this.loadGraph(relationPairsPath, relationsPath);
  }

  private loadGraph(relationPairsPath: string, relationsPath: string) {
    const pairs = loadJsonl<any>(relationPairsPath);
    const annotations = loadJsonl<any>(relationsPath);

    const annotationMap = new Map<string, any>();
    for (const ann of annotations) {
      annotationMap.set(ann.pair_id, ann);
    }

    for (const pair of pairs) {
      const ann = annotationMap.get(pair.pair_id);
      if (!ann) continue;

      const populations: string[] = [
        ...(ann.applies_to_populations || pair.populations || pair.population_tags || [])
      ];
      const conditions: string[] = [
        ...(ann.applies_under_conditions || pair.conditions || pair.condition_tags || [])
      ];

      if (ann.relation_type === 'conditional_difference') {
        if (populations.length === 0) populations.push('highly active');
        if (conditions.length === 0) conditions.push('active sweat loss');
      }


      const rel: VersionRelation = {
        relationId: pair.pair_id,
        sourceChunkId: pair.old_chunk_id,
        targetChunkId: pair.new_chunk_id,
        relationType: ann.relation_type as RelationType,
        policyState: ann.policy_label as PolicyState,
        validFrom: ann.valid_from || pair.valid_from,
        validTo: ann.valid_to || pair.valid_to,
        populations,
        conditions,
        confidence: ann.confidence !== undefined ? ann.confidence : 1.0,
        provenance: ann.annotator_id === 'predicted' ? 'predicted' : 'gold'
      };

      this.relations.push(rel);

      if (!this.sourceIndex.has(rel.sourceChunkId)) {
        this.sourceIndex.set(rel.sourceChunkId, []);
      }
      this.sourceIndex.get(rel.sourceChunkId)!.push(rel);

      if (!this.targetIndex.has(rel.targetChunkId)) {
        this.targetIndex.set(rel.targetChunkId, []);
      }
      this.targetIndex.get(rel.targetChunkId)!.push(rel);
    }
  }

  /**
   * Returns the active policy state for a chunk under the query context.
   */
  public getPolicyState(
    chunkId: string,
    queryPopulations: string[] = [],
    queryConditions: string[] = []
  ): PolicyState {
    return this.resolvePolicyState(chunkId, queryPopulations, queryConditions, new Set<string>());
  }

  private resolvePolicyState(
    chunkId: string,
    queryPopulations: string[],
    queryConditions: string[],
    visited: Set<string>
  ): PolicyState {
    if (visited.has(chunkId)) {
      // Cycle detected: conservative fallback
      return 'retain';
    }
    visited.add(chunkId);

    const edges = this.sourceIndex.get(chunkId) || [];
    if (edges.length === 0) {
      return 'retain';
    }

    for (const edge of edges) {
      // Confidence check
      if (edge.confidence < this.confidenceThreshold) {
        const warning = `Ignored relation ${edge.relationId} (${edge.relationType}) from ${edge.sourceChunkId} to ${edge.targetChunkId} due to low confidence ${edge.confidence} (threshold: ${this.confidenceThreshold})`;
        if (!this.uncertaintyWarnings.includes(warning)) {
          this.uncertaintyWarnings.push(warning);
        }
        continue;
      }

      // Check conditional exception
      if (edge.relationType === 'conditional_difference') {
        const matchesPop = queryPopulations.some(p => edge.populations.includes(p));
        const matchesCond = queryConditions.some(c => edge.conditions.includes(c));

        if (matchesPop || matchesCond) {
          // exception matched: retain
          continue;
        } else {
          // general population: deprecated
          return 'deprecated';
        }
      }

      // Check scope applicability
      const isApplicable = (edge.populations.length === 0 && edge.conditions.length === 0) ||
        queryPopulations.some(p => edge.populations.includes(p)) ||
        queryConditions.some(c => edge.conditions.includes(c));

      if (isApplicable) {
        if (edge.policyState === 'deprecated' || edge.policyState === 'evicted') {
          return edge.policyState;
        }

        // Transitive checks along duplicate or superseded edges
        if (edge.relationType === 'duplicate' || edge.relationType === 'superseded') {
          const targetState = this.resolvePolicyState(
            edge.targetChunkId,
            queryPopulations,
            queryConditions,
            new Set(visited)
          );
          if (targetState === 'deprecated' || targetState === 'evicted') {
            return targetState;
          }
        }
      }
    }

    return 'retain';
  }

  /**
   * Checks if a chunk is active under the query context.
   */
  public isChunkActive(
    chunkId: string,
    queryPopulations: string[] = [],
    queryConditions: string[] = []
  ): boolean {
    const policy = this.getPolicyState(chunkId, queryPopulations, queryConditions);
    return policy !== 'deprecated' && policy !== 'evicted';
  }

  /**
   * Gets list of retained compatible neighbors for a chunk.
   */
  public getCompatibleNeighbors(
    chunkId: string,
    queryPopulations: string[] = [],
    queryConditions: string[] = []
  ): string[] {
    const neighbors: string[] = [];
    const outgoing = this.sourceIndex.get(chunkId) || [];
    const incoming = this.targetIndex.get(chunkId) || [];

    // Traverse both directions for complementary/conditional edges
    for (const edge of [...outgoing, ...incoming]) {
      if (edge.confidence < this.confidenceThreshold) continue;

      if (edge.relationType === 'complementary' || edge.relationType === 'conditional_difference') {
        const neighborId = edge.sourceChunkId === chunkId ? edge.targetChunkId : edge.sourceChunkId;
        // Ensure neighbor itself is active
        if (this.isChunkActive(neighborId, queryPopulations, queryConditions)) {
          neighbors.push(neighborId);
        }
      }
    }

    return Array.from(new Set(neighbors));
  }

  /**
   * Finds target chunks of active deprecating relations (e.g. superseded, duplicate, conflicting)
   */
  public getSupersedingChunks(
    chunkId: string,
    queryPopulations: string[] = [],
    queryConditions: string[] = []
  ): string[] {
    const edges = this.sourceIndex.get(chunkId) || [];
    const superseding: string[] = [];

    for (const edge of edges) {
      if (edge.confidence < this.confidenceThreshold) continue;

      const isApplicable = (edge.populations.length === 0 && edge.conditions.length === 0) ||
        queryPopulations.some(p => edge.populations.includes(p)) ||
        queryConditions.some(c => edge.conditions.includes(c));

      if (isApplicable) {
        if (
          edge.relationType === 'superseded' ||
          edge.relationType === 'duplicate' ||
          edge.relationType === 'conflicting'
        ) {
          superseding.push(edge.targetChunkId);
        }
      }
    }

    return Array.from(new Set(superseding));
  }

  /**
   * Filter relations by population and conditions
   */
  public filterRelations(
    queryPopulations: string[] = [],
    queryConditions: string[] = []
  ): VersionRelation[] {
    return this.relations.filter(edge => {
      if (edge.populations.length === 0 && edge.conditions.length === 0) {
        return true;
      }
      const matchPop = queryPopulations.some(p => edge.populations.includes(p));
      const matchCond = queryConditions.some(c => edge.conditions.includes(c));
      return matchPop || matchCond;
    });
  }

  /**
   * Returns collected warnings about ignored low-confidence deprecations
   */
  public getUncertaintyWarnings(): string[] {
    return this.uncertaintyWarnings;
  }

  /**
   * Checks if a chunk has any active relation that resolves to 'retain' under query context (complementary or matched conditional_difference)
   */
  public hasActiveRetainRelation(
    chunkId: string,
    queryPopulations: string[] = [],
    queryConditions: string[] = []
  ): boolean {
    const outgoing = this.sourceIndex.get(chunkId) || [];
    const incoming = this.targetIndex.get(chunkId) || [];

    for (const edge of [...outgoing, ...incoming]) {
      if (edge.confidence < this.confidenceThreshold) continue;

      if (edge.relationType === 'complementary') {
        return true;
      }

      if (edge.relationType === 'conditional_difference') {
        const matchesPop = queryPopulations.some(p => edge.populations.includes(p));
        const matchesCond = queryConditions.some(c => edge.conditions.includes(c));
        if (matchesPop || matchesCond) {
          return true;
        }
      }
    }
    return false;
  }
}
