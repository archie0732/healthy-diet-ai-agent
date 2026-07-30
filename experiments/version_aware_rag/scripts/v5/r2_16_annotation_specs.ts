export type R216Stratum =
  | "conditional_merge"
  | "compatible_history"
  | "current_only"
  | "hard_negative_current";

export type R216AnnotationSpec = {
  id: string;
  group: string;
  stratum: R216Stratum;
  query: string;
  retainedClaim?: string;
  currentClaim: string;
  unsafeClaim?: string;
};

export const R216_ANNOTATION_SPECS: R216AnnotationSpec[] = [
  {
    id: "cm-sodium-dbp-effect",
    group: "r2.16-pre-703689c89004755263",
    stratum: "conditional_merge",
    query:
      "What diastolic blood-pressure effects support sodium reduction and lower-sodium salt substitution?",
    retainedClaim:
      "Reduced sodium intake produced a mean decrease in resting diastolic blood pressure.",
    currentClaim:
      "Lower-sodium salt-substitute trials produced an average reduction in diastolic blood pressure.",
  },
  {
    id: "cm-sodium-sbp-monitoring",
    group: "r2.16-pre-c6d532c5af83fc3371",
    stratum: "conditional_merge",
    query:
      "How should blood-pressure benefit and population exposure monitoring be combined in sodium policy?",
    retainedClaim:
      "Decreased sodium intake reduced resting systolic blood pressure across trial comparisons.",
    currentClaim:
      "Population monitoring should estimate total sodium and potassium intake when lower-sodium substitutes are introduced.",
  },
  {
    id: "cm-sodium-population-scope",
    group: "r2.16-pre-b2931d596a23cf9839",
    stratum: "conditional_merge",
    query:
      "Who is covered by sodium guidance, and which uses are covered by the salt-substitute recommendation?",
    retainedClaim:
      "Sodium recommendations apply broadly to people with or without hypertension, including pregnant and lactating women.",
    currentClaim:
      "The lower-sodium salt-substitute recommendation applies to discretionary salt use and has defined exclusions.",
  },
  {
    id: "cm-salt-iodization-discretionary-use",
    group: "r2.16-pre-6c2d1b28ad847c4bd7",
    stratum: "conditional_merge",
    query:
      "How can salt reduction remain compatible with iodization without encouraging greater discretionary salt use?",
    retainedClaim:
      "Salt reduction and salt iodization are compatible and should be monitored together.",
    currentClaim:
      "People should not interpret salt-substitute guidance as encouragement to increase discretionary salt use.",
  },
  {
    id: "cm-sodium-balance-generalizability",
    group: "r2.16-pre-a4f4fc0f67145895c0",
    stratum: "conditional_merge",
    query:
      "What physiological and generalizability considerations matter when evaluating salt substitutes?",
    retainedClaim:
      "Urinary excretion is the primary mechanism for maintaining sodium balance after absorption.",
    currentClaim:
      "Salt-substitute research should include populations representative of people without hypertension or cardiovascular disease.",
  },
  {
    id: "cm-potassium-metabolic-followup",
    group: "r2.16-pre-6ef924ad23f53e31a7",
    stratum: "conditional_merge",
    query:
      "Which metabolic outcomes and follow-up durations inform potassium-related interventions?",
    retainedClaim:
      "Potassium evidence evaluated lipid outcomes including HDL cholesterol and triglycerides.",
    currentClaim:
      "Lower-sodium salt-substitute trials followed participants over periods ranging from weeks to months.",
  },
  {
    id: "cm-potassium-mortality-dbp",
    group: "r2.16-pre-ed4d89acda9db97b13",
    stratum: "conditional_merge",
    query:
      "How should uncertain mortality evidence be considered alongside blood-pressure effects of salt substitution?",
    retainedClaim:
      "Evidence for all-cause mortality with increased potassium was imprecise and crossed benefit and harm thresholds.",
    currentClaim:
      "Lower-sodium salt-substitute studies reported reductions in diastolic blood pressure of varying magnitude.",
  },
  {
    id: "cm-potassium-bp-pooled-effect",
    group: "r2.16-pre-dd5ade3a1049de2dc2",
    stratum: "conditional_merge",
    query:
      "What evidence supports a blood-pressure effect from increased potassium and salt substitution?",
    retainedClaim:
      "Meta-analyses suggest increased potassium can have its greatest impact on blood pressure under relevant intake conditions.",
    currentClaim:
      "Salt-substitute trials at low or unclear risk of bias confirmed a pooled blood-pressure effect.",
  },
  {
    id: "cm-potassium-adverse-blood-level",
    group: "r2.16-pre-d4c48b15f1866838a1",
    stratum: "conditional_merge",
    query:
      "What safety evidence should accompany potassium-based salt-substitute use?",
    retainedClaim:
      "Short potassium trials reported no participant complaints of adverse effects.",
    currentClaim:
      "Meta-analysis found a small average increase in blood potassium with lower-sodium salt substitutes.",
  },
  {
    id: "cm-sugars-nss-long-term",
    group: "r2.16-pre-050ef281c77de3a4d4",
    stratum: "conditional_merge",
    query:
      "How do free-sugar weight effects compare with the long-term evidence for non-sugar sweeteners?",
    retainedClaim:
      "Changes in free-sugar intake are associated with parallel changes in body weight.",
    currentClaim:
      "Non-sugar sweeteners show no long-term body-fatness benefit and may have undesirable long-term effects.",
  },
  {
    id: "ch-potassium-food-fortification",
    group: "r2.16-pre-1e7d714155537600e8",
    stratum: "compatible_history",
    query:
      "How do food-based potassium evidence and participant risk affect implementation?",
    retainedClaim:
      "Eligible studies did not specifically evaluate potassium fortification of food.",
    currentClaim:
      "Salt-substitute safety evidence depends on the potassium-risk status of included participants.",
  },
  {
    id: "ch-potassium-mortality-exclusions",
    group: "r2.16-pre-7941fda0eb2e05b0c0",
    stratum: "compatible_history",
    query:
      "What mortality uncertainty and participant exclusions limit potassium-related conclusions?",
    retainedClaim:
      "The single eligible all-cause mortality study produced inconclusive results.",
    currentClaim:
      "Salt-substitute studies excluded people for whom increased potassium could pose a risk.",
  },
  {
    id: "ch-sugar-definition-nss-risk",
    group: "r2.16-pre-6adfabdaf0c355bee8",
    stratum: "compatible_history",
    query:
      "How should free sugars be defined when considering long-term risks of non-sugar sweeteners?",
    retainedClaim:
      "Free sugars include added monosaccharides and disaccharides plus sugars naturally present in specified foods.",
    currentClaim:
      "Possible long-term noncommunicable-disease and mortality risks may outweigh small short-term sweetener effects.",
  },
  {
    id: "ch-obesity-review-energy-compensation",
    group: "r2.16-pre-ff84ea3fd8039afcfa",
    stratum: "compatible_history",
    query:
      "What behavioural consideration complements evidence reviews of sweeteners and obesity?",
    retainedClaim:
      "WHO commissioned systematic evidence review expertise concerning obesity-related dietary questions.",
    currentClaim:
      "People may compensate for non-sugar-sweetened products by consuming other energy-dense foods.",
  },
  {
    id: "ch-guideline-monitoring-feasibility",
    group: "r2.16-pre-7bded2564bff2d95d5",
    stratum: "compatible_history",
    query:
      "How should guideline uptake and feasible implementation be evaluated together?",
    retainedClaim:
      "Guideline impact can be evaluated through its adoption and adaptation across settings.",
    currentClaim:
      "The non-sugar-sweetener recommendation can be implemented through multiple feasible approaches.",
  },
  {
    id: "ch-food-guidelines-existing-measures",
    group: "r2.16-pre-3c9c281ae886c607e4",
    stratum: "compatible_history",
    query:
      "How can locally adapted dietary guidance support implementation of sweetener recommendations?",
    retainedClaim:
      "Food-based dietary guidelines should reflect locally available foods and dietary customs.",
    currentClaim:
      "The sweetener recommendation can be incorporated into existing healthy-diet measures.",
  },
  {
    id: "ch-micronutrient-fat-context",
    group: "r2.16-pre-ac58826b381b14a8a8",
    stratum: "compatible_history",
    query:
      "Why should total-fat guidance be interpreted within broader nutrient and baseline-intake context?",
    retainedClaim:
      "Multiple micronutrients have biochemical and metabolic roles in skeletal health.",
    currentClaim:
      "Most total-fat intervention studies began at intakes near or above thirty percent of energy.",
  },
  {
    id: "ch-activity-weight-child-fat",
    group: "r2.16-pre-f21a43a574d1fb8825",
    stratum: "compatible_history",
    query:
      "How do activity needs for healthy weight complement total-fat guidance for growing children?",
    retainedClaim:
      "Regular moderate-intensity activity supports maintenance of a healthy body weight.",
    currentClaim:
      "Total-fat intakes up to thirty-five percent of energy can support growth in children and adolescents.",
  },
  {
    id: "ch-sterols-sfa-replacement",
    group: "r2.16-pre-a2bc68acff443cecec",
    stratum: "compatible_history",
    query:
      "How do cholesterol-lowering mechanisms complement saturated-fat replacement guidance?",
    retainedClaim:
      "Dietary plant sterols can reduce serum cholesterol by inhibiting cholesterol absorption.",
    currentClaim:
      "Replacing saturated fat with unsaturated fatty acids affects blood lipids and supports lower intake.",
  },
  {
    id: "ch-child-activity-sedentary",
    group: "r2.16-pre-486fc9f537400be322",
    stratum: "compatible_history",
    query:
      "What daily activity and sedentary-behaviour considerations apply to children?",
    retainedClaim:
      "Children should accumulate at least sixty minutes of moderate-to-vigorous activity daily.",
    currentClaim:
      "Higher sedentary behaviour in children is associated with poorer adiposity, cardiometabolic, behavioural, and sleep outcomes.",
  },
  {
    id: "co-lsss-policy-package",
    group: "r2.16-pre-3a8351f234b6a09ff2",
    stratum: "current_only",
    query:
      "Which policy components can support provision and uptake of lower-sodium options?",
    currentClaim:
      "A lower-sodium strategy can combine product provision, behaviour-change communication, mass media, and supporting policies.",
  },
  {
    id: "co-nss-short-term-evidence",
    group: "r2.16-pre-177034cdb84da730de",
    stratum: "current_only",
    query:
      "What limitation applies to evidence linking non-sugar sweeteners with energy intake?",
    currentClaim:
      "Evidence on energy intake comes from short-term trials and is relevant mainly through weight loss or maintenance.",
  },
  {
    id: "co-total-fat-care-differences",
    group: "r2.16-pre-27d1a747b7341d21d0",
    stratum: "current_only",
    query:
      "Did excluding total-fat studies with systematic care differences remove the observed body-weight effect?",
    currentClaim:
      "Excluding studies with systematic differences in care did not materially change the observed body-weight effect.",
  },
  {
    id: "co-fruit-vegetable-forms",
    group: "r2.16-pre-d3e53edc319d983ba4",
    stratum: "current_only",
    query:
      "Are current vegetable and fruit recommendations limited to fresh produce?",
    currentClaim:
      "Current carbohydrate guidance does not limit vegetable and fruit recommendations to fresh forms.",
  },
  {
    id: "co-activity-population-scope",
    group: "r2.16-pre-393874689bad475e36",
    stratum: "current_only",
    query:
      "How broad is the population scope of current physical-activity guidance?",
    currentClaim:
      "Current physical-activity recommendations cover populations from childhood through later adulthood across backgrounds.",
  },
  {
    id: "co-activity-guideline-replacement",
    group: "r2.16-pre-ff25aa92c3a8100025",
    stratum: "current_only",
    query:
      "What is the status of the current WHO physical-activity guidelines?",
    currentClaim:
      "The current physical-activity and sedentary-behaviour guidelines replace the preceding global guidelines.",
  },
  {
    id: "hn-total-fat-subgroup",
    group: "r2.16-pre-41fc59212160a157d5",
    stratum: "hard_negative_current",
    query:
      "Which baseline characteristics were examined in current total-fat subgroup analyses?",
    currentClaim:
      "Current total-fat analyses examined subgroup differences by baseline fat intake and body-mass index.",
    unsafeClaim:
      "The older sodium and blood-pressure passage is forbidden because it does not address total-fat subgroup analyses.",
  },
  {
    id: "hn-total-fat-study-population",
    group: "r2.16-pre-b837610d2d55ebe2d4",
    stratum: "hard_negative_current",
    query:
      "What participant characteristics were represented in current total-fat intervention studies?",
    currentClaim:
      "Current total-fat evidence included studies of men, women, both sexes, varied mean ages, and different health states.",
    unsafeClaim:
      "The older physical-activity passage is forbidden because it does not describe participants in the total-fat evidence base.",
  },
  {
    id: "hn-sfa-carbohydrate-replacement",
    group: "r2.16-pre-58cf931af6acc584ac",
    stratum: "hard_negative_current",
    query:
      "What lipid change is considered when saturated fat is replaced by carbohydrate?",
    currentClaim:
      "Replacing saturated fat with carbohydrate can reduce HDL cholesterol and alter other blood lipids.",
    unsafeClaim:
      "The older diabetes-classification passage is forbidden because it does not answer the fatty-acid replacement question.",
  },
  {
    id: "hn-sfa-guideline-update",
    group: "r2.16-pre-c427ada3d4f355727e",
    stratum: "hard_negative_current",
    query:
      "What guidance is the current saturated- and trans-fat document updating?",
    currentClaim:
      "The current document updates WHO guidance on saturated and trans-fatty acid intake.",
    unsafeClaim:
      "The older cattle-production and nutrition-transition passage is forbidden because it does not identify the guidance update.",
  },
  {
    id: "hn-carbohydrate-oral-health",
    group: "r2.16-pre-d77be7d78e6e335719",
    stratum: "hard_negative_current",
    query:
      "What association does current carbohydrate evidence report for the evaluated oral-health outcome?",
    currentClaim:
      "The current systematic review found no association for the evaluated oral-health comparison.",
    unsafeClaim:
      "The older enamel-demineralization mechanism is forbidden because it does not report the current synthesized association.",
  },
  {
    id: "hn-carbohydrate-glycaemic-evidence",
    group: "r2.16-pre-2efeda6b21e35bba0f",
    stratum: "hard_negative_current",
    query:
      "What does current evidence indicate about lower glycaemic index or load and cardiometabolic risk factors?",
    currentClaim:
      "Current evidence reports little to no cardiometabolic improvement in trials of lower glycaemic index or load.",
    unsafeClaim:
      "The older bibliography fragment is forbidden because citations alone do not state the current synthesized finding.",
  },
];
