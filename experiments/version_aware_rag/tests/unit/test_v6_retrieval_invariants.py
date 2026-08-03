import sys
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts" / "v6"
sys.path.insert(0, str(SCRIPTS))

from v6_retrieval_core import BM25Index, RetrievalPolicy, build_pair_neighbors, explicit_history_router, rank_systems


def chunk(chunk_id: str, text: str, year: int) -> dict:
    return {"chunk_id": chunk_id, "text": text, "published_year": year}


class V6RetrievalInvariantTests(unittest.TestCase):
    def setUp(self):
        self.chunks = [
            chunk("old", "historical zinc pregnancy evidence retained", 2016),
            chunk("current", "operative zinc pregnancy evidence update", 2021),
            chunk("noise", "unrelated school policy", 2026),
        ]
        self.policy = RetrievalPolicy(candidate_pool_size=3)
        self.neighbors = build_pair_neighbors([{"pairing_eligible": True, "older": {"chunk_id": "old"}, "current": {"chunk_id": "current"}}])

    def test_router_is_frozen_v5_rule(self):
        self.assertTrue(explicit_history_router("Compare the earlier and operative zinc guidance"))
        self.assertFalse(explicit_history_router("What does the operative zinc guidance require?"))

    def test_all_systems_share_exact_candidate_order(self):
        candidates = BM25Index(self.chunks).candidates("zinc pregnancy evidence", 3)
        systems = rank_systems("What does the operative guidance require?", candidates, self.neighbors, self.policy)
        expected = [item["chunk_id"] for item in candidates]
        for rows in systems.values():
            self.assertEqual(expected, [item["chunk_id"] for item in sorted(rows, key=lambda x: x["candidate_rank"])])

    def test_untriggered_e_is_identical_to_b(self):
        candidates = BM25Index(self.chunks).candidates("zinc pregnancy evidence", 3)
        systems = rank_systems("What does the operative zinc guidance require?", candidates, self.neighbors, self.policy)
        self.assertEqual([(x["chunk_id"], x["final_score"]) for x in systems["B"]], [(x["chunk_id"], x["final_score"]) for x in systems["E"]])

    def test_c_and_f_are_definitionally_identical(self):
        candidates = BM25Index(self.chunks).candidates("zinc pregnancy evidence", 3)
        for query in ("Compare the earlier zinc guidance", "What is current zinc guidance?"):
            systems = rank_systems(query, candidates, self.neighbors, self.policy)
            self.assertEqual([(x["chunk_id"], x["final_score"]) for x in systems["C"]], [(x["chunk_id"], x["final_score"]) for x in systems["F"]])

    def test_explicit_e_disables_recency_and_applies_pair_boost(self):
        candidates = BM25Index(self.chunks).candidates("zinc pregnancy evidence", 3)
        systems = rank_systems("Compare the earlier zinc pregnancy evidence", candidates, self.neighbors, self.policy)
        pair_rows = [row for row in systems["E"] if row["chunk_id"] in {"old", "current"}]
        self.assertTrue(all(row["pair_boost"] == self.policy.pair_boost for row in pair_rows))
        self.assertTrue(all(row["final_score"] == row["base_norm"] + row["pair_boost"] for row in systems["E"]))

    def test_wrong_seed_does_not_boost_zero_score_mate(self):
        chunks = [chunk("wrong-seed", "banana banana banana", 2020), chunk("wrong-mate", "unrelated evidence", 2024), chunk("other", "banana", 2026)]
        candidates = BM25Index(chunks).candidates("banana", 3)
        neighbors = {"wrong-seed": {"wrong-mate"}, "wrong-mate": {"wrong-seed"}}
        systems = rank_systems("Compare the earlier banana rule", candidates, neighbors, self.policy)
        self.assertTrue(all(row["pair_boost"] == 0 for row in systems["E"]))

    def test_ties_break_by_chunk_id(self):
        candidates = [
            {"chunk_id": "b", "raw_bm25": 1.0, "chunk": chunk("b", "same", 2020)},
            {"chunk_id": "a", "raw_bm25": 1.0, "chunk": chunk("a", "same", 2020)},
        ]
        systems = rank_systems("current", candidates, {}, self.policy)
        self.assertEqual(["a", "b"], [row["chunk_id"] for row in systems["A"]])


if __name__ == "__main__":
    unittest.main()
