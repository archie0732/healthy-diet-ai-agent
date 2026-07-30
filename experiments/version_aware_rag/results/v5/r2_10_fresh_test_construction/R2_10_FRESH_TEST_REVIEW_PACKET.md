# R2.10 Fresh Held-Out Test Review Packet

Status: **REVIEW REQUIRED - TEST EXECUTION LOCKED**

Review packet content SHA-256: `b3923d62ba18fed6ed70b21cfe80819885768c378ce5afa0e1846c54c7d69ca3`

Frozen policy SHA-256: `4491f19fd3de101022c81e1f5cde8669a4a82ed0d172b11e5627f853a4fd5835`

Please review each query, OLD/CURRENT evidence, and required/deprecated decision. To request a change, reply in chat with the query ID and replacement. Do not infer any retrieval result: none exists.

Approval options:

- `同意全部，checksum <packet checksum>`
- `<query-id> 的 query 改成 ...`
- `<query-id> 的 OLD/CURRENT 判定應改為 ...`
- `刪除 <query-id>`

## r2.10-01-explicit-n3-tfa-replacement

- Stratum: `explicit_history`
- Query: What historical n-3 PUFA range applied, and which current replacements for trans fat are not preferred or remain inconclusive?
- Required: `r2.10-01-explicit-n3-tfa-replacement::OLD`, `r2.10-01-explicit-n3-tfa-replacement::CURRENT`
- Deprecated: none
- Rationale: The query explicitly requires a historical nutrient range and current replacement evidence.

OLD (2003, PDF page 3, printed page 56):

> The 2003 n-3 polyunsaturated-fat goal was 1 to 2 percent of total energy.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 51, chunk `who-sat-trans-fat-2023-page-51-pass-2-eb0f143a12`):

> Current evidence does not support replacing trans fat with saturated fat and is inconclusive for refined carbohydrates or free sugars.

Source: https://www.who.int/publications/i/item/9789240073630

## r2.10-02-explicit-sodium-hot-clinical-exceptions

- Stratum: `explicit_history`
- Query: Which heat-related exception was recognized historically, and which clinical exclusions are recognized currently?
- Required: `r2.10-02-explicit-sodium-hot-clinical-exceptions::OLD`, `r2.10-02-explicit-sodium-hot-clinical-exceptions::CURRENT`
- Deprecated: none
- Rationale: Both generations of exception evidence are explicitly requested.

OLD (2003, PDF page 37, printed page 90):

> The historical report flagged non-acclimated strenuous activity in heat as a sodium-reduction exception.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2012, PDF page 26, chunk `who-sodium-2012-page-26-pass-0-79e05e2ed5`):

> Current sodium recommendations exclude illnesses and therapies that risk hyponatraemia, water build-up, or require physician-supervised diets.

Source: https://www.who.int/publications/i/item/9789241504836

## r2.10-03-explicit-sugar-goal-conditional-policy

- Stratum: `explicit_history`
- Query: What historical free-sugar goal was retained, and what does a current conditional recommendation require from policy-makers?
- Required: `r2.10-03-explicit-sugar-goal-conditional-policy::OLD`, `r2.10-03-explicit-sugar-goal-conditional-policy::CURRENT`
- Deprecated: none
- Rationale: OLD supplies the historical target; CURRENT supplies the policy meaning.

OLD (2003, PDF page 4, printed page 57):

> The historical population goal kept free sugars below 10 percent of total energy.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2015, PDF page 24, chunk `who-sugars-2015-page-24-pass-2-755599d38d`):

> Current guidance explains that conditional recommendations require policy debate because benefit-harm certainty is lower.

Source: https://www.who.int/publications/i/item/9789241549028

## r2.10-04-explicit-fat-range-current-threshold

- Stratum: `explicit_history`
- Query: What historical total-fat range applied, and why was the current 30-percent threshold selected?
- Required: `r2.10-04-explicit-fat-range-current-threshold::OLD`, `r2.10-04-explicit-fat-range-current-threshold::CURRENT`
- Deprecated: none
- Rationale: The query requires the historical range and current threshold rationale.

OLD (2003, PDF page 3, printed page 56):

> The historical population total-fat range was 15 to 30 percent of energy.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 30, chunk `who-total-fat-2023-page-30-pass-1-345d23b2d0`):

> Current guidance selected 30 percent because trials commonly began above that level and achieved levels near or below it.

Source: https://www.who.int/publications/i/item/9789240073654

## r2.10-05-conditional-sfa-goal-safety

- Stratum: `conditional_merge`
- Query: What cardiovascular purpose supports limiting saturated fat, and did current evidence identify mitigating harms?
- Required: `r2.10-05-conditional-sfa-goal-safety::OLD`, `r2.10-05-conditional-sfa-goal-safety::CURRENT`
- Deprecated: none
- Rationale: The two compatible claims answer distinct parts of a non-temporally worded question.

OLD (2003, PDF page 36, printed page 89):

> Saturated fatty acid intake should be limited as part of cardiovascular risk reduction.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 47, chunk `who-sat-trans-fat-2023-page-47-pass-2-0c1430db13`):

> Current evidence found no undesirable effects or mitigating factors that argue against lower saturated-fat intake.

Source: https://www.who.int/publications/i/item/9789240073630

## r2.10-06-conditional-tfa-limit-current-lipid-effect

- Stratum: `conditional_merge`
- Query: What disease-prevention purpose supports trans-fat reduction, and what lipid effect follows replacement with other nutrients?
- Required: `r2.10-06-conditional-tfa-limit-current-lipid-effect::OLD`, `r2.10-06-conditional-tfa-limit-current-lipid-effect::CURRENT`
- Deprecated: none
- Rationale: Both retained purpose and current replacement evidence are required.

OLD (2003, PDF page 36, printed page 89):

> Reducing trans fat was a dietary goal for lowering coronary heart disease risk.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 50, chunk `who-sat-trans-fat-2023-page-50-pass-1-67c3e9a0e7`):

> Current trials find that replacing trans fat with unsaturated fats or carbohydrates reduces LDL cholesterol and improves blood lipids.

Source: https://www.who.int/publications/i/item/9789240073630

## r2.10-07-conditional-sugar-energy-dental

- Stratum: `conditional_merge`
- Query: How can free sugars affect energy balance, and which current body-weight and dental evidence supports limiting them?
- Required: `r2.10-07-conditional-sugar-energy-dental::OLD`, `r2.10-07-conditional-sugar-energy-dental::CURRENT`
- Deprecated: none
- Rationale: The query requires complementary mechanism and current evidence claims.

OLD (2003, PDF page 4, printed page 57):

> Free sugars increase dietary energy density and can promote positive energy balance.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2015, PDF page 24, chunk `who-sugars-2015-page-24-pass-1-56c8156596`):

> Current evidence links free-sugar changes with body weight and bases the below-10-percent recommendation partly on dental-caries evidence.

Source: https://www.who.int/publications/i/item/9789241549028

## r2.10-08-conditional-fat-minimum-current-effect

- Stratum: `conditional_merge`
- Query: Why is a minimum fat intake physiologically relevant, and how are current lower-fat trial effects interpreted?
- Required: `r2.10-08-conditional-fat-minimum-current-effect::OLD`, `r2.10-08-conditional-fat-minimum-current-effect::CURRENT`
- Deprecated: none
- Rationale: The question requires the retained lower-bound rationale and current trial interpretation.

OLD (2003, PDF page 3, printed page 56):

> A total-fat lower bound near 15 percent of energy supports essential physiological functions.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 30, chunk `who-total-fat-2023-page-30-pass-2-eb5a7497dc`):

> Current trials interpret lower-fat arms as reducing weight gain or producing greater weight reduction than controls.

Source: https://www.who.int/publications/i/item/9789240073654

## r2.10-09-current-potassium-recommendation-strength

- Stratum: `current_only`
- Query: What are the current practical implications of strong versus conditional potassium recommendations?
- Required: `r2.10-09-current-potassium-recommendation-strength::CURRENT`
- Deprecated: `r2.10-09-current-potassium-recommendation-strength::OLD`
- Rationale: CURRENT fully answers the current-only policy question; OLD is deprecated for this query.

OLD (2003, PDF page 37, printed page 90):

> The historical potassium benchmark was around 70 to 80 millimoles per day.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2012, PDF page 24, chunk `who-potassium-2012-page-24-pass-1-d2b064757f`):

> Current guidance explains the implications of strong and conditional potassium recommendations for patients, clinicians, and policy-makers.

Source: https://www.who.int/publications/i/item/9789241504829

## r2.10-10-current-carbohydrate-adult-evidence

- Stratum: `current_only`
- Query: Which adult health outcomes are associated with higher whole-grain intake in current evidence?
- Required: `r2.10-10-current-carbohydrate-adult-evidence::CURRENT`
- Deprecated: `r2.10-10-current-carbohydrate-adult-evidence::OLD`
- Rationale: CURRENT directly answers the present evidence question.

OLD (2003, PDF page 5, printed page 58):

> Historically, whole grains, fruits, and vegetables were preferred fibre-rich carbohydrate foods.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 37, chunk `who-carbohydrate-2023-page-37-pass-0-c5eda1ef80`):

> Current adult evidence links higher whole-grain intake with lower mortality, cardiovascular disease, diabetes, and colorectal-cancer risk.

Source: https://www.who.int/publications/i/item/9789240073593

## r2.10-11-current-nss-long-term-effects

- Stratum: `current_only`
- Query: What long-term benefits and risks does current evidence report for non-sugar sweeteners?
- Required: `r2.10-11-current-nss-long-term-effects::CURRENT`
- Deprecated: `r2.10-11-current-nss-long-term-effects::OLD`
- Rationale: CURRENT fully answers the current evidence question.

OLD (2003, PDF page 56, printed page 109):

> Historical free-sugar guidance did not treat non-nutritive sweeteners as sugars.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 34, chunk `who-nss-2023-page-34-pass-1-062872d547`):

> Current evidence reports no long-term body-fat benefit from non-sugar sweeteners and possible increased risks of diabetes, cardiovascular disease, mortality, and preterm birth.

Source: https://www.who.int/publications/i/item/9789240073616

## r2.10-12-current-lsss-policy-context

- Stratum: `current_only`
- Query: What current policy process is required before adopting lower-sodium salt substitutes?
- Required: `r2.10-12-current-lsss-policy-context::CURRENT`
- Deprecated: `r2.10-12-current-lsss-policy-context::OLD`
- Rationale: CURRENT fully answers the current policy-process question.

OLD (2003, PDF page 37, printed page 90):

> Historically, potassium-enriched lower-sodium salt was one possible sodium-reduction measure.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2025, PDF page 40, chunk `who-lsss-2025-page-40-pass-2-cc04d44aac`):

> Current guidance says conditional lower-sodium-salt policy requires setting-specific discussion and should accompany broader salt-reduction interventions.

Source: https://www.who.int/publications/i/item/9789240105591

## r2.10-13-hard-sfa-below-ten-evidence

- Stratum: `hard_negative_current`
- Query: What does current evidence say about LDL reduction and undesirable effects below ten percent saturated fat?
- Required: `r2.10-13-hard-sfa-below-ten-evidence::CURRENT`
- Deprecated: `r2.10-13-hard-sfa-below-ten-evidence::OLD`
- Rationale: CURRENT is the only required evidence despite strong lexical similarity to OLD.

OLD (2003, PDF page 3, printed page 56):

> An earlier population goal kept saturated fat below 10 percent of energy.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 47, chunk `who-sat-trans-fat-2023-page-47-pass-1-1c716a307f`):

> Current evidence finds greater LDL reduction below 10 percent saturated fat and no important undesirable effects.

Source: https://www.who.int/publications/i/item/9789240073630

## r2.10-14-hard-carbohydrate-child-evidence

- Stratum: `hard_negative_current`
- Query: How complete and consistent is the current child evidence for whole grains, vegetables, fruits, and pulses?
- Required: `r2.10-14-hard-carbohydrate-child-evidence::CURRENT`
- Deprecated: `r2.10-14-hard-carbohydrate-child-evidence::OLD`
- Rationale: CURRENT supplies the requested evidence-quality assessment; OLD is a lexical hard negative.

OLD (2003, PDF page 5, printed page 58):

> Historical population guidance favoured whole grains, vegetables, and fruits.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 37, chunk `who-carbohydrate-2023-page-37-pass-1-92354bb179`):

> Current child and adolescent evidence is consistent with adult benefits but is limited and not suitable for meta-analysis.

Source: https://www.who.int/publications/i/item/9789240073593

## r2.10-15-hard-nss-delivery-forms

- Stratum: `hard_negative_current`
- Query: Through which delivery forms were non-sugar sweeteners administered in current trials?
- Required: `r2.10-15-hard-nss-delivery-forms::CURRENT`
- Deprecated: `r2.10-15-hard-nss-delivery-forms::OLD`
- Rationale: CURRENT alone answers the delivery-form question; OLD is a lexical hard negative.

OLD (2003, PDF page 56, printed page 109):

> Historical discussion distinguished sugars across beverages and solid foods.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2023, PDF page 34, chunk `who-nss-2023-page-34-pass-2-0292be3f67`):

> Current non-sugar-sweetener trials delivered sweeteners through premixed beverages, participant-added products, solid foods, and capsules.

Source: https://www.who.int/publications/i/item/9789240073616

## r2.10-16-hard-lsss-evidence-basis

- Stratum: `hard_negative_current`
- Query: What is the current evidence-certainty basis for the lower-sodium-salt recommendation?
- Required: `r2.10-16-hard-lsss-evidence-basis::CURRENT`
- Deprecated: `r2.10-16-hard-lsss-evidence-basis::OLD`
- Rationale: CURRENT alone supplies the evidence-certainty answer; OLD is a close topical distractor.

OLD (2003, PDF page 37, printed page 90):

> Earlier guidance treated lower-sodium salt as a plausible sodium-reduction tool.

Source: https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf

CURRENT (2025, PDF page 41, chunk `who-lsss-2025-page-41-pass-0-74fd4aa2a9`):

> Current lower-sodium-salt guidance bases its rationale on moderate-to-low-certainty evidence assessed under GRADE.

Source: https://www.who.int/publications/i/item/9789240105591

