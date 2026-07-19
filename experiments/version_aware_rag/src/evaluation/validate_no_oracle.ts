import { Retriever, RetrievalContext } from '../retrieval/types';

/**
 * Verifies that the retriever does not depend on gold judgments (no-oracle property).
 * Retrieves chunk IDs for a query, modifies a mock judgment representation,
 * and asserts that the retrieved chunk IDs remain exactly identical.
 */
export async function verifyNoOracle(
  retriever: Retriever,
  queryContext: RetrievalContext,
  topK: number,
  modifyJudgmentsFn: () => void
): Promise<boolean> {
  // 1. Retrieve first time
  const results1 = await retriever.retrieve(queryContext, topK);
  const ids1 = results1.map(r => r.chunkId);

  // 2. Mutate judgments (this callback changes any potential global/shared judgment files or states)
  modifyJudgmentsFn();

  // 3. Retrieve second time
  const results2 = await retriever.retrieve(queryContext, topK);
  const ids2 = results2.map(r => r.chunkId);

  // 4. Assert that retrieved IDs are identical
  if (ids1.length !== ids2.length) {
    return false;
  }
  for (let i = 0; i < ids1.length; i++) {
    if (ids1[i] !== ids2[i]) {
      return false;
    }
  }

  return true;
}
