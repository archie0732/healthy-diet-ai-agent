export interface PerformanceStats {
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  isError?: boolean;
}

export interface ClassificationReport {
  accuracy: number;
  macroF1: number;
  perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>;
  confusionMatrix: Record<string, Record<string, number>>;
  invalidRate: number;
  totalEvaluated: number;
  errorCount: number;
  totalLatencyMs?: number;
  avgLatencyMs?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  estimatedCostUSD?: number;
}

export function computeClassificationMetrics(
  predictions: string[],
  groundTruth: string[],
  performanceStats?: PerformanceStats[]
): ClassificationReport {
  const n = predictions.length;
  if (n !== groundTruth.length || n === 0) {
    return {
      accuracy: 0,
      macroF1: 0,
      perClass: {},
      confusionMatrix: {},
      invalidRate: 0,
      totalEvaluated: 0,
      errorCount: 0
    };
  }

  const classes = Array.from(new Set([...predictions, ...groundTruth]));

  let correct = 0;
  for (let i = 0; i < n; i++) {
    if (predictions[i] === groundTruth[i]) {
      correct++;
    }
  }
  const accuracy = correct / n;

  const confusionMatrix: Record<string, Record<string, number>> = {};
  for (const c1 of classes) {
    confusionMatrix[c1] = {};
    for (const c2 of classes) {
      confusionMatrix[c1][c2] = 0;
    }
  }

  for (let i = 0; i < n; i++) {
    const gold = groundTruth[i];
    const pred = predictions[i];
    confusionMatrix[gold][pred] = (confusionMatrix[gold][pred] || 0) + 1;
  }

  const perClass: Record<string, { precision: number; recall: number; f1: number; support: number }> = {};
  let totalF1 = 0;

  for (const c of classes) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;

    for (let i = 0; i < n; i++) {
      if (groundTruth[i] === c) {
        support++;
        if (predictions[i] === c) {
          tp++;
        } else {
          fn++;
        }
      } else {
        if (predictions[i] === c) {
          fp++;
        }
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    perClass[c] = {
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      f1: parseFloat(f1.toFixed(4)),
      support
    };
    totalF1 += f1;
  }

  const macroF1 = parseFloat((totalF1 / classes.length).toFixed(4));

  let errorCount = 0;
  let totalLatencyMs = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  if (performanceStats && performanceStats.length === n) {
    for (const s of performanceStats) {
      if (s.isError) errorCount++;
      totalLatencyMs += s.latencyMs || 0;
      totalPromptTokens += s.promptTokens || 0;
      totalCompletionTokens += s.completionTokens || 0;
    }
  }

  const invalidRate = parseFloat((errorCount / n).toFixed(4));
  const avgLatencyMs = n > 0 ? parseFloat((totalLatencyMs / n).toFixed(2)) : 0;

  // Estimated Cost (Gemini Flash baseline: $0.075 / 1M prompt, $0.30 / 1M completion)
  const estimatedCostUSD = parseFloat(
    ((totalPromptTokens * 0.075 + totalCompletionTokens * 0.3) / 1_000_000).toFixed(6)
  );

  return {
    accuracy: parseFloat(accuracy.toFixed(4)),
    macroF1,
    perClass,
    confusionMatrix,
    invalidRate,
    totalEvaluated: n,
    errorCount,
    totalLatencyMs,
    avgLatencyMs,
    totalPromptTokens,
    totalCompletionTokens,
    estimatedCostUSD
  };
}

