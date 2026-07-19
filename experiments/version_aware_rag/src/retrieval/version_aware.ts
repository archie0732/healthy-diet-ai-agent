import { Retriever, RetrievalContext, SearchResult } from './types';
import { RelationGraph } from '../versioning/relation_graph';
import { AblationConfig } from '../versioning/types';
import { CorpusChunk } from '../corpus/types';
import { expandCompatibleChunks } from './compatibility_expansion';
import { diversifyResults } from './result_diversification';

export class VersionAwareRetriever implements Retriever {
  private baseRetriever: Retriever;
  private chunksMap: Map<string, CorpusChunk> = new Map();
  private graph: RelationGraph;
  private ablation: AblationConfig;

  private retain_relation_boost: number;
  private condition_boost: number;
  private expansion_seed_threshold: number;
  private expansion_min_base_score: number;
  private diversification_penalty: number;

  constructor(
    baseRetriever: Retriever,
    chunks: CorpusChunk[],
    graph: RelationGraph,
    ablation: AblationConfig
  ) {
    this.baseRetriever = baseRetriever;
    this.graph = graph;
    this.ablation = ablation;
    this.retain_relation_boost = ablation.retain_relation_boost ?? 0.1;
    this.condition_boost = ablation.condition_boost ?? 0.15;
    this.expansion_seed_threshold = ablation.expansion_seed_threshold ?? 0.05;
    this.expansion_min_base_score = ablation.expansion_min_base_score ?? 0.01;
    this.diversification_penalty = ablation.diversification_penalty ?? 0.9;
    for (const c of chunks) {
      this.chunksMap.set(c.chunk_id, c);
    }
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    // 1. Base retrieval (large candidate pool)
    const basePoolSize = Math.max(topK * 4, 20);
    const candidates = await this.baseRetriever.retrieve(query, basePoolSize);

    if (candidates.length === 0) return [];

    // Map of chunkId -> base score for threshold checks in compatibility expansion
    const baseScoresMap = new Map<string, number>();
    for (const c of candidates) {
      baseScoresMap.set(c.chunkId, c.baseScore);
    }

    let processed: SearchResult[] = candidates.map(c => ({
      ...c,
      relationReason: 'Base candidate retrieval'
    }));

    // 2. Policy filtering
    const enableFiltering =
      this.ablation.filter_only ||
      this.ablation.filter_retain_boost ||
      this.ablation.filter_compatibility_expansion ||
      this.ablation.filter_condition_matching ||
      this.ablation.full_version_aware ||
      this.ablation.full_version_aware_no_div;

    if (enableFiltering) {
      processed = processed.filter(c => 
        this.graph.isChunkActive(c.chunkId, query.targetPopulation, query.conditions)
      );
      processed.forEach(c => {
        c.relationReason = 'Active version (passed policy filter)';
      });
    }

    // 3. Retain relation boost
    const enableRetainBoost =
      this.ablation.filter_retain_boost ||
      this.ablation.full_version_aware ||
      this.ablation.full_version_aware_no_div;

    if (enableRetainBoost) {
      processed = processed.map(c => {
        let boost = 0;
        let reason = c.relationReason || '';
        if (this.graph.hasActiveRetainRelation(c.chunkId, query.targetPopulation, query.conditions)) {
          boost = this.retain_relation_boost;
          reason += (reason ? '; ' : '') + `Boosted due to active retain relation in graph (+${boost})`;
        }
        return {
          ...c,
          finalScore: c.finalScore + boost,
          relationReason: reason,
          scoreComponents: {
            ...c.scoreComponents,
            retain_relation_boost: boost
          }
        };
      });
    }

    // 3.5. Condition matching (boost scores of chunks with matching condition/population tags)
    const enableConditionBoost =
      this.ablation.filter_condition_matching ||
      this.ablation.full_version_aware ||
      this.ablation.full_version_aware_no_div;

    if (enableConditionBoost) {
      processed = processed.map(c => {
        const chunkMeta = this.chunksMap.get(c.chunkId);
        let boost = 0;
        let reason = c.relationReason || '';
        if (chunkMeta) {
          const matchPop = query.targetPopulation.some(p => chunkMeta.population_tags.includes(p));
          const matchCond = query.conditions.some(con => chunkMeta.condition_tags.includes(con));
          if (matchPop || matchCond) {
            boost = this.condition_boost;
            reason += (reason ? '; ' : '') + `Boosted due to query population/condition match (+${boost})`;
          }
        }
        return {
          ...c,
          finalScore: c.finalScore + boost,
          relationReason: reason,
          scoreComponents: {
            ...c.scoreComponents,
            condition_boost: boost
          }
        };
      });
    }

    // 4. Compatibility expansion
    const enableExpansion =
      this.ablation.filter_compatibility_expansion ||
      this.ablation.full_version_aware ||
      this.ablation.full_version_aware_no_div;

    if (enableExpansion) {
      processed = expandCompatibleChunks(
        processed,
        baseScoresMap,
        this.graph,
        query,
        this.expansion_seed_threshold,
        this.expansion_min_base_score
      );
    }

    // 5. Diversification
    const enableDiversification =
      this.ablation.full_version_aware && !this.ablation.full_version_aware_no_div;

    if (enableDiversification) {
      processed = diversifyResults(processed, this.graph, this.diversification_penalty);
    }

    // Re-sort and slice to topK
    processed.sort((a, b) => {
      if (Math.abs(a.finalScore - b.finalScore) < 1e-6) {
        return a.chunkId.localeCompare(b.chunkId);
      }
      return b.finalScore - a.finalScore;
    });

    const warnings = this.graph.getUncertaintyWarnings();

    return processed.slice(0, topK).map((res, index) => ({
      ...res,
      rank: index + 1,
      warnings: warnings.length > 0 ? [...warnings] : undefined
    }));
  }
}
