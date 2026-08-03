#!/usr/bin/env python3
"""Allocate 96 V6 query slots under lineage and topic-family constraints."""

from __future__ import annotations

import collections
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
CONFIRMATORY_DIR = EXPERIMENT_ROOT / "data" / "v6_confirmatory"
CONSENSUS_PATH = CONFIRMATORY_DIR / "V6_RELATION_CONSENSUS_LEDGER.jsonl"
OUTPUT_PATH = CONFIRMATORY_DIR / "V6_QUERY_ALLOCATION_PLAN.jsonl"
MANIFEST_PATH = CONFIRMATORY_DIR / "V6_QUERY_ALLOCATION_MANIFEST.json"
MAIN_STRATA = (
    "explicit_history",
    "conditional_merge",
    "current_only",
    "hard_negative_current",
)
TARGET_PER_STRATUM = 24
FAMILY_CAP_PER_STRATUM = 6
MAX_QUERIES_PER_LINEAGE = 2
MINIMUM_UNIQUE_LINEAGES = 60


@dataclass
class Edge:
    to: int
    rev: int
    capacity: int
    cost: int


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def add_edge(graph: list[list[Edge]], source: int, target: int, capacity: int, cost: int) -> Edge:
    forward = Edge(target, len(graph[target]), capacity, cost)
    reverse = Edge(source, len(graph[source]), 0, -cost)
    graph[source].append(forward)
    graph[target].append(reverse)
    return forward


def min_cost_flow(graph: list[list[Edge]], source: int, sink: int, target_flow: int) -> tuple[int, int]:
    flow = 0
    total_cost = 0
    node_count = len(graph)
    while flow < target_flow:
        distance = [10**18] * node_count
        parent: list[tuple[int, int] | None] = [None] * node_count
        in_queue = [False] * node_count
        queue = collections.deque([source])
        distance[source] = 0
        in_queue[source] = True
        while queue:
            node = queue.popleft()
            in_queue[node] = False
            for edge_index, edge in enumerate(graph[node]):
                if edge.capacity <= 0:
                    continue
                candidate_distance = distance[node] + edge.cost
                if candidate_distance >= distance[edge.to]:
                    continue
                distance[edge.to] = candidate_distance
                parent[edge.to] = (node, edge_index)
                if not in_queue[edge.to]:
                    queue.append(edge.to)
                    in_queue[edge.to] = True
        if parent[sink] is None:
            break
        augmentation = target_flow - flow
        node = sink
        while node != source:
            previous, edge_index = parent[node]
            augmentation = min(augmentation, graph[previous][edge_index].capacity)
            node = previous
        node = sink
        while node != source:
            previous, edge_index = parent[node]
            edge = graph[previous][edge_index]
            edge.capacity -= augmentation
            graph[node][edge.rev].capacity += augmentation
            total_cost += augmentation * edge.cost
            node = previous
        flow += augmentation
    return flow, total_cost


def main() -> None:
    approved = [
        record for record in load_jsonl(CONSENSUS_PATH) if record["status"] == "approved"
    ]
    node_ids: dict[str, int] = {}

    def node(name: str) -> int:
        if name not in node_ids:
            node_ids[name] = len(node_ids)
        return node_ids[name]

    source = node("source")
    sink = node("sink")
    for record in approved:
        node(f"candidate:{record['candidate_id']}")
        for stratum in MAIN_STRATA:
            if stratum in record["approved_strata"]:
                node(f"choice:{record['candidate_id']}:{stratum}")
                node(f"family:{stratum}:{record['family']}")
                node(f"stratum:{stratum}")
    graph: list[list[Edge]] = [[] for _ in node_ids]
    selection_edges: dict[tuple[str, str], Edge] = {}

    for record in approved:
        candidate_node = node_ids[f"candidate:{record['candidate_id']}"]
        add_edge(graph, source, candidate_node, 1, -1000)
        add_edge(graph, source, candidate_node, 1, 0)
        for stratum in MAIN_STRATA:
            if stratum not in record["approved_strata"]:
                continue
            choice_node = node_ids[f"choice:{record['candidate_id']}:{stratum}"]
            family_node = node_ids[f"family:{stratum}:{record['family']}"]
            selection_edges[(record["candidate_id"], stratum)] = add_edge(
                graph, candidate_node, choice_node, 1, 0
            )
            add_edge(graph, choice_node, family_node, 1, 0)

    family_nodes_added = set()
    for record in approved:
        for stratum in MAIN_STRATA:
            if stratum not in record["approved_strata"]:
                continue
            key = (stratum, record["family"])
            if key in family_nodes_added:
                continue
            family_nodes_added.add(key)
            add_edge(
                graph,
                node_ids[f"family:{stratum}:{record['family']}"],
                node_ids[f"stratum:{stratum}"],
                FAMILY_CAP_PER_STRATUM,
                0,
            )
    for stratum in MAIN_STRATA:
        add_edge(
            graph,
            node_ids[f"stratum:{stratum}"],
            sink,
            TARGET_PER_STRATUM,
            0,
        )

    requested_flow = TARGET_PER_STRATUM * len(MAIN_STRATA)
    achieved_flow, _ = min_cost_flow(graph, source, sink, requested_flow)
    if achieved_flow != requested_flow:
        partial_stratum_counts = {}
        for stratum in MAIN_STRATA:
            stratum_node = node_ids[f"stratum:{stratum}"]
            sink_edges = [edge for edge in graph[stratum_node] if edge.to == sink]
            partial_stratum_counts[stratum] = TARGET_PER_STRATUM - sink_edges[0].capacity
        raise RuntimeError(
            f"Only allocated {achieved_flow}/{requested_flow} query slots; "
            f"partial stratum counts={partial_stratum_counts}"
        )

    candidate_lookup = {record["candidate_id"]: record for record in approved}
    selected = [
        (candidate_lookup[candidate_id], stratum)
        for (candidate_id, stratum), edge in selection_edges.items()
        if edge.capacity == 0
    ]
    selected.sort(key=lambda item: (MAIN_STRATA.index(item[1]), item[0]["family"], item[0]["candidate_id"]))
    counters = collections.Counter()
    allocation = []
    short_names = {
        "explicit_history": "eh",
        "conditional_merge": "cm",
        "current_only": "co",
        "hard_negative_current": "hn",
    }
    for record, stratum in selected:
        counters[stratum] += 1
        allocation.append(
            {
                "schema_version": "v6-query-allocation-plan-1",
                "query_id": f"v6q-{short_names[stratum]}-{counters[stratum]:03d}",
                "stratum": stratum,
                "candidate_id": record["candidate_id"],
                "lineage_id": record["lineage_id"],
                "family": record["family"],
                "relation_type": record["relation_type"],
                "status": "allocated_for_query_construction",
            }
        )

    lineage_counts = collections.Counter(item["lineage_id"] for item in allocation)
    family_counts = {
        stratum: dict(
            sorted(
                collections.Counter(
                    item["family"] for item in allocation if item["stratum"] == stratum
                ).items()
            )
        )
        for stratum in MAIN_STRATA
    }
    if any(count != TARGET_PER_STRATUM for count in counters.values()):
        raise RuntimeError(f"Unbalanced stratum counts: {dict(counters)}")
    if max(lineage_counts.values()) > MAX_QUERIES_PER_LINEAGE:
        raise RuntimeError("Lineage query cap exceeded")
    if len(lineage_counts) < MINIMUM_UNIQUE_LINEAGES:
        raise RuntimeError("Unique-lineage minimum not met")
    if any(
        count > FAMILY_CAP_PER_STRATUM
        for counts in family_counts.values()
        for count in counts.values()
    ):
        raise RuntimeError("Topic-family cap exceeded")

    OUTPUT_PATH.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in allocation),
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-query-allocation-manifest-1",
        "allocation_count": len(allocation),
        "stratum_counts": dict(sorted(counters.items())),
        "unique_lineage_count": len(lineage_counts),
        "lineages_used_twice": sum(count == 2 for count in lineage_counts.values()),
        "maximum_queries_per_lineage": max(lineage_counts.values()),
        "family_counts_by_stratum": family_counts,
        "consensus_ledger_sha256": sha256(CONSENSUS_PATH),
        "allocation_sha256": sha256(OUTPUT_PATH),
        "all_constraints_pass": True,
        "warning": "Allocation only; query wording and gold contracts remain ungenerated and unreviewed.",
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
