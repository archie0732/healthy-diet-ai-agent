/**
 * Computes Cohen's Kappa for two lists of categorical labels.
 */
export function computeCohensKappa(labelsA: string[], labelsB: string[]): number {
  if (labelsA.length !== labelsB.length || labelsA.length === 0) {
    return 0;
  }
  const n = labelsA.length;

  // Find all unique category labels across both annotators
  const categories = Array.from(new Set([...labelsA, ...labelsB]));

  // Observed agreement rate (p_o)
  let observedMatches = 0;
  for (let i = 0; i < n; i++) {
    if (labelsA[i] === labelsB[i]) {
      observedMatches++;
    }
  }
  const p_o = observedMatches / n;

  // Expected agreement rate by chance (p_e)
  const freqA: Record<string, number> = {};
  const freqB: Record<string, number> = {};
  
  for (const cat of categories) {
    freqA[cat] = 0;
    freqB[cat] = 0;
  }

  for (let i = 0; i < n; i++) {
    freqA[labelsA[i]] = (freqA[labelsA[i]] || 0) + 1;
    freqB[labelsB[i]] = (freqB[labelsB[i]] || 0) + 1;
  }

  let p_e = 0;
  for (const cat of categories) {
    p_e += (freqA[cat] / n) * (freqB[cat] / n);
  }

  // Kappa calculation
  if (Math.abs(1 - p_e) < 1e-9) {
    return p_o === 1 ? 1 : 0;
  }
  
  return (p_o - p_e) / (1 - p_e);
}

/**
 * Computes Jaccard Similarity between two string arrays or sets.
 */
export function computeJaccardSimilarity(arrA: string[], arrB: string[]): number {
  const setA = new Set(arrA);
  const setB = new Set(arrB);
  const union = new Set([...setA, ...setB]);
  
  if (union.size === 0) {
    return 1; // Both sets are empty, perfect agreement
  }

  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) {
      intersection++;
    }
  }

  return intersection / union.size;
}
