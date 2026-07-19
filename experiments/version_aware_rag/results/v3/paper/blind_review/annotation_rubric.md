# Version-Aware RAG: Human Answer Annotation Rubric (v3)

This rubric guides blind human evaluation of generated answers for version-aware dietary guidance queries.
Each evaluator will evaluate 24 anonymized answer records across 6 standardized quality metrics.

---

## 1. Overview of Evaluation Metrics

| Metric Name | Allowed Values | Description |
| :--- | :---: | :--- |
| **Answer correctness** | `0.0` / `0.5` / `1.0` | Overall factual accuracy and consistency with official dietary guidelines. |
| **Completeness** | `0.0` / `0.5` / `1.0` | Coverage of required key recommendations or quantitative limits. |
| **Version correctness** | `0.0` / `0.5` / `1.0` | Freedom from outdated, superseded, or version-conflicted rules. |
| **Conditional-boundary preservation** | `0.0` / `0.5` / `1.0` | Explicit disclosure of target population sub-rules (e.g. age, pregnancy, health conditions). |
| **Unsupported claim** | `0.0` / `1.0` | Binary flag (`1.0` = contains hallucinations/claims unsupported by cited evidence). |
| **Citation entailment** | `0.0` / `0.5` / `1.0` | Extent to which cited evidence text logically entails the written claims. |

---

## 2. Detailed Scoring Rules & Operational Criteria

### 2.1 Answer Correctness (0.0 / 0.5 / 1.0)
- **1.0 (Correct)**: The answer is factually accurate, correctly reflects official dietary recommendations, and contains no misleading statements.
- **0.5 (Partially Correct)**: The answer is core-accurate but contains minor inaccuracies, ambiguous wording, or missing critical nuances that do not pose health hazards.
- **0.0 (Incorrect)**: The answer states outdated or contradictory rules as current truth, or presents false dietary guidance.

### 2.2 Completeness (0.0 / 0.5 / 1.0)
- **1.0 (Complete)**: Fully answers all sub-questions in the query, providing all mandatory guidance items and quantitative thresholds.
- **0.5 (Partially Complete - Correct but incomplete)**: The information provided is accurate, but omits one key secondary detail or quantitative bound requested by the user.
- **0.0 (Incomplete)**: Fails to address the core request or misses all essential recommendation requirements.

### 2.3 Version Correctness (0.0 / 0.5 / 1.0)
- **1.0 (Version-Accurate)**: Cites and uses the correct guideline version as specified by query temporal scope (or current 2025–2030 edition if unspecified), without mixing outdated rules.
- **0.5 (Minor Version Confusion)**: Mentions current guidance but confusingly quotes older limits without explicitly noting their superseded status.
- **0.0 (Version Failure)**: Returns superseded rules (e.g., 300 mg/day cholesterol limit as active 2025 rule) or mixes contradictory edition guidelines without distinction.

### 2.4 Conditional-Boundary Preservation (0.0 / 0.5 / 1.0)
- **1.0 (Preserved)**: Explicitly identifies target population boundaries (e.g., "For general adults: X; For pregnant women: Y; For toddlers under 2: Z").
- **0.5 (Partial Boundary Loss)**: Mentions general population rules but omits specific warnings/exceptions for sub-populations.
- **0.0 (Boundary Violation)**: Over-generalizes a conditional/restricted rule to the general public, or fails to state critical health restrictions.

### 2.5 Unsupported Claim (0.0 / 1.0)
- **0.0 (No Unsupported Claims)**: Every factual assertion in the answer is backed by cited text or standard common knowledge.
- **1.0 (Has Unsupported Claim)**: The answer contains hallucinated statistics, fabricated guideline rules, or citations that do not support the accompanying statement.

### 2.6 Citation Entailment (0.0 / 0.5 / 1.0)
- **1.0 (Fully Entailed)**: All cited evidence chunks directly entail the sentences citing them.
- **0.5 (Partially Entailed / Weak Support)**: Citations exist and touch upon the topic, but the cited text only weakly implies or partially supports the specific quantitative claim.
- **0.0 (Not Entailed / Invalid Citation)**: Cited chunks are non-existent, irrelevant, or contradict the sentence making the citation.

---

## 3. Standard Criteria for 0.5 (Partial Credit) Usage
Evaluators must apply `0.5` consistently:
- **Correctness = 0.5**: Factually sound main premise, but imprecise phrasing (e.g., "eat less sugar" instead of "less than 10% of total calories").
- **Completeness = 0.5**: Answer is 100% true, but leaves out a second mandatory recommendation (e.g. covered added sugar limit but missed saturated fat limit).
- **Version Correctness = 0.5**: Current recommendation given, but historical context is vaguely phrased.
- **Boundary Preservation = 0.5**: Rule is accurate for adults, but doesn't mention toddler exception.
- **Citation Entailment = 0.5**: Citation relates to dietary fats, but sentence makes a specific 10% claim not in that exact chunk.
