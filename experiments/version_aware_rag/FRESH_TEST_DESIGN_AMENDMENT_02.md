# Fresh-Test Design Amendment 02

Date: 2026-07-22

Codex semantic review of the draft evidence packet found that several candidate
pairs used a generic historical passage that did not materially support the
question. No retrieval call, model score, answer, or test metric existed.

The final pre-registered candidate IDs are therefore fixed as follows before
project-owner review:

- current_only: 001–010
- conditional_merge: 041–044, 051, 052, 056, 058–060
- compatible_history: 021–024, 032, 033, 035, 036, 038, 040
- hard_negative: 061–066, 068, 069, 075, 078

Replacements were selected solely for material two-passage evidence support
and unique normalized evidence signatures. Total size and stratum allocation
remain 40/10-per-stratum. Policy, model, prompt, parameters, endpoints, and
gates remain unchanged. The superseded first draft is retained by checksum in
the guard history and was never executed.

