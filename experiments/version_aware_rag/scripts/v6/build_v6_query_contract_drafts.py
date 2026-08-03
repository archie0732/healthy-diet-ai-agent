#!/usr/bin/env python3
"""Build router-blind V6 query and page-level gold-contract drafts."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = EXPERIMENT_ROOT / "data"
MINING_DIR = DATA_DIR / "v6_source_mining"
CONFIRMATORY_DIR = DATA_DIR / "v6_confirmatory"
ALLOCATION_PATH = CONFIRMATORY_DIR / "V6_QUERY_ALLOCATION_PLAN.jsonl"
CANDIDATE_PATH = MINING_DIR / "V6_RELATION_CANDIDATES.jsonl"
QUERY_PATH = CONFIRMATORY_DIR / "V6_QUERY_DRAFTS.jsonl"
GOLD_PATH = CONFIRMATORY_DIR / "V6_GOLD_CONTRACT_DRAFTS.jsonl"
MANIFEST_PATH = CONFIRMATORY_DIR / "V6_QUERY_DRAFT_MANIFEST.json"
ANSWER_BEARING_RELATION_QUERY_IDS = {
    "v6q-eh-009",
    "v6q-eh-010",
    "v6q-eh-013",
    "v6q-eh-014",
}


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence_ref(reference: dict) -> dict:
    return {
        "document_id": reference["document_id"],
        "pdf_page_number": reference["pdf_page_number"],
        "recommendation_id": reference.get("recommendation_id"),
    }


def unique_refs(refs: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for ref in refs:
        # Retrieval evidence is page/chunk based. A current recommendation and its
        # relation rationale may share one page but carry different logical IDs;
        # requiring that page twice incorrectly inflates evidence necessity.
        key = (ref["document_id"], ref["pdf_page_number"])
        if key not in seen:
            seen.add(key)
            result.append(ref)
    return result


def topic_phrase(candidate: dict) -> str:
    text = candidate["lineage_id"].removeprefix("v6lin-")
    text = re.sub(r"-(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$", "", text)
    text = re.sub(r"-[abc]\d+$", "", text)
    replacements = {
        "anc": "antenatal care",
        "mms": "multiple micronutrient supplements",
        "hb": "haemoglobin",
        "npm": "nutrient profile model",
        "nppm": "nutrient and promotion profile model",
        "ssb": "sugar-sweetened beverage",
        "hiv": "HIV",
    }
    words = [replacements.get(word, word) for word in text.split("-")]
    phrase = " ".join(words).replace("  ", " ")
    phrase = phrase.replace("vitamin d", "vitamin D")
    phrase = phrase.replace("all child ages", "the ages covered by protections against food marketing")
    phrase = phrase.replace("government led", "government-led")
    phrase = phrase.replace("second trimester", "second-trimester")
    if phrase.startswith("nutrient profile model "):
        phrase = "the nutrient-profile thresholds for " + phrase.removeprefix("nutrient profile model ")
    if phrase.startswith("infant nutrient and promotion profile model "):
        phrase = "the infant-food promotion-profile rules for " + phrase.removeprefix("infant nutrient and promotion profile model ")
    exact_replacements = {
        "food marketing the ages covered by protections against food marketing": "the ages covered by protections against food marketing",
        "food marketing government-led nutrient profile model": "the nutrient-profile model used for food-marketing restrictions",
        "food marketing mandatory policy": "whether restrictions on food marketing must be mandatory",
        "food marketing comprehensive scope": "the required scope of food-marketing restrictions",
        "haemoglobin child 6 23 any anaemia cutoff": "the haemoglobin cutoff for any anaemia in children aged 6–23 months",
        "haemoglobin child 6 23 mild anaemia range": "the mild-anaemia haemoglobin range for children aged 6–23 months",
        "haemoglobin child 6 23 moderate anaemia range": "the moderate-anaemia haemoglobin range for children aged 6–23 months",
        "haemoglobin pregnancy second-trimester any anaemia cutoff": "the haemoglobin cutoff for any anaemia in the second trimester of pregnancy",
        "haemoglobin pregnancy second-trimester mild anaemia range": "the mild-anaemia haemoglobin range in the second trimester of pregnancy",
        "haemoglobin pregnancy second-trimester moderate anaemia range": "the moderate-anaemia haemoglobin range in the second trimester of pregnancy",
        "antenatal care multiple micronutrient supplements": "multiple micronutrient supplementation during pregnancy",
        "antenatal care vitamin D": "vitamin D supplementation during pregnancy",
        "antenatal care zinc": "zinc supplementation during pregnancy",
        "antenatal care balanced energy protein": "balanced energy and protein supplementation during pregnancy",
        "antenatal care daily iron folate": "daily iron and folic acid supplementation during pregnancy",
        "antenatal care healthy eating activity": "healthy-eating and physical-activity counselling during pregnancy",
        "antenatal care high protein not recommended": "high-protein supplementation during pregnancy",
        "antenatal care intermittent iron folate": "intermittent iron and folic acid supplementation during pregnancy",
        "antenatal care nutrition education undernourished": "nutrition education for undernourished pregnant populations",
        "wasting rutf quantity": "the quantity of ready-to-use therapeutic food for children with wasting",
        "wasting sff prioritization": "prioritization of specially formulated foods for children with wasting",
        "wasting community health workers": "the role of community health workers in managing child wasting",
        "wasting rehydration severe": "rehydration of children with severe wasting",
        "wasting rehydration moderate": "rehydration of children with moderate wasting",
        "wasting feed intolerance": "feeding intolerance in children with wasting",
    }
    phrase = exact_replacements.get(phrase, phrase)
    phrase = phrase.replace(" cakes biscuits", " cakes and biscuits")
    phrase = phrase.replace(" dairy milk drinks", " dairy and milk drinks")
    phrase = phrase.replace(" butter oils", " butter, fats, and oils")
    phrase = phrase.replace(" pasta rice grains", " pasta, rice, and grains")
    phrase = phrase.replace(" fresh meat fish", " fresh meat and fish")
    phrase = phrase.replace(" processed meat fish", " processed meat and fish")
    phrase = phrase.replace(" sauces dips", " sauces and dips")
    phrase = phrase.replace(" fruit purees", " fruit purées")
    phrase = phrase.replace(" vegetable purees", " vegetable purées")
    phrase = phrase.replace(" nonfruit snacks", " non-fruit snacks")
    phrase = phrase.replace(" savoury no protein", " savoury meals without a named protein source")
    phrase = phrase.replace(" protein only", " meals containing only a named protein source")
    phrase = phrase.replace(" protein first", " meals listing a protein source first")
    phrase = phrase.replace(" protein not first", " meals not listing a protein source first")
    return phrase


def query_text(query_id: str, stratum: str, topic: str, relation_type: str) -> str:
    precise_overrides = {
        "v6q-eh-015": "Compare the earlier 'puréed meal with cheese' category with the operative 'food with cheese named' category. How do their scope and stated requirements differ?",
        "v6q-eh-029": "Compare the earlier category for purées with only meat, fish, or cheese with the operative category where a protein source is the only named food. How do their scope and thresholds differ?",
        "v6q-eh-030": "Compare the earlier puréed-vegetables-and-cereals category with the broader operative category for food without protein or cheese named. How do their scope and requirements differ?",
        "v6q-hn-025": "For infants under 6 months at risk of poor growth and development who were admitted to inpatient care, what operative WHO criteria permit transfer to outpatient care?",
        "v6q-hn-026": "For infants under 6 months at risk of poor growth and development, when may outpatient visit frequency be reduced, and what assessment is required when they reach 6 months?",
        "v6q-hn-027": "For infants under 6 months with severe wasting and/or nutritional oedema admitted to inpatient care, what operative WHO rules govern feeding and the use of full-strength F-100?",
        "v6q-hn-028": "For infants and children aged 6–59 months with severe wasting and/or nutritional oedema, what operative WHO criteria determine inpatient referral or admission versus outpatient management?",
        "v6q-hn-029": "For infants and children aged 6–59 months with severe wasting and/or nutritional oedema in inpatient care, when may they be transferred to outpatient care?",
        "v6q-hn-030": "For infants and children aged 6–59 months with severe wasting and/or nutritional oedema, when may they exit nutritional treatment, and which measures must not be used as exit criteria?",
        "v6q-hn-031": "What are the operative WHO nutrient-profile thresholds for processed fruit and vegetables?",
    }
    if query_id in precise_overrides:
        return precise_overrides[query_id]
    variant = (int(query_id.rsplit("-", 1)[1]) - 1) % 6
    if stratum == "explicit_history":
        if relation_type == "compatible_with" and variant == 2:
            return (
                f"Across the earlier and operative WHO documents, did the position on {topic} "
                "change or remain the same?"
            )
        if variant == 2 and "rules" in topic:
            return (
                f"How did the operative WHO document change {topic} relative to the earlier document?"
            )
        templates = (
            "Compare the earlier and operative WHO positions on {topic}. What changed, and what, if anything, was retained?",
            "For {topic}, what did WHO state previously, and what does its operative guidance state?",
            "When moving from the earlier WHO document to the operative one, how was {topic} revised?",
            "What version-specific differences should be reported for {topic} across the earlier and operative WHO guidance?",
            "How should an audit describe the former and operative WHO requirements for {topic}?",
            "Which earlier WHO rule governed {topic}, and how does the operative rule compare with it?",
        )
        return templates[variant].format(topic=topic)
    if stratum == "current_only":
        templates = (
            "According to the operative WHO guidance, what is recommended regarding {topic}?",
            "What does the operative WHO guidance require for {topic}?",
            "How should {topic} be handled under the operative WHO recommendation?",
            "State the WHO recommendation currently in force for {topic}.",
            "For {topic}, what action or threshold is specified by the operative WHO guidance?",
            "What is the applicable WHO recommendation for {topic}?",
        )
        return templates[variant].format(topic=topic)
    if stratum == "hard_negative_current":
        templates = (
            "What is the operative WHO requirement for {topic}?",
            "Which WHO rule should be applied now to {topic}?",
            "Under the operative WHO guidance, what requirement governs {topic}?",
            "What currently applicable WHO threshold or policy applies to {topic}?",
            "For a current implementation decision, what WHO rule applies to {topic}?",
            "What does the WHO guidance now in force specify for {topic}?",
        )
        return templates[variant].format(topic=topic)
    raise ValueError(stratum)


def main() -> None:
    allocation = load_jsonl(ALLOCATION_PATH)
    candidates = {record["candidate_id"]: record for record in load_jsonl(CANDIDATE_PATH)}
    queries = []
    gold = []
    for slot in allocation:
        candidate = candidates[slot["candidate_id"]]
        stratum = slot["stratum"]
        older_refs = []
        if candidate.get("older"):
            older_refs.append(evidence_ref(candidate["older"]))
        older_refs.extend(evidence_ref(ref) for ref in candidate.get("additional_older", []))
        current_refs = [evidence_ref(candidate["current"])]
        relation_ref = evidence_ref(candidate["relation_evidence"])
        relation_refs = [relation_ref]

        required = []
        compatible = []
        deprecated = []
        forbidden = []
        if stratum == "explicit_history":
            required = unique_refs(older_refs + current_refs)
            if slot["query_id"] in ANSWER_BEARING_RELATION_QUERY_IDS:
                required = unique_refs(required + relation_refs)
        elif stratum == "current_only":
            required = current_refs
            if candidate["relation_type"] == "compatible_with":
                compatible = older_refs
            else:
                deprecated = older_refs
        elif stratum == "hard_negative_current":
            required = current_refs
            deprecated = older_refs
            forbidden = older_refs

        citation_safe = unique_refs(required + compatible)
        topic = topic_phrase(candidate)
        queries.append(
            {
                "schema_version": "v6-query-draft-1",
                "query_id": slot["query_id"],
                "query_text": query_text(slot["query_id"], stratum, topic, candidate["relation_type"]),
                "language": "en",
                "status": "draft_needs_isolated_ai_review",
            }
        )
        gold.append(
            {
                "schema_version": "v6-gold-contract-draft-1",
                "query_id": slot["query_id"],
                "stratum": stratum,
                "candidate_id": candidate["candidate_id"],
                "lineage_id": candidate["lineage_id"],
                "family": candidate["family"],
                "relation_type": candidate["relation_type"],
                "required_evidence_refs": required,
                "compatible_evidence_refs": compatible,
                "deprecated_evidence_refs": deprecated,
                "forbidden_evidence_refs": forbidden,
                "citation_safe_evidence_refs": citation_safe,
                "relation_evidence_ref": relation_ref,
                "construction_basis": candidate["relation_evidence"]["basis"],
                "review_status": "needs_isolated_ai_review_and_chunk_resolution",
            }
        )

    QUERY_PATH.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in queries), encoding="utf-8", newline="\n")
    GOLD_PATH.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in gold), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-draft-manifest-1",
        "query_count": len(queries),
        "gold_contract_count": len(gold),
        "allocation_sha256": sha256(ALLOCATION_PATH),
        "candidate_source_sha256": sha256(CANDIDATE_PATH),
        "query_draft_sha256": sha256(QUERY_PATH),
        "gold_contract_draft_sha256": sha256(GOLD_PATH),
        "fresh_retrieval_allowed": False,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
