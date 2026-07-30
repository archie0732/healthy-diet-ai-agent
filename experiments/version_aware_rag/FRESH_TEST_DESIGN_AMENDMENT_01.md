# Fresh-Test Design Amendment 01

Date: 2026-07-22

The original deterministic rule selected the first ten eligible candidate
pairs per stratum. A pre-test construction audit found that three selected
pairs duplicated normalized required-evidence text already selected in another
stratum (`029/049`, `067/062`, and `070/008`). No final test ledger, retrieval
call, model score, answer, or test metric existed at discovery time.

The amended deterministic rule keeps the frozen total and stratum allocation
(40 records; 10 per stratum) but processes strata in the frozen order and,
within each stratum, processes `candidate_pair_id` lexicographically while
skipping any normalized required-evidence signature already selected. The next
eligible unique pair is used. All other freeze terms remain unchanged.

Reason: prevent pseudo-replication. This amendment does not use outcomes and
does not change the retrieval policy, model, prompt, endpoint, or gate.

