#!/usr/bin/env python3
"""Pure deterministic retrieval primitives for the V6 A-F systems."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass


TOKEN_RE = re.compile(r"[a-z0-9]+")
STOPWORDS = {
    "what", "are", "the", "and", "for", "daily", "serving", "goals", "consuming",
    "recommendation", "recommendations", "intake", "limit", "limitations", "rule", "should",
    "with", "this", "that", "from", "about", "how", "many", "of", "is", "a", "in", "or", "to",
}
HISTORY_PATTERNS = (
    re.compile(r"\b2003\b", re.I),
    re.compile(r"\bhistorical(?:ly)?\b", re.I),
    re.compile(r"\bprevious(?:ly)?\b", re.I),
    re.compile(r"\bearlier\b", re.I),
    re.compile(r"\bformerly\b", re.I),
    re.compile(r"\bhow did\b.{0,100}\bchange\b", re.I),
    re.compile(r"\bfrom\b.{0,100}\bto (?:the )?current\b", re.I),
)


def tokenize(text: str) -> list[str]:
    return [token for token in TOKEN_RE.findall(text.lower()) if len(token) > 2 and token not in STOPWORDS]


def explicit_history_router(query: str) -> bool:
    return any(pattern.search(query) for pattern in HISTORY_PATTERNS)


@dataclass(frozen=True)
class RetrievalPolicy:
    bm25_k1: float = 1.2
    bm25_b: float = 0.75
    candidate_pool_size: int = 20
    output_k: int = 3
    recency_lambda: float = 0.75
    pair_boost: float = 0.5
    minimum_pair_mate_raw_bm25: float = 0.0  # strict greater-than gate


class BM25Index:
    def __init__(self, chunks: list[dict], k1: float = 1.2, b: float = 0.75):
        self.chunks = chunks
        self.k1 = k1
        self.b = b
        self.tokens = {chunk["chunk_id"]: tokenize(chunk["text"]) for chunk in chunks}
        self.tf = {chunk_id: Counter(values) for chunk_id, values in self.tokens.items()}
        self.length = {chunk_id: len(values) for chunk_id, values in self.tokens.items()}
        self.avgdl = sum(self.length.values()) / len(chunks) if chunks else 0.0
        df = Counter()
        for values in self.tokens.values():
            df.update(set(values))
        n = len(chunks)
        self.idf = {term: math.log((n - count + 0.5) / (count + 0.5) + 1.0) for term, count in df.items()}

    def candidates(self, query: str, top_k: int) -> list[dict]:
        query_terms = tokenize(query)
        scored = []
        for chunk in self.chunks:
            chunk_id = chunk["chunk_id"]
            score = 0.0
            for term in query_terms:
                tf = self.tf[chunk_id].get(term, 0)
                if not tf:
                    continue
                denominator = tf + self.k1 * (1 - self.b + self.b * self.length[chunk_id] / self.avgdl)
                score += self.idf.get(term, 0.0) * tf * (self.k1 + 1) / denominator
            scored.append({"chunk_id": chunk_id, "raw_bm25": score, "chunk": chunk})
        scored.sort(key=lambda item: (-item["raw_bm25"], item["chunk_id"]))
        return scored[:top_k]


def build_pair_neighbors(relations: list[dict]) -> dict[str, set[str]]:
    neighbors: dict[str, set[str]] = defaultdict(set)
    for relation in relations:
        if not relation.get("pairing_eligible"):
            continue
        old_id = relation["older"]["chunk_id"]
        current_id = relation["current"]["chunk_id"]
        neighbors[old_id].add(current_id)
        neighbors[current_id].add(old_id)
    return dict(neighbors)


def rank_systems(query: str, candidates: list[dict], pair_neighbors: dict[str, set[str]], policy: RetrievalPolicy) -> dict[str, list[dict]]:
    if not candidates:
        return {system: [] for system in "ABCDEF"}
    max_base = max(item["raw_bm25"] for item in candidates)
    min_base = min(item["raw_bm25"] for item in candidates)
    base_range = max_base - min_base
    years = [item["chunk"]["published_year"] for item in candidates]
    min_year, max_year = min(years), max(years)
    year_range = max_year - min_year
    triggered = explicit_history_router(query)
    seed = candidates[0]
    pool_by_id = {item["chunk_id"]: item for item in candidates}
    eligible_mates = {
        mate for mate in pair_neighbors.get(seed["chunk_id"], set())
        if mate in pool_by_id and pool_by_id[mate]["raw_bm25"] > policy.minimum_pair_mate_raw_bm25
    }
    pair_ids = ({seed["chunk_id"]} | eligible_mates) if eligible_mates else set()

    rows = []
    for rank, item in enumerate(candidates, start=1):
        base_norm = (item["raw_bm25"] - min_base) / base_range if base_range > 0 else 0.0
        recency_norm = (item["chunk"]["published_year"] - min_year) / year_range if year_range > 0 else 0.0
        pair_component = policy.pair_boost if item["chunk_id"] in pair_ids else 0.0
        recency_score = base_norm + policy.recency_lambda * recency_norm
        rows.append({
            "chunk_id": item["chunk_id"],
            "candidate_rank": rank,
            "raw_bm25": item["raw_bm25"],
            "base_norm": base_norm,
            "recency_norm": recency_norm,
            "recency_component": policy.recency_lambda * recency_norm,
            "pair_boost": pair_component,
            "router_explicit_history": triggered,
        })

    def ordered(system: str) -> list[dict]:
        result = []
        for row in rows:
            if system == "A":
                final = row["base_norm"]
            elif system == "B":
                final = row["base_norm"] + row["recency_component"]
            elif system in ("C", "F"):
                final = row["base_norm"] if triggered else row["base_norm"] + row["recency_component"]
            elif system == "D":
                final = row["base_norm"] + row["recency_component"] + row["pair_boost"]
            elif system == "E":
                final = row["base_norm"] + row["pair_boost"] if triggered else row["base_norm"] + row["recency_component"]
            else:
                raise ValueError(system)
            result.append({**row, "system": system, "final_score": final})
        result.sort(key=lambda item: (-item["final_score"], item["chunk_id"]))
        return [{**item, "final_rank": index + 1} for index, item in enumerate(result)]

    return {system: ordered(system) for system in "ABCDEF"}
