# V4 Development/Validation Coverage Status

## Inventory audit

The currently eligible non-fresh source inventory (`origin=v3_existing`) has:

| Stratum | Independent lineage groups available | Required |
|---|---:|---:|
| `conditional_merge` | 1 | 12 |
| `compatible_history` | 7 | 12 |

The V4 `origin=v4_new` inventory contains 20 independent groups for each
stratum, but it is explicitly reserved as fresh-test capacity. Reusing it for
development or validation would invalidate its fresh-test status.

## What is ready

- Gemini API connectivity is verified with `gemini-3.5-flash`.
- Model usage manifests record model ID, hashes, latency, and usage.
- The review ledger schema records current/retained required evidence and a
  reviewer decision without treating model output as a gold label.

## Expansion completed as drafts

Eight independent WHO source documents were downloaded and ingested into a
separate development/validation draft corpus. The resulting review ledger has
12 `conditional_merge` and 12 `compatible_history` lineage groups, with zero
overlap with the V4 fresh-test inventory.

The former source-coverage blocker is resolved. Promotion remains blocked for
a different reason: all 24 records are model-assisted drafts with
`review_status=needs_user_review`. They may not be treated as gold judgments or
used for validation confirmation until adjudication is complete.
