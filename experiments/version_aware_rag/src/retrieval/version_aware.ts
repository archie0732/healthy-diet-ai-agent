import { Retriever, RetrievalContext, SearchResult, FeatureActivationConfig, FeatureExecutionMetrics, PolicyWeightConfig, NormalizedScoreComponents, ScopeDecisionEvent } from './types';
import { RelationGraph } from '../versioning/relation_graph';
import { AblationConfig } from '../versioning/types';
import { CorpusChunk } from '../corpus/types';
import { expandCompatibleChunks } from './compatibility_expansion';
import { diversifyResults } from './result_diversification';
import { parseTemporalIntent } from '../versioning/temporal_intent_parser';

export function translateLegacyAblation(ablation: any): FeatureActivationConfig {
  if (ablation && 'enableFilter' in ablation) {
    return ablation as FeatureActivationConfig;
  }
  return {
    enableFilter: !!(
      ablation.filter_only ||
      ablation.filter_retain_boost ||
      ablation.filter_compatibility_expansion ||
      ablation.filter_condition_matching ||
      ablation.full_version_aware ||
      ablation.full_version_aware_no_div
    ),
    enableRetainBoost: !!(
      ablation.filter_retain_boost ||
      ablation.full_version_aware ||
      ablation.full_version_aware_no_div
    ),
    enableConditionBoost: !!(
      ablation.filter_condition_matching ||
      ablation.full_version_aware ||
      ablation.full_version_aware_no_div
    ),
    enableCompatibilityExpansion: !!(
      ablation.filter_compatibility_expansion ||
      ablation.full_version_aware ||
      ablation.full_version_aware_no_div
    ),
    enableDiversification: !!(
      ablation.full_version_aware && !ablation.full_version_aware_no_div
    ),
    enableRecencyComponent: false
  };
}

export const DEFAULT_POLICY_WEIGHTS: PolicyWeightConfig = {
  w_base: 0.5,
  w_recency: 0.05,
  w_retain: 0.2,
  w_condition: 0.15,
  w_expansion: 0.1,
  w_stale: 0.5,
  w_duplicate: 0.2,
  expansion_seed_threshold: 0.05,
  expansion_min_base_score: 0.01,
  diversification_penalty: 0.2
};

export class VersionAwareRetriever implements Retriever {
  private baseRetriever: Retriever;
  private chunksMap: Map<string, CorpusChunk> = new Map();
  private graph: RelationGraph;
  private featureConfig: FeatureActivationConfig;
  private weights: PolicyWeightConfig;

  private lastExecutionMetrics: FeatureExecutionMetrics = {
    filter_decisions: 0,
    retain_boosts_applied: 0,
    condition_boosts_applied: 0,
    expansion_attempts: 0,
    expansion_acceptances: 0,
    diversification_penalties_applied: 0,
    recency_scores_applied: 0
  };

  constructor(
    baseRetriever: Retriever,
    chunks: CorpusChunk[],
    graph: RelationGraph,
    ablationOrConfig: AblationConfig | FeatureActivationConfig,
    weights: Partial<PolicyWeightConfig> = {}
  ) {
    this.baseRetriever = baseRetriever;
    this.graph = graph;
    this.featureConfig = translateLegacyAblation(ablationOrConfig);
    this.weights = { ...DEFAULT_POLICY_WEIGHTS, ...weights };
    for (const c of chunks) {
      this.chunksMap.set(c.chunk_id, c);
    }
  }

  public getFeatureConfig(): FeatureActivationConfig {
    return this.featureConfig;
  }

  public getLastExecutionMetrics(): FeatureExecutionMetrics {
    return { ...this.lastExecutionMetrics };
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    this.lastExecutionMetrics = {
      filter_decisions: 0,
      retain_boosts_applied: 0,
      condition_boosts_applied: 0,
      expansion_attempts: 0,
      expansion_acceptances: 0,
      diversification_penalties_applied: 0,
      recency_scores_applied: 0
    };

    const temporalIntent = query.temporalIntent || parseTemporalIntent(query.question);

    // 1. Base retrieval (fixed candidate pool)
    const basePoolSize = Math.max(topK * 4, 20);
    const candidates = await this.baseRetriever.retrieve(query, basePoolSize);

    if (candidates.length === 0) return [];

    // Min-Max normalize base scores
    const rawScores = candidates.map(c => c.baseScore);
    const minRaw = Math.min(...rawScores);
    const maxRaw = Math.max(...rawScores);
    const scoreRange = maxRaw > minRaw ? maxRaw - minRaw : 1.0;

    const baseScoresMap = new Map<string, number>();
    const normalizedBaseMap = new Map<string, number>();

    candidates.forEach((c, idx) => {
      baseScoresMap.set(c.chunkId, c.baseScore);
      const normBase = maxRaw > minRaw ? (c.baseScore - minRaw) / scoreRange : 1.0;
      normalizedBaseMap.set(c.chunkId, normBase);
    });

    let processed: Array<SearchResult & { normComponents: NormalizedScoreComponents }> = [];

    // 2. Compute initial score components & scope resolution
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const chunkMeta = this.chunksMap.get(c.chunkId);
      const normBase = normalizedBaseMap.get(c.chunkId) ?? 1.0;

      const metadataYear = Number.parseInt(chunkMeta?.published_at?.slice(0, 4) || '', 10);
      const pubYear = chunkMeta?.published_year ?? (Number.isFinite(metadataYear) ? metadataYear : 2015);
      let recencyScore = 0;
      if (this.featureConfig.enableRecencyComponent) {
        recencyScore = Math.max(0, Math.min(1, (pubYear - 2015) / 10.0));
        if (recencyScore > 0) this.lastExecutionMetrics.recency_scores_applied++;
      }

      // Check scope applicability dimensions
      const isHistoricalQuery = temporalIntent.type === 'historical';
      const targetYear = temporalIntent.type === 'historical' ? temporalIntent.targetYear : undefined;

      const isTemporalApplicable = isHistoricalQuery
        ? pubYear === targetYear
        : true;

      const popTags = chunkMeta?.population_tags || [];
      const condTags = chunkMeta?.condition_tags || [];

      const isPopApplicable = query.targetPopulation.length === 0 ||
        popTags.length === 0 ||
        query.targetPopulation.some(p => popTags.includes(p));

      const isCondApplicable = query.conditions.length === 0 ||
        condTags.length === 0 ||
        query.conditions.some(con => condTags.includes(con));

      const rawPolicyState = this.graph.getPolicyState(c.chunkId, query.targetPopulation, query.conditions);

      let scopeDecision: 'retain' | 'deprecated' | 'evicted' | 'historical_retain' = 'retain';
      let scopeReason = 'Valid scope';

      if (isHistoricalQuery && pubYear === targetYear) {
        scopeDecision = 'historical_retain';
        scopeReason = `Explicit historical request for ${targetYear}`;
      } else if (rawPolicyState === 'deprecated' || rawPolicyState === 'evicted') {
        scopeDecision = rawPolicyState;
        scopeReason = `Deprecation policy active (${rawPolicyState})`;
      } else if (!isPopApplicable || !isCondApplicable) {
        scopeDecision = 'evicted';
        scopeReason = 'Mismatching population or condition tags';
      }

      if (query.onScopeEvent) {
        query.onScopeEvent({
          query_id: query.queryId,
          chunk_id: c.chunkId,
          temporal_applicable: isTemporalApplicable,
          population_applicable: isPopApplicable,
          condition_applicable: isCondApplicable,
          policy_state: rawPolicyState,
          scope_decision: scopeDecision,
          scope_decision_reason: scopeReason
        });
      }

      // Policy filter check
      if (this.featureConfig.enableFilter) {
        this.lastExecutionMetrics.filter_decisions++;
        if (scopeDecision === 'deprecated' || scopeDecision === 'evicted') {
          continue; // Filter out
        }
      }

      // Retain relation boost
      let retainScore = 0;
      if (this.featureConfig.enableRetainBoost) {
        if (this.graph.hasActiveRetainRelation(c.chunkId, query.targetPopulation, query.conditions)) {
          retainScore = 1.0;
          this.lastExecutionMetrics.retain_boosts_applied++;
        }
        // An explicit historical year is a query constraint, not an oracle
        // label. Preserve matching-year evidence even when a newer passage has
        // stronger lexical overlap.
        if (this.featureConfig.enableHistoricalIntentBoost && isHistoricalQuery && pubYear === targetYear) {
          // This bounded value is intentionally higher than an ordinary
          // relation-retention signal: explicit year is a hard query scope.
          retainScore = 3.0;
          this.lastExecutionMetrics.retain_boosts_applied++;
        }
      }

      // Condition boost
      let conditionScore = 0;
      if (this.featureConfig.enableConditionBoost) {
        const matchPop = query.targetPopulation.some(p => popTags.includes(p));
        const matchCond = query.conditions.some(con => condTags.includes(con));
        if (matchPop || matchCond) {
          conditionScore = 1.0;
          this.lastExecutionMetrics.condition_boosts_applied++;
        }
      }

      const stalePenalty = (!this.featureConfig.enableFilter && (scopeDecision === 'deprecated' || scopeDecision === 'evicted')) ? 1.0 : 0.0;

      const normComp: NormalizedScoreComponents = {
        raw_base_score: c.baseScore,
        normalized_base_score: normBase,
        recency_score: recencyScore,
        retain_relation_score: retainScore,
        condition_match_score: conditionScore,
        compatibility_score: 0.0,
        stale_penalty: stalePenalty,
        diversification_penalty: 0.0,
        final_score: 0.0,
        rank_before_policy: i + 1,
        rank_after_policy: 0
      };

      normComp.final_score =
        this.weights.w_base * normComp.normalized_base_score +
        this.weights.w_recency * normComp.recency_score +
        this.weights.w_retain * normComp.retain_relation_score +
        this.weights.w_condition * normComp.condition_match_score -
        this.weights.w_stale * normComp.stale_penalty;

      processed.push({
        ...c,
        finalScore: normComp.final_score,
        scoreComponents: {
          normalized_base: normComp.normalized_base_score,
          recency: normComp.recency_score,
          retain_boost: normComp.retain_relation_score,
          condition_boost: normComp.condition_match_score,
          stale_penalty: normComp.stale_penalty
        },
        normComponents: normComp,
        relationReason: `Passed filter/initial scoring (${scopeReason})`
      });
    }

    // 3. Compatibility expansion
    let historicalLineageExpansionAccepted = false;
    if (this.featureConfig.enableHistoricalLineageExpansion && temporalIntent.type === 'historical') {
      const historicalTargetYear = temporalIntent.targetYear;
      const expandedIds = new Set(processed.map(item => item.chunkId));
      const historicalExpansions: Array<SearchResult & { normComponents: NormalizedScoreComponents }> = [];
      for (const seed of processed) {
        for (const relation of this.graph.getRelationsForChunk(seed.chunkId)) {
          const neighborId = relation.sourceChunkId === seed.chunkId ? relation.targetChunkId : relation.sourceChunkId;
          if (expandedIds.has(neighborId)) continue;
          const neighbor = this.chunksMap.get(neighborId);
          const neighborYear = neighbor?.published_year ?? Number.parseInt(neighbor?.published_at?.slice(0, 4) || '', 10);
          if (neighborYear !== historicalTargetYear) continue;

          expandedIds.add(neighborId);
          const baseScore = baseScoresMap.get(neighborId) ?? 0;
          const score = seed.finalScore + this.weights.w_expansion;
          const normComponents: NormalizedScoreComponents = {
            raw_base_score: baseScore,
            normalized_base_score: normalizedBaseMap.get(neighborId) ?? 0,
            recency_score: 0,
            retain_relation_score: 3.0,
            condition_match_score: 0,
            compatibility_score: this.weights.w_expansion,
            stale_penalty: 0,
            diversification_penalty: 0,
            final_score: score,
            rank_before_policy: 0,
            rank_after_policy: 0
          };
          historicalExpansions.push({
            chunkId: neighborId,
            baseScore,
            finalScore: score,
            rank: 0,
            relationReason: `Historical lineage expansion from ${seed.chunkId} via ${relation.relationId}`,
            scoreComponents: { historical_lineage_expansion: 1, compatibility_score: this.weights.w_expansion, parent_id: seed.chunkId },
            normComponents
          });
          this.lastExecutionMetrics.expansion_attempts++;
          this.lastExecutionMetrics.expansion_acceptances++;
          historicalLineageExpansionAccepted = true;
          if (query.onExpansionEvent) query.onExpansionEvent({
            query_id: query.queryId,
            seed_chunk_id: seed.chunkId,
            expanded_chunk_id: neighborId,
            relation_id: relation.relationId,
            relation_type: relation.relationType,
            candidate_existed_before_expansion: false,
            score_before_expansion: 0,
            compatibility_score_added: this.weights.w_expansion,
            score_after_expansion: score,
            rank_before_expansion: 0,
            rank_after_expansion: 0,
            accepted: true,
            rejection_reason: null
          });
        }
      }
      processed.push(...historicalExpansions);
    }

    if (this.featureConfig.enableHistoricalAdjacentExpansion && temporalIntent.type === 'historical' && !historicalLineageExpansionAccepted) {
      const existingIds = new Set(processed.map(item => item.chunkId));
      const additions: Array<SearchResult & { normComponents: NormalizedScoreComponents }> = [];
      for (const seed of processed) {
        const seedChunk = this.chunksMap.get(seed.chunkId);
        if (!seedChunk) continue;
        for (const neighbor of this.chunksMap.values()) {
          const neighborYear = neighbor.published_year ?? Number.parseInt(neighbor.published_at?.slice(0, 4) || '', 10);
          if (neighborYear !== temporalIntent.targetYear || neighbor.document_id !== seedChunk.document_id || neighbor.page_number !== seedChunk.page_number || Math.abs(neighbor.passage_index - seedChunk.passage_index) !== 1) continue;
          // A neighboring passage is context for an already retrieved
          // historical passage; give it a bounded, non-accumulating bonus.
          const score = seed.finalScore + 1.0;
          const existing = processed.find(item => item.chunkId === neighbor.chunk_id);
          if (existing) {
            if (score > existing.finalScore) {
              existing.finalScore = score;
              existing.normComponents.compatibility_score = 1.0;
              existing.normComponents.final_score = score;
              existing.scoreComponents = { ...existing.scoreComponents, historical_adjacent_expansion: 1, parent_id: seed.chunkId };
              existing.relationReason = `Historical adjacent-passage expansion from ${seed.chunkId}`;
              this.lastExecutionMetrics.expansion_attempts++;
              this.lastExecutionMetrics.expansion_acceptances++;
            }
            continue;
          }
          existingIds.add(neighbor.chunk_id);
          additions.push({
            chunkId: neighbor.chunk_id, baseScore: baseScoresMap.get(neighbor.chunk_id) ?? 0, finalScore: score, rank: 0,
            relationReason: `Historical adjacent-passage expansion from ${seed.chunkId}`,
            scoreComponents: { historical_adjacent_expansion: 1, parent_id: seed.chunkId },
            normComponents: { raw_base_score: baseScoresMap.get(neighbor.chunk_id) ?? 0, normalized_base_score: normalizedBaseMap.get(neighbor.chunk_id) ?? 0, recency_score: 0, retain_relation_score: 3, condition_match_score: 0, compatibility_score: 1.0, stale_penalty: 0, diversification_penalty: 0, final_score: score, rank_before_policy: 0, rank_after_policy: 0 }
          });
          this.lastExecutionMetrics.expansion_attempts++;
          this.lastExecutionMetrics.expansion_acceptances++;
        }
      }
      processed.push(...additions);
    }

    if (this.featureConfig.enableCompatibilityExpansion) {
      const expansionTracker = { attempts: 0, acceptances: 0 };
      const expandedList = expandCompatibleChunks(
        processed,
        baseScoresMap,
        this.graph,
        query,
        this.weights.expansion_seed_threshold ?? 0.05,
        this.weights.expansion_min_base_score ?? 0.01,
        expansionTracker
      );

      this.lastExecutionMetrics.expansion_attempts += expansionTracker.attempts;
      this.lastExecutionMetrics.expansion_acceptances += expansionTracker.acceptances;

      // Update processed list with expanded items
      processed = expandedList.map(item => {
        const existing = processed.find(p => p.chunkId === item.chunkId);
        const compScoreAdded = item.scoreComponents?.compatibility_score ?? 0;

        if (existing) {
          existing.normComponents.compatibility_score = compScoreAdded;
          existing.normComponents.final_score = item.finalScore;
          return { ...existing, finalScore: item.finalScore, relationReason: item.relationReason };
        } else {
          const normBase = normalizedBaseMap.get(item.chunkId) ?? 0.0;
          const normComp: NormalizedScoreComponents = {
            raw_base_score: item.baseScore,
            normalized_base_score: normBase,
            recency_score: 0.0,
            retain_relation_score: 0.0,
            condition_match_score: 0.0,
            compatibility_score: compScoreAdded,
            stale_penalty: 0.0,
            diversification_penalty: 0.0,
            final_score: item.finalScore,
            rank_before_policy: 0,
            rank_after_policy: 0
          };
          return {
            ...item,
            normComponents: normComp
          };
        }
      });
    }

    // 4. Diversification
    if (this.featureConfig.enableDiversification) {
      const divTracker = { penalties: 0 };
      const divList = diversifyResults(processed, this.graph, this.weights.diversification_penalty ?? 0.2, divTracker);
      this.lastExecutionMetrics.diversification_penalties_applied += divTracker.penalties;

      processed = divList.map(item => {
        const existing = processed.find(p => p.chunkId === item.chunkId);
        const divPen = item.scoreComponents?.diversification_penalty ?? 0;
        if (existing) {
          existing.normComponents.diversification_penalty = divPen;
          existing.normComponents.final_score = item.finalScore;
          return { ...existing, finalScore: item.finalScore };
        }
        return item as any;
      });
    }

    // Sort by final score descending
    processed.sort((a, b) => {
      if (Math.abs(a.finalScore - b.finalScore) < 1e-6) {
        return a.chunkId.localeCompare(b.chunkId);
      }
      return b.finalScore - a.finalScore;
    });

    processed.forEach((item, idx) => {
      item.normComponents.rank_after_policy = idx + 1;
    });

    const warnings = this.graph.getUncertaintyWarnings();
    const finalResults: SearchResult[] = processed.slice(0, topK).map((res, index) => ({
      chunkId: res.chunkId,
      baseScore: res.baseScore,
      finalScore: res.finalScore,
      rank: index + 1,
      scoreComponents: res.scoreComponents,
      relationReason: res.relationReason,
      warnings: warnings.length > 0 ? [...warnings] : undefined,
      normalizedScoreComponents: res.normComponents
    }));

    if (query.onTraceEvent) {
      const finalRankMap = new Map(finalResults.map(r => [r.chunkId, r.rank]));
      const allProcessedRankMap = new Map(processed.map((r, idx) => [r.chunkId, idx + 1]));

      for (const item of processed) {
        const relations = this.graph.getRelationsForChunk(item.chunkId);
        const isScopeMatched = this.graph.isChunkActive(item.chunkId, query.targetPopulation, query.conditions);
        const baseRank = candidates.findIndex(c => c.chunkId === item.chunkId);

        query.onTraceEvent({
          chunkId: item.chunkId,
          baseScore: item.baseScore,
          baseRank: baseRank !== -1 ? baseRank + 1 : null,
          matchedRelationIds: relations.map(r => r.relationId),
          relationTypes: relations.map(r => r.relationType),
          policyLabels: relations.map(r => r.policyState),
          scopeMatched: isScopeMatched,
          scopeReason: isScopeMatched ? 'Valid scope' : 'Filtered by scope',
          retainedAfterFilter: isScopeMatched,
          filterReason: item.relationReason || 'Policy filter',
          retainRelationBoost: item.normComponents.retain_relation_score,
          conditionBoost: item.normComponents.condition_match_score,
          wasExpansionSeed: item.baseScore >= (this.weights.expansion_seed_threshold ?? 0.05),
          wasExpansionAdded: item.normComponents.compatibility_score > 0,
          expansionParentId: item.scoreComponents?.parent_id ? String(item.scoreComponents.parent_id) : null,
          expansionRelationId: relations[0]?.relationId || null,
          expansionBeforeScore: item.normComponents.raw_base_score,
          expansionAfterScore: item.normComponents.final_score,
          diversificationPenalty: item.normComponents.diversification_penalty,
          finalScore: item.finalScore,
          finalRank: finalRankMap.get(item.chunkId) ?? allProcessedRankMap.get(item.chunkId) ?? null
        });
      }
    }

    return finalResults;
  }
}
