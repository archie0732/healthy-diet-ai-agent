function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804;
  const p = d * Math.exp(-0.5 * z * z) * t * (
    0.319381530 + t * (
      -0.356563782 + t * (
        1.781477937 + t * (
          -1.821255978 + t * 1.330274429
        )
      )
    )
  );
  return z >= 0 ? 1 - p : p;
}

/**
 * Validates that query IDs match exactly in the same order.
 * Throws an Error if query sets or order mismatch.
 */
export function validateQueryAlignment(
  queriesA: string[],
  queriesB: string[]
): void {
  if (queriesA.length !== queriesB.length) {
    throw new Error(
      `Paired test query count mismatch: Run A has ${queriesA.length} queries, but Run B has ${queriesB.length} queries.`
    );
  }
  for (let i = 0; i < queriesA.length; i++) {
    if (queriesA[i] !== queriesB[i]) {
      throw new Error(
        `Paired test query order mismatch at index ${i}: Run A query ID "${queriesA[i]}" vs Run B query ID "${queriesB[i]}".`
      );
    }
  }
}

export function computeWilcoxonSignedRank(
  dataA: number[],
  dataB: number[]
): {
  wStatistic: number;
  pValue: number;
  isSignificant: boolean;
} {
  const n = dataA.length;
  if (n === 0) return { wStatistic: 0, pValue: 1.0, isSignificant: false };

  const diffsWithIndices = dataA.map((val, idx) => ({
    diff: dataB[idx] - val,
    absDiff: Math.abs(dataB[idx] - val)
  })).filter(x => x.absDiff !== 0);

  const Nr = diffsWithIndices.length;
  if (Nr === 0) {
    return { wStatistic: 0, pValue: 1.0, isSignificant: false };
  }

  diffsWithIndices.sort((a, b) => a.absDiff - b.absDiff);

  const ranks = new Array<number>(Nr);
  let i = 0;
  while (i < Nr) {
    let j = i;
    while (j < Nr && diffsWithIndices[j].absDiff === diffsWithIndices[i].absDiff) {
      j++;
    }
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = averageRank;
    }
    i = j;
  }

  let wPlus = 0;
  let wMinus = 0;

  for (let k = 0; k < Nr; k++) {
    if (diffsWithIndices[k].diff > 0) {
      wPlus += ranks[k];
    } else {
      wMinus += ranks[k];
    }
  }

  const wStatistic = Math.min(wPlus, wMinus);

  const meanW = (Nr * (Nr + 1)) / 4;
  const varW = (Nr * (Nr + 1) * (2 * Nr + 1)) / 24;
  const sdW = Math.sqrt(varW);

  const z = sdW > 0 ? (wStatistic - meanW + 0.5) / sdW : 0;
  const pValue = 2 * normalCDF(z);

  return {
    wStatistic,
    pValue: parseFloat(Math.min(1.0, pValue).toFixed(4)),
    isSignificant: pValue < 0.05
  };
}

/**
 * Computes McNemar test for paired binary rates (e.g., success=1, fail=0).
 */
export function computeMcNemarTest(
  binaryA: number[],
  binaryB: number[]
): {
  chiSquare: number;
  pValue: number;
  isSignificant: boolean;
  b: number; // Proposed fail (0), Baseline win (1)
  c: number; // Proposed win (1), Baseline fail (0)
} {
  let b = 0; // A=1, B=0
  let c = 0; // A=0, B=1

  for (let i = 0; i < binaryA.length; i++) {
    const valA = binaryA[i] > 0 ? 1 : 0;
    const valB = binaryB[i] > 0 ? 1 : 0;

    if (valA === 1 && valB === 0) b++;
    if (valA === 0 && valB === 1) c++;
  }

  if (b + c === 0) {
    return { chiSquare: 0, pValue: 1.0, isSignificant: false, b, c };
  }

  // Continuity corrected Chi-Square statistic
  const chiSquare = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);
  // Degrees of freedom = 1, p-value from chi-square distribution approx
  const z = Math.sqrt(chiSquare);
  const pValue = 2 * normalCDF(-z);

  return {
    chiSquare: parseFloat(chiSquare.toFixed(4)),
    pValue: parseFloat(Math.min(1.0, pValue).toFixed(4)),
    isSignificant: pValue < 0.05,
    b,
    c
  };
}

/**
 * Applies Holm-Bonferroni correction to multiple p-values.
 */
export function applyHolmCorrection(
  pValues: { name: string; pValue: number }[],
  alpha = 0.05
): { name: string; pValue: number; adjustedPValue: number; isSignificant: boolean }[] {
  const m = pValues.length;
  const indexed = pValues.map((item, idx) => ({ ...item, originalIndex: idx }));
  indexed.sort((a, b) => a.pValue - b.pValue);

  const results = new Array(m);
  let prevAdjusted = 0;

  for (let i = 0; i < m; i++) {
    const rank = i + 1;
    const rawP = indexed[i].pValue;
    const multiplier = m - rank + 1;
    let adjustedP = Math.min(1.0, rawP * multiplier);
    adjustedP = Math.max(adjustedP, prevAdjusted); // Monotonicity constraint
    prevAdjusted = adjustedP;

    results[indexed[i].originalIndex] = {
      name: indexed[i].name,
      pValue: parseFloat(rawP.toFixed(4)),
      adjustedPValue: parseFloat(adjustedP.toFixed(4)),
      isSignificant: adjustedP < alpha
    };
  }

  return results;
}

/**
 * Tests non-inferiority for stale safety rate (margin default 0.05).
 * Null hypothesis: Proposed - Baseline >= margin (inferior)
 * Alternative hypothesis: Proposed - Baseline < margin (non-inferior)
 */
export function testNonInferiority(
  staleRateBaseline: number,
  staleRateProposed: number,
  margin = 0.05
): {
  difference: number;
  margin: number;
  passedNonInferiority: boolean;
} {
  const diff = staleRateProposed - staleRateBaseline;
  const passed = diff <= margin;
  return {
    difference: parseFloat(diff.toFixed(4)),
    margin,
    passedNonInferiority: passed
  };
}
