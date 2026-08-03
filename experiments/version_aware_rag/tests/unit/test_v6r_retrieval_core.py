#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts" / "v6"
sys.path.insert(0, str(SCRIPTS))

from v6r_retrieval_core import RelationEnrichedCandidateGenerator, explicit_history_router, rank_systems, relation_tokenize, select_best_relation_pair


def candidate(cid, score, year=2015):
    return {"chunk_id": cid, "raw_bm25": score,
            "chunk": {"chunk_id": cid, "published_year": year}}


class V6RCoreTests(unittest.TestCase):
    def setUp(self):
        self.relations = [{"candidate_id": "rel", "lineage_id": "historic-sodium-threshold",
                           "family": "sodium", "relation_type": "updates", "pairing_eligible": True,
                           "older": {"chunk_id": "old", "chunk_ids": ["old", "old-alias"]},
                           "current": {"chunk_id": "new", "chunk_ids": ["new"]}}]

    def test_former_routes_as_explicit_history(self):
        self.assertTrue(explicit_history_router("Compare the former and operative recommendations"))

    def test_pair_does_not_require_global_top1_endpoint(self):
        pool = [candidate("distractor", 10), candidate("old-alias", 5), candidate("new", 4)]
        pair = select_best_relation_pair(pool, self.relations)
        self.assertEqual(pair["chunk_ids"], ["old-alias", "new"])

    def test_pair_requires_both_positive_endpoints(self):
        pool = [candidate("old", 5), candidate("new", 0)]
        self.assertIsNone(select_best_relation_pair(pool, self.relations))

    def test_design_invariants(self):
        pool = [candidate("old", 5, 2013), candidate("new", 4, 2023), candidate("x", 3, 2020)]
        systems, _ = rank_systems("a current-only question", pool, self.relations, .5)
        self.assertEqual([x["chunk_id"] for x in systems["E"]], [x["chunk_id"] for x in systems["B"]])
        self.assertEqual([x["chunk_id"] for x in systems["C"]], [x["chunk_id"] for x in systems["F"]])

    def test_relation_enriched_pool_reserves_mate(self):
        chunks = [{"chunk_id": "old", "text": "historic sodium threshold", "published_year": 2013},
                  {"chunk_id": "new", "text": "operative replacement", "published_year": 2023},
                  {"chunk_id": "x", "text": "historic sodium discussion", "published_year": 2020}]
        generator = RelationEnrichedCandidateGenerator(chunks, self.relations, reserve_pairs=1)
        ids = [x["chunk_id"] for x in generator.candidates("historic sodium threshold", 2)]
        self.assertEqual(set(ids), {"old", "new"})

    def test_relation_tokens_normalize_accents_plural_and_no_without(self):
        self.assertIn("vegetable_puree", relation_tokenize("vegetable purées"))
        self.assertEqual(relation_tokenize("no protein"), relation_tokenize("without protein"))


if __name__ == "__main__":
    unittest.main()
