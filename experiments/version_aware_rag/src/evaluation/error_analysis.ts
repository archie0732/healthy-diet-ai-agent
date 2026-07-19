export interface ErrorCase {
  queryId: string;
  question: string;
  category: 'proposed_win' | 'both_win' | 'proposed_fail' | 'detector_propagation_error';
  proposedRecall: number;
  recencyRecall: number;
}

export class ErrorAnalysis {
  public static analyze(
    queries: { query_id: string; question: string }[],
    proposedMetrics: Record<string, any>,
    recencyMetrics: Record<string, any>
  ): ErrorCase[] {
    const cases: ErrorCase[] = [];

    for (const q of queries) {
      const pMet = proposedMetrics[q.query_id] || { recall: 0 };
      const rMet = recencyMetrics[q.query_id] || { recall: 0 };

      let category: ErrorCase['category'] = 'proposed_fail';

      if (pMet.recall > rMet.recall) {
        category = 'proposed_win';
      } else if (pMet.recall === 1.0 && rMet.recall === 1.0) {
        category = 'both_win';
      } else if (pMet.recall < rMet.recall) {
        category = 'detector_propagation_error';
      }

      cases.push({
        queryId: q.query_id,
        question: q.question,
        category,
        proposedRecall: pMet.recall || 0,
        recencyRecall: rMet.recall || 0
      });
    }

    return cases;
  }
}
