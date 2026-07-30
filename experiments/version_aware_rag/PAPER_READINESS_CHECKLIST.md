# Paper Readiness Checklist

Date reviewed: 2026-07-29

## Readiness decision

The project is ready for manuscript drafting. The remaining work affects final
reporting, packaging, and claim boundaries; it does not require postponing the
Introduction, Methods, automatic Results, Discussion, or current abstract
draft.

## Must complete before submission

- [ ] Complete the independent human review, preserve the blinded submissions,
      report agreement and disagreements, and document adjudication.
- [ ] State precisely whether that review evaluates evidence-contract adequacy
      or generated-answer quality. Do not use evidence review as a substitute
      for answer-level human evaluation.
- [ ] Build one authoritative paper-results table that separates:
      - the broad V3 pilot held-out result;
      - R2.7–R2.10 targeted explicit-history validation and fresh testing;
      - R2.19–R2.21 Development-only neural-hybrid ablation;
      - R2.22 supplemental AI triangulation;
      - the pending independent human review.
- [ ] Reconcile the repository README and the V3 paper tables with the later
      V5 results. The current README still presents the V3 held-out table as the
      current result and does not capture the narrower positive R2.10 claim.
- [ ] Create the actual manuscript source and bibliography. No complete
      manuscript or `.bib` file is currently present.
- [ ] Add confidence intervals or exact paired statistics wherever supported,
      and retain the R2.10 sign-test result (`p = 0.125`) rather than implying
      conventional statistical significance.
- [ ] Write explicit limitations covering small held-out strata, Codex-authored
      or Codex-audited records, exact-evidence annotation strictness,
      Development-only neural-hybrid results, and the absence of clinical
      effectiveness evidence.
- [ ] Add data/code availability, model and software versions, checksum and
      execution-guard details, AI-assistance disclosure, conflicts of interest,
      funding, and ethics/IRB applicability statements required by the target
      venue.
- [ ] Produce a clean, versioned reproducibility snapshot. The working tree
      currently contains many modified and untracked experiment artifacts, so
      the repository is not yet a submission-ready archival package.

## Decisions needed soon

- [ ] Select the target venue or thesis template; its word limits and section
      requirements determine the final abstract and manuscript format.
- [ ] Choose the primary paper framing:
      1. a targeted positive result for explicit cross-version retrieval, with
         broad and implicit-query failures as boundaries; or
      2. a safety–relevance trade-off and negative-results paper.

The current abstract uses the first framing while retaining the negative
findings. It does not claim overall RAG or answer-quality superiority.

## Safe result hierarchy

1. **Primary held-out claim:** R2.10 supports improved explicit-history
   evidence retrieval without preregistered control-stratum regression.
2. **Supporting validation:** R2.7–R2.9 establish the deterministic temporal
   router and replicate the targeted retrieval direction.
3. **Boundary evidence:** the V3 broad pilot and R2.20 failed gate show that
   benefits do not generalize automatically to broad or implicit evidence
   needs.
4. **Supplemental evidence:** R2.22 GPT-5.6 review is AI triangulation only.
5. **Pending evidence:** independent human review must remain pending until
   completed, unblinded, analyzed, and adjudicated.
