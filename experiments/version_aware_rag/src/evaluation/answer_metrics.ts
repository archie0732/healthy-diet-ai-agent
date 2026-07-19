export interface AutomaticProxyMetrics {
  query_id: string;
  system_alias: string;
  metric_provenance: 'automatic_gold_citation_proxy';
  scoring_method: 'deterministic_rules_from_gold_chunk_sets';
  answer_correctness: number; // 0.0 to 1.0
  completeness: number; // 0.0 to 1.0
  version_correctness: number; // 0.0 to 1.0
  conditional_boundary_preservation: number; // 0.0 to 1.0
  unsupported_claim: number; // 0.0 or 1.0
  citation_entailment: number; // 0.0 to 1.0
}

export interface AnswerHumanAnnotation {
  item_id: string;
  query_id: string;
  annotator_id: string;
  system_alias: string;
  answer_correctness: number; // 0, 0.5, 1
  completeness: number; // 0, 0.5, 1
  version_correctness: number; // 0, 0.5, 1
  conditional_boundary_preservation: number; // 0, 0.5, 1
  unsupported_claim: number; // 0 or 1
  citation_entailment: number; // 0, 0.5, 1
  notes?: string;
}

export interface AnswerHumanAdjudication {
  item_id: string;
  query_id: string;
  system_alias: string;
  annotator_1_score: Record<string, number>;
  annotator_2_score: Record<string, number>;
  final_score: {
    answer_correctness: number;
    completeness: number;
    version_correctness: number;
    conditional_boundary_preservation: number;
    unsupported_claim: number;
    citation_entailment: number;
  };
  is_adjudicated: boolean;
  adjudication_reason?: string;
}

// Deprecated legacy alias for compatibility where needed
export type AnswerJudgment = AutomaticProxyMetrics;

export interface SystemAnswerMetricsSummary {
  meanCorrectness: number;
  meanCompleteness: number;
  meanVersionCorrectness: number;
  meanBoundaryPreservation: number;
  unsupportedClaimRate: number;
  meanCitationEntailment: number;
}

export class AnswerMetricsEvaluator {
  public static calculateSummary(
    judgments: Array<{
      answer_correctness: number;
      completeness: number;
      version_correctness: number;
      conditional_boundary_preservation: number;
      unsupported_claim: number;
      citation_entailment: number;
    }>
  ): SystemAnswerMetricsSummary {
    if (!judgments || judgments.length === 0) {
      return {
        meanCorrectness: 0,
        meanCompleteness: 0,
        meanVersionCorrectness: 0,
        meanBoundaryPreservation: 0,
        unsupportedClaimRate: 0,
        meanCitationEntailment: 0
      };
    }

    const n = judgments.length;
    const sumCorrectness = judgments.reduce((acc, j) => acc + j.answer_correctness, 0);
    const sumCompleteness = judgments.reduce((acc, j) => acc + j.completeness, 0);
    const sumVersionCorrectness = judgments.reduce((acc, j) => acc + j.version_correctness, 0);
    const sumBoundary = judgments.reduce((acc, j) => acc + j.conditional_boundary_preservation, 0);
    const sumUnsupported = judgments.reduce((acc, j) => acc + (j.unsupported_claim > 0 ? 1 : 0), 0);
    const sumCitationEntailment = judgments.reduce((acc, j) => acc + j.citation_entailment, 0);

    return {
      meanCorrectness: parseFloat((sumCorrectness / n).toFixed(4)),
      meanCompleteness: parseFloat((sumCompleteness / n).toFixed(4)),
      meanVersionCorrectness: parseFloat((sumVersionCorrectness / n).toFixed(4)),
      meanBoundaryPreservation: parseFloat((sumBoundary / n).toFixed(4)),
      unsupportedClaimRate: parseFloat((sumUnsupported / n).toFixed(4)),
      meanCitationEntailment: parseFloat((sumCitationEntailment / n).toFixed(4))
    };
  }

  /**
   * Computes automatic citation proxy metrics using deterministic rules against gold chunk sets.
   * NOTE: This is an automated proxy metric and NOT human adjudication.
   */
  public static computeAutomaticCitationProxyMetrics(
    answerRecord: {
      query_id: string;
      answer: string;
      citations: string[];
      citation_validation: { valid: string[]; invalid: string[]; invalid_rate: number };
    },
    groundTruthJudgment: {
      required_chunk_ids: string[];
      compatible_chunk_ids: string[];
      deprecated_chunk_ids: string[];
      forbidden_chunk_ids: string[];
      citation_safe_chunk_ids: string[];
    },
    systemAlias: string
  ): AutomaticProxyMetrics {
    const requiredSet = new Set(groundTruthJudgment.required_chunk_ids || []);
    const forbiddenSet = new Set(groundTruthJudgment.forbidden_chunk_ids || []);
    const safeSet = new Set(groundTruthJudgment.citation_safe_chunk_ids || []);
    const deprecatedSet = new Set(groundTruthJudgment.deprecated_chunk_ids || []);

    const citations = answerRecord.citations || [];
    const validCitations = answerRecord.citation_validation?.valid || [];
    const invalidCitations = answerRecord.citation_validation?.invalid || [];

    // 1. Completeness: fraction of required chunks cited/retrieved
    let requiredHitCount = 0;
    for (const reqId of requiredSet) {
      if (validCitations.includes(reqId)) {
        requiredHitCount++;
      }
    }
    const completeness = requiredSet.size > 0 ? parseFloat((requiredHitCount / requiredSet.size).toFixed(4)) : 1.0;

    // 2. Version correctness: penalize if forbidden or deprecated chunks cited
    let hasForbiddenOrDeprecated = false;
    for (const c of validCitations) {
      if (forbiddenSet.has(c) || deprecatedSet.has(c)) {
        hasForbiddenOrDeprecated = true;
        break;
      }
    }
    const versionCorrectness = hasForbiddenOrDeprecated ? 0.0 : 1.0;

    // 3. Answer Correctness: combination of completeness and version correctness
    const answerCorrectness = parseFloat((completeness * versionCorrectness).toFixed(4));

    // 4. Conditional Boundary Preservation
    const boundaryPreservation = versionCorrectness === 1.0 ? completeness : 0.0;

    // 5. Citation Entailment & Unsupported Claim
    let safeCiteCount = 0;
    for (const c of citations) {
      if (safeSet.has(c) && !invalidCitations.includes(c)) {
        safeCiteCount++;
      }
    }
    const citationEntailment = citations.length > 0 ? parseFloat((safeCiteCount / citations.length).toFixed(4)) : 1.0;
    const unsupportedClaim = (invalidCitations.length > 0 || safeCiteCount < citations.length) ? 1.0 : 0.0;

    return {
      query_id: answerRecord.query_id,
      system_alias: systemAlias,
      metric_provenance: 'automatic_gold_citation_proxy',
      scoring_method: 'deterministic_rules_from_gold_chunk_sets',
      answer_correctness: answerCorrectness,
      completeness: completeness,
      version_correctness: versionCorrectness,
      conditional_boundary_preservation: boundaryPreservation,
      unsupported_claim: unsupportedClaim,
      citation_entailment: citationEntailment
    };
  }

  /**
   * Computes unweighted Cohen's Kappa for binary metric ratings (e.g. unsupported_claim: 0 vs 1).
   */
  public static computeCohenKappa(ratingsA: number[], ratingsB: number[]): number {
    if (ratingsA.length !== ratingsB.length || ratingsA.length === 0) return 1.0;

    const n = ratingsA.length;
    let agreeCount = 0;

    let countA0 = 0, countA1 = 0;
    let countB0 = 0, countB1 = 0;

    for (let i = 0; i < n; i++) {
      if (ratingsA[i] === ratingsB[i]) agreeCount++;
      if (ratingsA[i] === 0) countA0++; else countA1++;
      if (ratingsB[i] === 0) countB0++; else countB1++;
    }

    const pObserved = agreeCount / n;
    const pExpected = (countA0 / n) * (countB0 / n) + (countA1 / n) * (countB1 / n);

    if (Math.abs(1.0 - pExpected) < 1e-9) {
      return pObserved === 1.0 ? 1.0 : 0.0;
    }

    return parseFloat(((pObserved - pExpected) / (1.0 - pExpected)).toFixed(4));
  }

  /**
   * Computes Linear Weighted Cohen's Kappa for ordinal ratings (e.g. 0, 0.5, 1).
   */
  public static computeWeightedCohenKappa(
    ratingsA: number[],
    ratingsB: number[],
    categories: number[] = [0, 0.5, 1]
  ): number {
    if (ratingsA.length !== ratingsB.length || ratingsA.length === 0) return 1.0;

    const k = categories.length;
    const n = ratingsA.length;
    const catIndex = new Map(categories.map((val, idx) => [val, idx]));

    // Construct joint frequency matrix & margins
    const observedFreq: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    const marginA: number[] = Array(k).fill(0);
    const marginB: number[] = Array(k).fill(0);

    for (let idx = 0; idx < n; idx++) {
      const i = catIndex.get(ratingsA[idx]) ?? 0;
      const j = catIndex.get(ratingsB[idx]) ?? 0;
      observedFreq[i][j]++;
      marginA[i]++;
      marginB[j]++;
    }

    // Weight matrix w_ij = 1 - |cat[i] - cat[j]| / (max - min)
    const minVal = Math.min(...categories);
    const maxVal = Math.max(...categories);
    const range = maxVal - minVal || 1;

    let pObservedWeighted = 0;
    let pExpectedWeighted = 0;

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const weight = 1.0 - Math.abs(categories[i] - categories[j]) / range;
        const pObservedCell = observedFreq[i][j] / n;
        const pExpectedCell = (marginA[i] / n) * (marginB[j] / n);

        pObservedWeighted += weight * pObservedCell;
        pExpectedWeighted += weight * pExpectedCell;
      }
    }

    if (Math.abs(1.0 - pExpectedWeighted) < 1e-9) {
      return pObservedWeighted === 1.0 ? 1.0 : 0.0;
    }

    const kappa = (pObservedWeighted - pExpectedWeighted) / (1.0 - pExpectedWeighted);
    return parseFloat(kappa.toFixed(4));
  }
}
