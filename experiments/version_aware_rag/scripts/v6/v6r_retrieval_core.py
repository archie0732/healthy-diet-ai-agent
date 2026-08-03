#!/usr/bin/env python3
"""Corrected, post-hoc V6-R retrieval primitives.

This module is intentionally separate from the frozen V6 implementation.  It is
development code for diagnosing the treatment that V6 failed to deliver.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter


TOKEN_RE = re.compile(r"[a-z0-9]+")
# Match the tokenizer used to choose the V6 boost on V5 dev/validation.
STOPWORDS = set("what are the and for daily serving goals consuming recommendation intake limit limitations rule should with this that from about how many of is a in or to current historical historically was were which does do did it its".split())
RELATION_STOPWORDS = STOPWORDS | set("who earlier operative guidance document documents position positions previously stated state states compare compared changed change retained version specific differences reported report audit describe former formerly moving move governed relative across requirement requirements during says said update updates explicitly remarks rationale be their".split())
HISTORY_PATTERNS = (
    re.compile(r"\b2003\b", re.I), re.compile(r"\bhistorical(?:ly)?\b", re.I),
    re.compile(r"\bprevious(?:ly)?\b", re.I), re.compile(r"\bearlier\b", re.I),
    re.compile(r"\bformer(?:ly)?\b", re.I),
    re.compile(r"\bhow did\b.{0,100}\bchange\b", re.I),
    re.compile(r"\bfrom\b.{0,100}\bto (?:the )?current\b", re.I),
)


def tokenize(text: str) -> list[str]:
    return [t for t in TOKEN_RE.findall(text.lower()) if len(t) > 2 and t not in STOPWORDS]


def relation_tokenize(text: str) -> list[str]:
    """Content-focused tokens plus order-sensitive bigrams for lineage lookup."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    raw = [t for t in TOKEN_RE.findall(ascii_text.lower()) if t not in RELATION_STOPWORDS]
    raw = [t[:-1] if len(t) > 3 and t.endswith("s") and not t.endswith("ss") else t for t in raw]
    raw = ["neg" if t in {"no", "without"} else t for t in raw]
    return raw + [f"{a}_{b}" for a, b in zip(raw, raw[1:])]


def explicit_history_router(query: str) -> bool:
    return any(pattern.search(query) for pattern in HISTORY_PATTERNS)


class BM25Index:
    def __init__(self, chunks: list[dict], k1: float = 1.2, b: float = 0.75, tokenizer_fn=tokenize):
        self.chunks, self.k1, self.b = chunks, k1, b
        self.tokenizer_fn = tokenizer_fn
        self.tokens = {c["chunk_id"]: tokenizer_fn(c["text"]) for c in chunks}
        self.tf = {cid: Counter(ts) for cid, ts in self.tokens.items()}
        self.length = {cid: len(ts) for cid, ts in self.tokens.items()}
        self.avgdl = sum(self.length.values()) / len(chunks)
        df = Counter()
        for ts in self.tokens.values():
            df.update(set(ts))
        n = len(chunks)
        self.idf = {t: math.log((n - f + .5) / (f + .5) + 1) for t, f in df.items()}

    def candidates(self, query: str, top_k: int) -> list[dict]:
        terms, out = self.tokenizer_fn(query), []
        for chunk in self.chunks:
            cid, score = chunk["chunk_id"], 0.0
            for term in terms:
                tf = self.tf[cid].get(term, 0)
                if tf:
                    den = tf + self.k1 * (1 - self.b + self.b * self.length[cid] / self.avgdl)
                    score += self.idf.get(term, 0) * tf * (self.k1 + 1) / den
            out.append({"chunk_id": cid, "raw_bm25": score, "chunk": chunk})
        return sorted(out, key=lambda x: (-x["raw_bm25"], x["chunk_id"]))[:top_k]


class RelationEnrichedCandidateGenerator:
    """Shared candidate generator that reserves complete graph-linked pairs.

    A relation is retrieved from a pseudo-document containing both endpoint
    passages and auditable relation metadata.  Its two endpoints are reserved in
    the common pool; remaining slots are filled by ordinary passage BM25.
    Gold labels are never read by this component.
    """
    def __init__(self, chunks: list[dict], relations: list[dict], reserve_pairs: int = 2):
        self.passage_index = BM25Index(chunks)
        self.by_id = {c["chunk_id"]: c for c in chunks}
        self.relations = {r["candidate_id"]: r for r in relations if r.get("pairing_eligible") and r.get("older") and r.get("current")}
        self.relation_descriptor_tokens = {}
        pseudo = []
        for rid, relation in self.relations.items():
            identity = " ".join((rid, relation.get("lineage_id", ""), relation.get("family", ""),
                                 relation.get("relation_type", ""), " ".join(relation.get("relation_facets", []))))
            # These identifiers/facets were created and audited before the
            # queries.  Weighting them prevents long multi-recommendation page
            # chunks from drowning the actual lineage identity.
            pieces = [identity, identity, identity, identity]
            # The auditable relation basis is the most discriminative compact
            # description (full endpoint chunks often contain several nearby
            # recommendations).  Repeat it as a fixed field weight.
            basis = relation.get("relation_evidence", {}).get("basis", "")
            pieces.extend([basis, basis, basis])
            for role in ("older", "current"):
                endpoint = relation[role]
                source = endpoint.get("source_ref", {})
                pieces.append(" ".join((str(source.get("document_id") or ""),
                                        str(source.get("recommendation_id") or ""))))
            pseudo.append({"chunk_id": rid, "text": "\n".join(pieces), "published_year": 0})
            self.relation_descriptor_tokens[rid] = set(relation_tokenize(" ".join((identity, basis))))
        self.relation_index = BM25Index(pseudo, tokenizer_fn=relation_tokenize) if pseudo else None
        self.reserve_pairs = reserve_pairs

    def candidates(self, query: str, top_k: int) -> list[dict]:
        full = self.passage_index.candidates(query, len(self.by_id))
        by_id = {x["chunk_id"]: x for x in full}
        relation_hits = self.relation_index.candidates(query, len(self.relations)) if self.relation_index else []
        query_tokens = set(relation_tokenize(query))
        # Only penalize the explicit `not-first` lineage when the query does
        # not contain `not`.  Broad no/without penalties corrupt clinical
        # labels such as "any anaemia" whose evidence discusses "no anaemia".
        negation = {"not"}
        rescored = []
        for hit in relation_hits:
            descriptor = self.relation_descriptor_tokens[hit["chunk_id"]]
            multiplier = 1.0
            if descriptor & negation and not query_tokens & negation:
                multiplier *= 0.65
            elif descriptor & negation and query_tokens & negation:
                multiplier *= 1.15
            if "neg" in query_tokens and "neg" in descriptor:
                multiplier *= 1.15
            rescored.append({**hit, "raw_bm25": hit["raw_bm25"] * multiplier})
        relation_hits = sorted(rescored, key=lambda x: (-x["raw_bm25"], x["chunk_id"]))[:self.reserve_pairs]
        reserved: dict[str, dict] = {}
        for hit in relation_hits:
            if hit["raw_bm25"] <= 0:
                continue
            relation = self.relations[hit["chunk_id"]]
            for role in ("older", "current"):
                endpoint = relation[role]
                ids = [cid for cid in endpoint.get("chunk_ids", [endpoint["chunk_id"]]) if cid in by_id]
                chosen = sorted((by_id[cid] for cid in ids), key=lambda x: (-x["raw_bm25"], x["chunk_id"]))[0]
                enriched = {**chosen, "relation_retrieval_score": hit["raw_bm25"],
                            "relation_retrieval_id": relation["candidate_id"]}
                prior = reserved.get(chosen["chunk_id"])
                if not prior or enriched["relation_retrieval_score"] > prior["relation_retrieval_score"]:
                    reserved[chosen["chunk_id"]] = enriched
        pool = list(reserved.values())
        for item in full:
            if item["chunk_id"] not in reserved:
                pool.append({**item, "relation_retrieval_score": 0.0, "relation_retrieval_id": None})
            if len(pool) == top_k:
                break
        # Candidate rank is deterministic shared-generator order.  Downstream
        # systems still score BM25/recency/pair components independently.
        return pool[:top_k]


def select_best_relation_pair(candidates: list[dict], relations: list[dict]) -> dict | None:
    """Select the strongest complete relation in-pool, without using query gold.

    Each endpoint may contain several boundary-overlapping chunk aliases.  The
    best positive-BM25 member on each side represents that endpoint.  Relations
    are ranked by summed raw BM25, then deterministically by relation id.
    """
    pool = {x["chunk_id"]: x for x in candidates}
    choices = []
    for relation in relations:
        if not relation.get("pairing_eligible"):
            continue
        sides = []
        for role in ("older", "current"):
            ids = relation[role].get("chunk_ids", [relation[role]["chunk_id"]])
            hits = [pool[cid] for cid in ids if cid in pool and
                    max(pool[cid]["raw_bm25"], pool[cid].get("relation_retrieval_score", 0.0)) > 0]
            if not hits:
                break
            sides.append(sorted(hits, key=lambda x: (-x["raw_bm25"], x["chunk_id"]))[0])
        if len(sides) == 2:
            associated = all(x.get("relation_retrieval_id") == relation["candidate_id"] for x in sides)
            if associated:
                # Preserve the identity of the relation retrieved by the
                # relation index; raw passage scores from a neighbouring
                # recommendation must not hijack its reserved endpoints.
                signal = sum(x.get("relation_retrieval_score", 0.0) for x in sides)
            else:
                signal = sum(x["raw_bm25"] for x in sides)
            choices.append((-int(associated), -signal, relation["candidate_id"], sides))
    if not choices:
        return None
    _, _, relation_id, sides = sorted(choices, key=lambda x: (x[0], x[1], x[2]))[0]
    return {"candidate_id": relation_id, "chunk_ids": [x["chunk_id"] for x in sides],
            "raw_bm25_sum": sum(x["raw_bm25"] for x in sides)}


def rank_systems(query: str, candidates: list[dict], relations: list[dict], pair_boost: float,
                 recency_lambda: float = .75, corpus_min_year: int = 2005,
                 corpus_max_year: int = 2026) -> tuple[dict[str, list[dict]], dict | None]:
    max_base = max(x["raw_bm25"] for x in candidates)
    min_base = min(x["raw_bm25"] for x in candidates)
    base_range = max_base - min_base
    year_range = corpus_max_year - corpus_min_year
    triggered = explicit_history_router(query)
    selected_pair = select_best_relation_pair(candidates, relations)
    pair_ids = set(selected_pair["chunk_ids"]) if selected_pair else set()
    rows = []
    for rank, item in enumerate(candidates, 1):
        base = (item["raw_bm25"] - min_base) / base_range if base_range else 0
        recency = (item["chunk"]["published_year"] - corpus_min_year) / year_range if year_range else 0
        rows.append({"chunk_id": item["chunk_id"], "candidate_rank": rank,
                     "raw_bm25": item["raw_bm25"], "base_norm": base,
                     "recency_norm": recency, "recency_component": recency_lambda * recency,
                     "pair_boost": pair_boost if item["chunk_id"] in pair_ids else 0,
                     "router_explicit_history": triggered})

    def order(system: str) -> list[dict]:
        ranked = []
        for row in rows:
            if system == "A": final = row["base_norm"]
            elif system == "B": final = row["base_norm"] + row["recency_component"]
            elif system in ("C", "F"): final = row["base_norm"] if triggered else row["base_norm"] + row["recency_component"]
            elif system == "D": final = row["base_norm"] + row["recency_component"] + row["pair_boost"]
            elif system == "E": final = row["base_norm"] + row["pair_boost"] if triggered else row["base_norm"] + row["recency_component"]
            ranked.append({**row, "system": system, "final_score": final})
        ranked.sort(key=lambda x: (-x["final_score"], x["chunk_id"]))
        return [{**x, "final_rank": i} for i, x in enumerate(ranked, 1)]
    return {s: order(s) for s in "ABCDEF"}, selected_pair
