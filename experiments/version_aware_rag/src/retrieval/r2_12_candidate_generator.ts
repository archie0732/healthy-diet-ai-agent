export interface R212RoleNeutralCandidate {
  runtimeItemId: string;
  text: string;
  candidateGroupIds: string[];
}

export interface R212CandidateGeneratorConfig {
  bm25K1: number;
  bm25B: number;
  seedCount: number;
  poolSize: number;
}

export interface R212CandidatePoolItem {
  runtimeItemId: string;
  baseRank: number;
  baseScore: number;
  selectionReason: "bm25_seed" | "declared_group_neighbor" | "bm25_fill";
}

const STOP = new Set(
  "what which when where why how should does apply applied and the for with from into about while that this are was were have has can may who whose without within current guidance recommendation evidence intake activity adults children population health".split(
    " ",
  ),
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

export function generateR212CandidatePool(
  queryText: string,
  candidates: readonly R212RoleNeutralCandidate[],
  config: R212CandidateGeneratorConfig,
): R212CandidatePoolItem[] {
  if (config.seedCount > config.poolSize) {
    throw new Error("seedCount cannot exceed poolSize");
  }
  const docs = candidates.map((candidate) => words(candidate.text));
  const lengths = docs.map((tokens) => tokens.length);
  const averageLength =
    lengths.reduce((sum, length) => sum + length, 0) /
    Math.max(1, lengths.length);
  const documentFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const queryTerms = words(queryText);
  const ranked = candidates
    .map((candidate, index) => {
      const termFrequency = new Map<string, number>();
      for (const term of docs[index]) {
        termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
      }
      let score = 0;
      for (const term of queryTerms) {
        const count = termFrequency.get(term) ?? 0;
        if (count === 0) continue;
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(
          (candidates.length - df + 0.5) / (df + 0.5) + 1,
        );
        score +=
          idf *
          ((count * (config.bm25K1 + 1)) /
            (count +
              config.bm25K1 *
                (1 -
                  config.bm25B +
                  (config.bm25B * lengths[index]) / averageLength)));
      }
      return { candidate, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.runtimeItemId.localeCompare(
          right.candidate.runtimeItemId,
        ),
    );
  const rankById = new Map(
    ranked.map((entry, index) => [
      entry.candidate.runtimeItemId,
      { rank: index + 1, score: entry.score },
    ]),
  );
  const selected: Array<{
    candidate: R212RoleNeutralCandidate;
    reason: R212CandidatePoolItem["selectionReason"];
  }> = ranked.slice(0, config.seedCount).map((entry) => ({
      candidate: entry.candidate,
      reason: "bm25_seed" as const,
    }));
  const selectedIds = new Set(
    selected.map((entry) => entry.candidate.runtimeItemId),
  );
  const seedGroups = new Set(
    selected.flatMap((entry) => entry.candidate.candidateGroupIds),
  );
  for (const entry of ranked) {
    if (selected.length >= config.poolSize) break;
    if (
      !selectedIds.has(entry.candidate.runtimeItemId) &&
      entry.candidate.candidateGroupIds.some((group) => seedGroups.has(group))
    ) {
      selected.push({
        candidate: entry.candidate,
        reason: "declared_group_neighbor",
      });
      selectedIds.add(entry.candidate.runtimeItemId);
    }
  }
  for (const entry of ranked) {
    if (selected.length >= config.poolSize) break;
    if (!selectedIds.has(entry.candidate.runtimeItemId)) {
      selected.push({ candidate: entry.candidate, reason: "bm25_fill" });
      selectedIds.add(entry.candidate.runtimeItemId);
    }
  }
  return selected.map((entry) => {
    const base = rankById.get(entry.candidate.runtimeItemId)!;
    return {
      runtimeItemId: entry.candidate.runtimeItemId,
      baseRank: base.rank,
      baseScore: base.score,
      selectionReason: entry.reason,
    };
  });
}
