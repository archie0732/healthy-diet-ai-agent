# V6 relation candidate audit

Status: **STRUCTURAL PASS**

## Counts

- Candidate relations: 72
- Unique proposed lineages: 72
- Direct lineage collisions with the exclusion ledger: 0
- Missing page references: 0
- Recommendation-token warnings: 0
- Missing visual reviews: 0
- Failed visual reviews: 0
- Topic-family capacity gate (96-question target): True

## Families

- `antenatal_nutrition`: 12
- `fiscal_policies_for_healthy_diets`: 3
- `food_marketing_to_children`: 5
- `haemoglobin_cutoffs_for_anaemia`: 6
- `hiv_and_infant_feeding`: 2
- `school_food_environment`: 3
- `wasting_and_nutritional_oedema`: 14
- `who_europe_infant_food_nppm`: 10
- `who_europe_nutrient_profile_model`: 17

## Proposed relation types

- `compatible_with`: 7
- `current_only`: 22
- `supersedes`: 1
- `updates`: 42

## Topic-family capacity by main stratum

The target is 24 questions per stratum with no family above 25% (at most 6). The fallback minimum is 20 questions per stratum (at most 5 per family).

- `explicit_history`: target capacity 34/24 (feasible); minimum capacity 30/20 (feasible)
- `conditional_merge`: target capacity 34/24 (feasible); minimum capacity 30/20 (feasible)
- `current_only`: target capacity 34/24 (feasible); minimum capacity 30/20 (feasible)
- `hard_negative_current`: target capacity 30/24 (feasible); minimum capacity 26/20 (feasible)

## Important limitation

This pass checks identifiers, duplicate lineages, direct exclusion-ledger collisions, and page existence. It does not certify semantic novelty or medical correctness. Candidates remain ineligible for the sealed test until visual review, isolated AI review, unanimous adjudication, near-duplicate review, and the full capacity gate are complete.
