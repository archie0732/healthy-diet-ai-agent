# R2.19 Source-Expanded Neural-Hybrid Candidate Protocol

Date preregistered: 2026-07-28  
Scope: Development-only; outcome-exposed R2.16 diagnostic plus new source mining  
Status: protocol written before neural candidate retrieval

## Motivation

R2.17 showed that changing BM25 seed count did not reach required candidate
Recall@20 of `0.90`. R2.18 showed that fixed-size group closure merely exchanged
one recovered hit for one displaced hit, while clause and lexical rank fusion
reduced recall. Candidate retrieval must therefore test a genuine sentence
embedding signal rather than another lexical variant.

Four new official documents are added only to expand future annotation
capacity. They do not change R2.16 judgments and are not inserted into the
R2.16 diagnostic corpus.

## Frozen neural model

- runtime package: `@huggingface/transformers` version `4.2.0`;
- model: `Xenova/all-MiniLM-L6-v2`;
- model revision: `751bff37182d3f1213fa05d7196b954e230abad9`;
- task: `feature-extraction`;
- dtype: `q8`;
- pooling: mean;
- normalization: L2;
- expected dimensions: 384;
- execution device: native Windows x64 CPU;
- remote model loading: disabled after the model cache is checksummed.

The model cache, tokenizer, configuration, ONNX weights, package lock, and
runtime DLL/native binding must be hashed before the diagnostic is unlocked.
The package's blocked postinstall scripts are not executed.

### Pre-execution initialization correction

An initial runner invocation failed before model loading because both local and
remote model access were disabled. It produced zero embeddings, zero candidate
pools, read zero judgments, and left the execution guard at count 0. Before the
diagnostic execution, the runner was corrected to open the checksum-bound
revision directory with `local_files_only=true`; remote loading remains
disabled. The failed initialization record is a frozen input.

## Outcome-exposed R2.16 diagnostic

The diagnostic freezes these ordered Top-20 variants:

1. `bm25_seed12_control`;
2. `minilm_q8_dense_top20`;
3. `bm25_minilm_rrf_k60_top20`;
4. `bm25_minilm_rrf_k60_iterative_closure`.

BM25 uses `k1=1.2`, `b=0.75`, and seed count 12. Reciprocal-rank fusion uses
`k=60`. The fourth variant applies the already declared R2.18 iterative group
closure to the fused ranking. No query, item ID, lineage ID, source ID, or
judgment label may be embedded as model input; only role-neutral query and
candidate text are used.

All query and document embeddings and all four ordered pools must be completed
before the sealed R2.16 judgments are read once.

## Eligibility and selection

A variant is eligible only if:

- required micro Recall@20 is at least `0.90`;
- every stratum is noninferior to `bm25_seed12_control`;
- each ordered pool contains exactly 20 unique candidate IDs;
- every embedding is finite, L2-normalized, and 384-dimensional;
- the R2.16 confirmation guard remains failed-and-locked at execution count 1.

Selection order is highest required micro Recall@20, highest minimum-stratum
recall, then declared variant order. This diagnostic does not run Top-3
reranking and cannot authorize Validation, a fresh test, or promotion.

## New-source capacity stage

The four R2.19 PDFs are deterministically chunked before annotation. Candidate
groups must pass all earlier Validation and fresh-test evidence exclusions.
Before a new confirmation can be frozen, a separate review packet must contain
at least 32 new owner-approved records:

- 10 `conditional_merge`;
- 10 `compatible_history`;
- 6 `current_only`;
- 6 `hard_negative_current`.

No source document may supply more than one quarter of a stratum. Supporting
reviews and evidence profiles must be labelled as such and must not be treated
as independent recommendations.

Even if a neural variant is selected on exposed R2.16 data, a new
lineage-disjoint confirmation remains mandatory.
