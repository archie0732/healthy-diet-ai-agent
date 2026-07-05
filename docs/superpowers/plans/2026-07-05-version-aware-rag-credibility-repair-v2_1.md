# Version-Aware RAG Credibility Repair v2.1 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining evaluation defects after the initial credibility-repair pass so the experiment can support a clean transition into superiority-focused work.

**Architecture:** Keep the repaired v2 evaluation contract, but tighten three weak points: replace the degenerate `unsafeRetrievalRate` metric with a discriminative one, add a non-oracle relevance signal so retrieval is not reduced to page-level lexical collisions, and make the advisor report readable and aligned with the repaired protocol.

**Tech Stack:** Bun, TypeScript, JSON annotations, Markdown reporting

---

### Task 1: Replace the degenerate unsafe retrieval metric

**Files:**
- Modify: `experiments/version_aware_rag/scripts/run_retrieval_eval.ts`
- Modify: `experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts`
- Modify: `experiments/version_aware_rag/results/tables/evaluation_summary.json`
- Modify: `experiments/version_aware_rag/results/tables/evaluation_summary.md`

- [ ] **Step 1: Write the failing metric regression test**

Add a test proving the metric is not triggered merely because one non-cited chunk appears in top-3:

```ts
test("top1 unsafe metric only fails when the highest-ranked chunk is citation-unsafe", () => {
  const topK = [
    { chunk: { chunk_id: "safe-top1" }, score: 5 },
    { chunk: { chunk_id: "unsafe-top2" }, score: 4 },
    { chunk: { chunk_id: "unsafe-top3" }, score: 3 }
  ] as any;

  const judgment = {
    query_id: "q-metric",
    acceptable_chunk_ids: ["safe-top1"],
    preferred_chunk_ids: ["safe-top1"],
    stale_chunk_ids: [],
    forbidden_chunk_ids: [],
    citation_safe_chunk_ids: ["safe-top1"]
  };

  const result = summarizeQueryResult("q-metric", "demo", topK, judgment);
  expect(result.top1_is_citation_safe).toBe(true);
});
```

- [ ] **Step 2: Run the test before implementation**

Run: `bun test experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts`

Expected: FAIL because `top1_is_citation_safe` does not exist yet.

- [ ] **Step 3: Change the query/result schema**

Update `run_retrieval_eval.ts`:

```ts
export interface QueryEvalResult {
  query_id: string;
  question: string;
  retrieved_chunk_ids: string[];
  is_stale_retrieved: boolean;
  is_current_retrieved: boolean;
  top1_is_citation_safe: boolean;
  unsafe_chunk_count_at_k: number;
  citation_measurement: "not_measured";
}
```

And compute:

```ts
const top1IsCitationSafe =
  retrievedIds.length > 0 && judgment.citation_safe_chunk_ids.includes(retrievedIds[0]);

const unsafeChunkCountAtK = retrievedIds.filter(
  (id) => !judgment.citation_safe_chunk_ids.includes(id)
).length;
```

Replace aggregate `unsafeRetrievalRate` with:

- `top1CitationUnsafeRate`
- `avgUnsafeChunkCountAtK`

- [ ] **Step 4: Update the markdown/JSON output labels**

Change the summary table columns to:

```md
| Retrieval Mode | Stale Retrieval Rate | Current Hit Rate | Top-1 Citation Unsafe Rate | Avg Unsafe Chunks@3 |
```

- [ ] **Step 5: Re-run the tests**

Run: `bun test experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add experiments/version_aware_rag/scripts/run_retrieval_eval.ts experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts experiments/version_aware_rag/results/tables/evaluation_summary.json experiments/version_aware_rag/results/tables/evaluation_summary.md
git commit -m "refactor: replace degenerate unsafe retrieval metric"
```

### Task 2: Add a non-oracle relevance signal to retrieval scoring

**Files:**
- Modify: `experiments/version_aware_rag/scripts/run_retrieval_eval.ts`
- Modify: `experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts`
- Create: `experiments/version_aware_rag/results/tables/retrieval_scoring_notes_v2_1.md`

- [ ] **Step 1: Write a failing test for same-page lexical collisions**

Add a test showing the scorer should prefer the chunk whose topic wording best matches the query, even when multiple chunks share the same page tokens:

```ts
test("relevance scoring separates same-page multi-lineage collisions", () => {
  const query = {
    query_id: "q-protein",
    question: "recommended daily protein intake per kilogram",
    expected_answer_scope: "current_only",
    notes: ""
  };

  const proteinChunk = {
    chunk_id: "protein",
    doc_id: "dga-2025",
    version: "2025-2030",
    published_year: 2025,
    topic: "protein intake goals",
    applicable_population: "general",
    lineage_id: "lineage-protein",
    text: "Protein serving goals: 1.2-1.6 grams of protein per kilogram of body weight per day."
  };

  const dairyChunk = {
    chunk_id: "dairy",
    doc_id: "dga-2025",
    version: "2025-2030",
    published_year: 2025,
    topic: "dairy guidance",
    applicable_population: "general",
    lineage_id: "lineage-dairy",
    text: "Dairy serving goals: 3 servings per day as part of a 2,000-calorie dietary pattern."
  };

  expect(scoreChunkForQuery(query, proteinChunk, "append-only")).toBeGreaterThan(
    scoreChunkForQuery(query, dairyChunk, "append-only")
  );
});
```

- [ ] **Step 2: Run the test before implementation**

Run: `bun test experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts`

Expected: FAIL or be too weak to guarantee stable separation.

- [ ] **Step 3: Strengthen scoring without reintroducing oracle labels**

Update `scoreChunkForQuery` to combine:

- query-text vs chunk-text overlap
- query-text vs chunk-topic overlap
- numeric-token overlap
- exact phrase bonus for domain terms like `protein`, `sodium`, `cholesterol`, `sweeteners`

Use a simple additive form such as:

```ts
const textOverlap = overlapCount(queryTokens, chunkTokens);
const topicOverlap = overlapCount(queryTokens, tokenize(chunk.topic)) * 2;
const numericOverlap = overlapCount(extractNumericTokens(query.question), extractNumericTokens(chunk.text)) * 3;
const phraseBonus = hasImportantPhraseMatch(query.question, chunk.text, chunk.topic) ? 2 : 0;

let score = textOverlap + topicOverlap + numericOverlap + phraseBonus;
```

Do not use `lineage_id`, `target_lineage_id`, or any gold annotation field.

- [ ] **Step 4: Document the new scoring path**

Create `retrieval_scoring_notes_v2_1.md` with:

```md
# Retrieval Scoring Notes v2.1

- No gold lineage metadata is used during ranking.
- Relevance is estimated from query/chunk lexical overlap, topic overlap, numeric overlap, and small domain phrase bonuses.
- Proposed still differs only by policy-state filtering, not by privileged ranking information.
```

- [ ] **Step 5: Re-run the tests**

Run: `bun test experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add experiments/version_aware_rag/scripts/run_retrieval_eval.ts experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts experiments/version_aware_rag/results/tables/retrieval_scoring_notes_v2_1.md
git commit -m "refactor: strengthen non-oracle retrieval scoring"
```

### Task 3: Repair report readability and claim hygiene

**Files:**
- Modify: `technical_docs/advisor_guide_version_aware_rag.md`
- Modify: `experiments/version_aware_rag/results/tables/evaluation_summary.md`

- [ ] **Step 1: Verify encoding/readability**

Open `technical_docs/advisor_guide_version_aware_rag.md` and ensure it is saved as UTF-8 with readable Traditional Chinese and English section headers.

Expected: no garbled characters in headings, bullets, or result tables.

- [ ] **Step 2: Rewrite the repaired-results section in plain readable form**

Replace the current repaired-results section with a clean summary shaped like:

```md
## Credibility Repair v2 Results

After removing oracle lineage routing and simulated citation metrics, the repaired evaluation shows that:

- Append-Only still retrieves stale material on some queries.
- Recency-Only currently outperforms Proposed on current-hit rate under the repaired scorer.
- Proposed has not yet demonstrated superiority under the credibility-repaired setup.
```

- [ ] **Step 3: Tighten the interpretation boundary**

Add this exact subsection:

```md
## What This Stage Establishes

This stage establishes that the evaluation protocol is more trustworthy than the original version.
It does not yet establish that Version-Aware RAG is better than Recency-Only RAG.
```

- [ ] **Step 4: Regenerate the summary artifacts after the wording fix**

Run: `bun experiments/version_aware_rag/scripts/run_retrieval_eval.ts`

Expected: summary artifacts refresh without reintroducing the old metric labels.

- [ ] **Step 5: Manual read-through**

Check these three statements are true:

```text
The report is readable in the editor and markdown preview
The report no longer implies that 100% unsafe retrieval is an interpretable final conclusion
The report explicitly says superiority work is still future work
```

- [ ] **Step 6: Commit**

```bash
git add technical_docs/advisor_guide_version_aware_rag.md experiments/version_aware_rag/results/tables/evaluation_summary.md
git commit -m "docs: clean up repaired rag evaluation reporting"
```

### Task 4: Re-run verification and decide readiness for the next phase

**Files:**
- Reference: `experiments/version_aware_rag/results/tables/evaluation_summary.json`
- Reference: `technical_docs/advisor_guide_version_aware_rag.md`
- Reference: `docs/superpowers/plans/2026-07-05-version-aware-rag-credibility-repair-v2_1.md`

- [ ] **Step 1: Run the full check**

```bash
bun test experiments/version_aware_rag/scripts/run_retrieval_eval.test.ts
bun experiments/version_aware_rag/scripts/run_retrieval_eval.ts
git status --short
```

Expected:

```text
All evaluation tests pass
Summary artifacts regenerate successfully
Only planned experiment/report files are modified
```

- [ ] **Step 2: Apply the readiness gate**

You may move to superiority-focused experiments only if all four statements are true:

```text
The replacement unsafe metric is no longer constant across all modes
Top results are no longer dominated by obvious same-page wrong-lineage collisions
The report is readable and shareable
The repaired evaluation still clearly distinguishes Proposed from the baselines in some meaningful way, even if Proposed is not yet better
```

- [ ] **Step 3: Record the decision**

Append one line to the report:

```md
Readiness decision: proceed to superiority experiments only after v2.1 metrics and retrieval quality checks pass.
```

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-07-05-version-aware-rag-credibility-repair-v2_1.md
git commit -m "docs: add v2.1 rag credibility repair follow-up plan"
```
