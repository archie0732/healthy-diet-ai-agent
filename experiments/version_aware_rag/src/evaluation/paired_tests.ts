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
