export interface ErrorCase {
  queryId: string;
  question: string;
  category: 'proposed_win' | 'both_win' | 'policy_or_retrieval_failure' | 'detector_propagation_error';
  proposedRecall: number;
  recencyRecall: number;
  proposedAnswerCorrectness?: number;
  recencyAnswerCorrectness?: number;
  reason?: string;
}

export class ErrorAnalysis {
  public static analyze(
    queries: { query_id: string; question: string }[],
    proposedMetrics: Record<string, any>,
    recencyMetrics: Record<string, any>,
    oracleVsPredictedDiffs?: Map<string, { oracleRecall: number; predictedRecall: number }>
  ): ErrorCase[] {
    const cases: ErrorCase[] = [];

    for (const q of queries) {
      const pMet = proposedMetrics[q.query_id] || { recall: 0 };
      const rMet = recencyMetrics[q.query_id] || { recall: 0 };

      let category: ErrorCase['category'] = 'policy_or_retrieval_failure';
      let reason = '';

      // Check if detector error specifically caused a drop between Oracle and Predicted
      const predDiff = oracleVsPredictedDiffs?.get(q.query_id);
      if (predDiff && predDiff.predictedRecall < predDiff.oracleRecall) {
        category = 'detector_propagation_error';
        reason = 'Classifier misclassification caused relation graph difference that degraded downstream retrieval recall';
      } else if (pMet.recall > rMet.recall) {
        category = 'proposed_win';
        reason = 'Version-aware filtering successfully excluded stale chunk or retained historical match';
      } else if (pMet.recall === 1.0 && rMet.recall === 1.0) {
        category = 'both_win';
        reason = 'Both systems retrieved all required evidence chunks';
      } else if (pMet.recall < rMet.recall) {
        category = 'policy_or_retrieval_failure';
        reason = 'Policy filtering or base retrieval ranker failed to retain required evidence chunks';
      } else {
        category = 'policy_or_retrieval_failure';
        reason = 'Both systems failed to achieve full recall for this query';
      }

      cases.push({
        queryId: q.query_id,
        question: q.question,
        category,
        proposedRecall: pMet.recall || 0,
        recencyRecall: rMet.recall || 0,
        reason
      });
    }

    return cases;
  }

  public static toCsv(cases: ErrorCase[]): string {
    const header = 'query_id,category,proposed_recall,recency_recall,question,reason\n';
    const rows = cases.map(c => 
      `"${c.queryId}","${c.category}",${c.proposedRecall.toFixed(3)},${c.recencyRecall.toFixed(3)},"${c.question.replace(/"/g, '""')}","${(c.reason || '').replace(/"/g, '""')}"`
    );
    return header + rows.join('\n');
  }
}


