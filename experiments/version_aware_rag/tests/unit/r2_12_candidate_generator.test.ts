import { describe, expect, test } from "bun:test";
import {
  generateR212CandidatePool,
  type R212RoleNeutralCandidate,
} from "../../src/retrieval/r2_12_candidate_generator";

const config = { bm25K1: 1.2, bm25B: 0.75, seedCount: 2, poolSize: 4 };
const candidates: R212RoleNeutralCandidate[] = [
  {
    runtimeItemId: "a",
    text: "sodium population intervention labelling education",
    candidateGroupIds: ["group-1"],
  },
  {
    runtimeItemId: "b",
    text: "potassium substitute implementation feasibility",
    candidateGroupIds: ["group-1"],
  },
  {
    runtimeItemId: "c",
    text: "sodium intake public health programme",
    candidateGroupIds: ["group-2"],
  },
  {
    runtimeItemId: "d",
    text: "unrelated carbohydrate guidance",
    candidateGroupIds: ["group-3"],
  },
  {
    runtimeItemId: "e",
    text: "unrelated physical exercise",
    candidateGroupIds: ["group-4"],
  },
];

describe("R2.12 candidate generator", () => {
  test("adds declared group neighbors after the frozen BM25 seed", () => {
    const pool = generateR212CandidatePool(
      "Which sodium population programme should be used?",
      candidates,
      config,
    );
    expect(pool).toHaveLength(4);
    expect(pool.slice(0, 2).every((item) => item.selectionReason === "bm25_seed"))
      .toBe(true);
    expect(
      pool.some(
        (item) =>
          item.runtimeItemId === "b" &&
          item.selectionReason === "declared_group_neighbor",
      ),
    ).toBe(true);
  });

  test("ignores forbidden metadata and outcome fields", () => {
    const contaminated = candidates.map((candidate, index) => ({
      ...candidate,
      query_id: `q-${index}`,
      stratum: "conditional_merge",
      required_role: index === 1,
      prior_outcome: index * 100,
    }));
    const clean = generateR212CandidatePool("sodium programme", candidates, config);
    const dirty = generateR212CandidatePool(
      "sodium programme",
      contaminated,
      config,
    );
    expect(dirty).toEqual(clean);
  });

  test("is deterministic and rejects an invalid seed budget", () => {
    const first = generateR212CandidatePool("sodium programme", candidates, config);
    const second = generateR212CandidatePool("sodium programme", candidates, config);
    expect(second).toEqual(first);
    expect(() =>
      generateR212CandidatePool("sodium", candidates, {
        ...config,
        seedCount: 5,
        poolSize: 4,
      }),
    ).toThrow("seedCount cannot exceed poolSize");
  });
});
