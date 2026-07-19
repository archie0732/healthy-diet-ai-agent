# Blind Answer Annotation Package (v3)

This package contains 24 randomized items for blind human evaluation across 3 RAG systems on held-out dietary queries.

## Package Contents
- `annotation_package_annotator_1.json`: Anonymized items randomized for Evaluator 1.
- `annotation_package_annotator_2.json`: Anonymized items randomized for Evaluator 2.
- `annotation_rubric.md`: Standardized scoring rubric across 6 quality metrics.
- `README.md`: Instructions for evaluators.

## Evaluation Format
For each item, evaluators should record scores in a JSON file formatted as:
```json
{
  "item_id": "blind-001",
  "annotator_id": "annotator_1",
  "answer_correctness": 1.0,
  "completeness": 0.5,
  "version_correctness": 1.0,
  "conditional_boundary_preservation": 1.0,
  "unsupported_claim": 0.0,
  "citation_entailment": 1.0,
  "notes": "Optional comments"
}
```
