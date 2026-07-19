export interface ClassificationReport {
  accuracy: number;
  macroF1: number;
  perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>;
  confusionMatrix: Record<string, Record<string, number>>;
}

export function computeClassificationMetrics(
  predictions: string[],
  groundTruth: string[]
): ClassificationReport {
  const n = predictions.length;
  if (n !== groundTruth.length || n === 0) {
    return { accuracy: 0, macroF1: 0, perClass: {}, confusionMatrix: {} };
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

  return {
    accuracy: parseFloat(accuracy.toFixed(4)),
    macroF1,
    perClass,
    confusionMatrix
  };
}
