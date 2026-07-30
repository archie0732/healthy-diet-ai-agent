# V5 R2 Local / No-API Continuation

Date: 2026-07-23

## Outcome

This continuation used no Gemini, Gemma, OpenAI, or other external model API.
Codex performed the Development-only semantic audit and source mining. All
automated detector experiments were deterministic local TypeScript programs.

No detector passed the preregistered Development gate. The sealed validation
was not executed, its checksum remained unchanged, and no V5 fresh test or
policy freeze was created.

## Action-label audit

The previous mapping treated every `conditional_difference` or
`complementary` relation as requiring an additional retrieval slot. The Codex
audit corrected this conceptual error: a relation may add detail while CURRENT
still fully subsumes OLD.

Five Development labels were revised from `PAIR_PRESERVE` to
`BLOCK_RETAINED`:

- `v5claim-006`: the current saturated-fat passage repeats the ceiling and adds
  the age boundary;
- `v5claim-014`: the current added-sugar passage repeats the ceiling and adds
  guidance below age two;
- `v5claim-017`: the current protein passage restates source variety and adds a
  quantitative target;
- `v5claim-020`: the current vitamin-D passage supplies timing, dose, and
  formula-intake scope;
- `v5claim-022`: the current allergen passage restates timing and adds examples
  and risk consultation.

The original artifacts were not overwritten. All 22 decisions and rationales
are retained in
`data/annotations_v5/r2_codex_action_audit/audit_ledger.jsonl`.

The audited distribution is 6 `PAIR_PRESERVE` and 16 `BLOCK_RETAINED`.

## Atomic evidence repair

Long, multi-column source passages contained unrelated claims. R2.4 added 44
normalized atomic claim texts while preserving every parent passage, URL,
line/page locator, and source hash. Detector input uses only the atomic claims;
the source passages remain available for verification.

Artifact:
`data/configs/v5_r2_4_atomic_action_detector/development.jsonl`.

## Official-source Development expansion

R2.5 added 20 action pairs from the already downloaded WHO official
guidelines:

- 9 duplicate/subsumed pairs;
- 11 compatible target, definition, implementation, age-scope, or safety pairs.

The combined Development set contains 42 pairs in 42 lineage groups:

- 17 `PAIR_PRESERVE`;
- 25 `BLOCK_RETAINED`.

Every added pair retains its WHO record URL, PDF download URL, local chunk ID,
page number, source checksum, source text, atomic claim, and review rationale.

Artifacts:

- `data/annotations_v5/r2_5_official_action_expansion/development_expansion.jsonl`
- `data/configs/v5_r2_5_expanded_local_action_detector/SPLIT_MANIFEST.json`

## Local detector results

All runtime features were derived only from OLD and CURRENT text. Pair IDs,
topics, relation labels, action judgments, and validation data were prohibited
features.

| Dataset / detector | Evaluation | Best zero-false-preserve result |
|---|---|---:|
| R2.3 audited, local logistic | leave-one-lineage-group-out | precision 1.0, recall 0.333 (2/6) |
| R2.4 atomic, local logistic | leave-one-lineage-group-out | no positive prediction, recall 0 |
| R2.5 expanded, local logistic | leave-one-lineage-group-out | no positive prediction, recall 0 |
| R2.5 expanded, bounded decision tree | leave-one-lineage-group-out | no positive prediction, recall 0 |

Development promotion required:

1. false preserve count = 0;
2. pair-preserve precision = 1.0;
3. pair-preserve recall >= 0.5.

No configuration passed.

## Interpretation

The failure is not caused by exhausted Gemini quota. The action cannot be
reliably inferred from two passages alone in the current dataset. Whether an
OLD detail deserves a retrieval slot depends on the user's query and the exact
claim being answered. Pair-only passages can contain multiple unrelated facts,
making `PAIR_PRESERVE` underdetermined without query intent.

The next scientifically defensible detector should therefore accept:

`query + atomic OLD claim + atomic CURRENT claim`

and be trained on a substantially larger, independently reviewed Development
set. Query-conditioned examples must be created before any further validation
execution.

## Gate decision

- sealed R2 validation: not executed;
- validation execution count: 0;
- tuning from validation: none;
- Gemini/Gemma calls in this continuation: 0;
- OpenAI API calls: 0 (no OpenAI API credential was configured);
- V5 freeze: blocked;
- fresh V5 test: not created;
- overall-superiority claim over Recency: not supported.

The narrower evidence remains valid: Oracle lineage information can improve
historical and conditional coverage when correct relations and query intent are
available, but a safe predicted action detector has not yet reproduced that
advantage.
