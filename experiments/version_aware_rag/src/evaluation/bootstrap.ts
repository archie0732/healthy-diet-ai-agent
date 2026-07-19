class SeededRandom {
  private seed: number;
  constructor(seed = 42) {
    this.seed = seed;
  }
  public next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
}

export interface BootstrapResult {
  mean: number;
  ciLow: number;
  ciHigh: number;
}

/**
 * Performs deterministic bootstrap resampling to compute 95% Confidence Intervals.
 */
export function computeBootstrapCI(
  data: number[],
  iterations = 1000,
  seed = 42
): BootstrapResult {
  const n = data.length;
  if (n === 0) return { mean: 0, ciLow: 0, ciHigh: 0 };

  const rng = new SeededRandom(seed);
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const resampledMeans: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let sampleSum = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rng.next() * n);
      sampleSum += data[idx];
    }
    resampledMeans.push(sampleSum / n);
  }

  // Sort to compute percentiles
  resampledMeans.sort((a, b) => a - b);

  // 95% CI is between 2.5th and 97.5th percentiles
  const lowIdx = Math.floor(iterations * 0.025);
  const highIdx = Math.floor(iterations * 0.975);

  const ciLow = resampledMeans[lowIdx];
  const ciHigh = resampledMeans[highIdx];

  return {
    mean: parseFloat(mean.toFixed(4)),
    ciLow: parseFloat(ciLow.toFixed(4)),
    ciHigh: parseFloat(ciHigh.toFixed(4))
  };
}

/**
 * Performs bootstrap resampling on the difference of two paired lists.
 */
export function computeBootstrapDifferenceCI(
  dataA: number[],
  dataB: number[],
  iterations = 1000,
  seed = 42
): BootstrapResult {
  if (dataA.length !== dataB.length || dataA.length === 0) {
    return { mean: 0, ciLow: 0, ciHigh: 0 };
  }

  // difference: B - A (Proposed - Baseline)
  const diffs = dataA.map((val, idx) => dataB[idx] - val);
  return computeBootstrapCI(diffs, iterations, seed);
}
