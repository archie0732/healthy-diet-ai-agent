# R2.11 Physical Activity Owner Review Packet

Date: 2026-07-24  
Scope: five provisional Development annotations; no retrieval results exist  
Reviewer limitation: Codex is the AI primary reviewer, not an independent,
blinded, human, or clinical reviewer

## Integrity

- Candidate evidence pairs reviewed: 8
- Provisionally accepted: 5
- Rejected: 3
- Annotation validator errors: 0
- R2.10 outcomes used: no
- Retrieval outcomes observed: no
- Provisional ledger SHA-256:
  `addc5ee2b8b7e3d076ee7e7e7932ac6886162d177395bcfd3f2c29e430271267`
- Full semantic review:
  `data/annotations_v5/r2_11_physical_activity_codex_reviewed/semantic_review.jsonl`
- Provisional annotations:
  `data/annotations_v5/r2_11_physical_activity_codex_reviewed/provisional_annotations.jsonl`

Approval of this packet would approve only these five Development annotations.
It would not freeze the R2.11 ledger, permit retrieval, open Validation, or
alter R2.10. At least 51 further approved lineage groups would still be needed.

## Provisionally accepted annotations

### 1. Older-adult capacity and current balance recommendation

Stratum: `conditional_merge`

Query:

> For an older adult with low exercise capacity, how should activity intensity
> be scaled while still meeting aerobic and balance-focused recommendations?

Retained atomic evidence, 2010 PDF page 32:

> Older adults with low exercise capacity may obtain benefits at lower absolute
> intensity and amount than fitter individuals.

Current atomic evidence, 2020 PDF page 14:

> Older adults should complete 150-300 minutes of moderate aerobic activity or
> 75-150 minutes of vigorous activity, and balance-focused multicomponent
> activity on at least three days each week.

Reason both are required: the retained passage supplies the relative-capacity
interpretation; the current passage supplies the aerobic range and balance
schedule.

### 2. Adult benefits and injury-management context

Stratum: `compatible_history`

Query:

> What major health benefits should adults expect from regular activity, and
> how should a population programme manage musculoskeletal injury risk when
> people begin?

Retained atomic evidence, 2010 PDF page 8:

> At 150 minutes of moderate activity per week, musculoskeletal injury rates
> appear uncommon, and a moderate start with gradual progression can reduce
> injury risk.

Current atomic evidence, 2020 PDF page 12:

> Adult physical activity benefits mortality, cardiovascular health,
> hypertension, several cancers, type 2 diabetes, mental and cognitive health,
> sleep, and adiposity.

Reason both are required: the current passage supplies the expanded benefit
set; the retained passage supplies implementation safety context.

### 3. Children with disability and concrete activity types

Stratum: `conditional_merge`

Query:

> For children with disabilities, what weekly activity pattern applies, which
> specific activity types should be included, and what disability-related
> benefits may occur?

Retained atomic evidence, 2010 PDF page 20:

> Children's activity can include resistance exercise, vigorous aerobic
> exercise, and weight-loading activity to support muscle, cardiorespiratory
> fitness, and bone health.

Current atomic evidence, 2020 PDF page 20:

> Children and adolescents living with disability should average 60 minutes of
> mostly aerobic moderate-to-vigorous activity each day across the week and
> include vigorous, muscle- and bone-strengthening activity on at least three
> days.

Reason both are required: the current passage establishes
disability-specific applicability and schedule; the retained passage provides
the requested concrete activity types.

### 4. Adult activity distribution and sedentary replacement

Stratum: `conditional_merge`

Query:

> How should adults integrate activity through the week and daily routines
> while reducing sedentary time, and which health areas does this approach
> address?

Retained atomic evidence, 2010 PDF page 26:

> Regular activity distributed through the week can support daily active
> travel and applies across cardiorespiratory, metabolic, bone, cancer, and
> depression outcomes.

Current atomic evidence, 2020 PDF page 13:

> Adults should limit sedentary time and replace it with physical activity of
> any intensity, including light intensity.

Reason both are required: the retained passage supplies distribution,
daily-life, and health-area context; the current passage supplies the
sedentary replacement recommendation.

### 5. Capacity-relative intensity with chronic conditions

Stratum: `conditional_merge`

Query:

> For an older adult with a chronic condition, how should intensity be
> interpreted relative to capacity while meeting aerobic, strength, and balance
> recommendations?

Retained atomic evidence, 2010 PDF page 32:

> For older adults, moderate-to-vigorous intensity is relative to individual
> capacity, and lower absolute intensity may be appropriate for lower fitness.

Current atomic evidence, 2020 PDF page 18:

> Adults and older adults with chronic conditions should meet the current
> aerobic range, add major-muscle strengthening on at least two days, and for
> older adults add balance-focused multicomponent activity on at least three
> days.

Reason both are required: the retained passage defines capacity-relative
intensity; the current passage supplies chronic-condition-specific aerobic,
strength, and balance requirements.

## Rejected candidates

1. Child target/frequency: current evidence fully supplies the updated answer;
   retained evidence would be unnecessary.
2. Adult target/bout duration: current evidence supplies current targets and
   the former 10-minute bout requirement is not retained.
3. Adult disability candidate: proposed retained evidence was about children,
   so the population alignment was invalid.

## Requested owner decision

Please either:

- approve all five current provisional annotations;
- list the annotation numbers that require revision; or
- reject the packet.

