import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  R212_CONFIRMATION_MINIMUM_COUNTS,
  r212EvidenceKey,
  validateR212ConfirmationLedger,
} from "../../src/annotation/validate_r2_12_confirmation";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const GROUP_DIR = path.join(
  EXP,
  "data/annotations_v5/r2_12_predeclared_candidate_groups",
);
const REVIEW_DIR = path.join(
  EXP,
  "data/annotations_v5/r2_12_candidate_groups_codex_reviewed",
);
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_12_confirmation_codex_reviewed",
);
const PACKET = path.join(EXP, "R2_12_CONFIRMATION_OWNER_REVIEW_PACKET.md");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const jsonl = (rows: unknown[]) =>
  `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

type Stratum =
  | "conditional_merge"
  | "compatible_history"
  | "current_only"
  | "hard_negative_current";
type Spec = {
  id: string;
  group: string;
  stratum: Stratum;
  query: string;
  retainedClaim?: string;
  currentClaim: string;
  unsafeClaim?: string;
};
const specs: Spec[] = [
  {
    id: "cm-sodium-target-substitute",
    group: "r2.12-pre-0cfeb43aed8f9649bc",
    stratum: "conditional_merge",
    query:
      "What sodium target supports cardiovascular prevention, and how can lower-sodium table salt contribute?",
    retainedClaim:
      "WHO recommends reducing adult sodium intake below 2 g per day to reduce blood pressure and cardiovascular risk.",
    currentClaim:
      "WHO conditionally recommends lower-sodium salt substitutes for discretionary table salt to reduce blood pressure and cardiovascular disease risk.",
  },
  {
    id: "cm-sodium-excretion-substitute",
    group: "r2.12-pre-d7e4193cf1cc0c5077",
    stratum: "conditional_merge",
    query:
      "How does usual sodium exposure compare with physiological need, and what urinary changes can a lower-sodium substitute produce?",
    retainedClaim:
      "Population sodium intake commonly exceeds the small amount estimated to be necessary for physiological function.",
    currentClaim:
      "Trials of lower-sodium salt substitutes indicate lower urinary sodium and higher urinary potassium excretion on average.",
  },
  {
    id: "cm-potassium-benefit-renal-safety",
    group: "r2.12-pre-41941f43a41ce801d6",
    stratum: "conditional_merge",
    query:
      "How can increasing potassium support blood-pressure control, and what renal limitation matters for a salt-substitute programme?",
    retainedClaim:
      "Evidence supports increasing potassium intake to decrease blood pressure in adults.",
    currentClaim:
      "Potassium safety evidence does not establish safety for people with renal impairment because such patients were excluded from reviewed trials.",
  },
  {
    id: "cm-potassium-level-population-risk",
    group: "r2.12-pre-a470c9d0da85afba56",
    stratum: "conditional_merge",
    query:
      "What adult potassium level is suggested for benefit, and how should population salt substitution balance benefit against hyperkalaemia risk?",
    retainedClaim:
      "The adult potassium intake level of at least 90 mmol per day is conditional because the precise level for maximum benefit is uncertain.",
    currentClaim:
      "At population level, potassium-based sodium replacement may reduce blood pressure and stroke but can increase hyperkalaemia risk in susceptible people.",
  },
  {
    id: "cm-sugary-drinks-nss-tradeoff",
    group: "r2.12-pre-54a4e84f9f4c836e83",
    stratum: "conditional_merge",
    query:
      "What weight concern is associated with high sugar-sweetened beverage intake, and what long-term concern accompanies non-sugar sweetener use?",
    retainedClaim:
      "Children with the highest sugar-sweetened beverage intakes had greater odds of overweight or obesity.",
    currentClaim:
      "Higher non-sugar sweetener intake was associated with increased all-cause and cardiovascular mortality in prospective evidence.",
  },
  {
    id: "cm-sugars-nss-outcome-set",
    group: "r2.12-pre-cdd0ffd2132b2c9b90",
    stratum: "conditional_merge",
    query:
      "Which weight and dental outcomes should a programme consider when reducing free sugars and evaluating non-sugar sweetener replacement?",
    retainedClaim:
      "WHO commissioned evidence reviews on free sugars in relation to excess weight gain and dental caries.",
    currentClaim:
      "The non-sugar sweetener guideline evaluates replacement effects through prioritized policy and programme questions.",
  },
  {
    id: "cm-total-fat-context",
    group: "r2.12-pre-9f2d32190c4930b350",
    stratum: "conditional_merge",
    query:
      "How should total-fat advice reflect population context while addressing unhealthy weight gain?",
    retainedClaim:
      "Population total-fat recommendations may be adapted for age, activity, ideal body weight, and prevailing obesity.",
    currentClaim:
      "Dietary transitions toward higher-fat diets occur alongside widespread unhealthy weight gain and the double burden of malnutrition.",
  },
  {
    id: "cm-fibre-food-sources",
    group: "r2.12-pre-bfac4873a0703fe13e",
    stratum: "conditional_merge",
    query:
      "Which foods supply protective carbohydrate quality, and how is current guidance framed around fibre and food sources?",
    retainedClaim:
      "Wholegrain cereals, fruits, and vegetables are important sources of non-starch polysaccharides.",
    currentClaim:
      "Current WHO carbohydrate guidance emphasizes dietary fibre and food sources of carbohydrate.",
  },
  {
    id: "cm-activity-progression-falls",
    group: "r2.12-pre-a42f101cb07d1cc2af",
    stratum: "conditional_merge",
    query:
      "How should an inactive person progress activity, and what injury outcome should an older-adult programme monitor?",
    retainedClaim:
      "People who have been inactive should start slowly and increase duration and frequency over weeks or months.",
    currentClaim:
      "Physical-activity evidence for older adults evaluates falls that cause fracture, head trauma, wounds, or need for medical care.",
  },
  {
    id: "cm-child-activity-settings",
    group: "r2.12-pre-8ca0fa76a56e27f6ef",
    stratum: "conditional_merge",
    query:
      "Who is covered by child activity guidance, and across which everyday settings can activity be accumulated?",
    retainedClaim:
      "The child and youth recommendations apply broadly to ages 5–17 unless a medical condition indicates otherwise.",
    currentClaim:
      "Children and adolescents can be active through play, sport, education, transport, chores, and community settings.",
  },
  {
    id: "ch-sodium-risk-substitute-outcomes",
    group: "r2.12-pre-698d4b713d408d1840",
    stratum: "compatible_history",
    query:
      "What stroke risk supports sodium reduction, and which outcomes are evaluated for lower-sodium salt substitutes?",
    retainedClaim:
      "Sodium intake at or above 2 g per day was associated with higher stroke risk than intake below 2 g per day.",
    currentClaim:
      "Lower-sodium salt-substitute trials evaluate blood pressure and cardiovascular outcomes against regular salt.",
  },
  {
    id: "ch-sodium-evidence-lsss-rationale",
    group: "r2.12-pre-27e00abab835de5b8e",
    stratum: "compatible_history",
    query:
      "Which cardiometabolic outcomes inform sodium reduction, and why are lower-sodium substitutes considered?",
    retainedClaim:
      "The sodium guideline evaluated blood pressure, mortality, cardiovascular disease, stroke, coronary disease, and adverse effects.",
    currentClaim:
      "Lower-sodium salt substitutes are considered because sodium chloride in discretionary salt can be partly replaced.",
  },
  {
    id: "ch-potassium-outcomes-lsss-certainty",
    group: "r2.12-pre-74349e68b1e4a21905",
    stratum: "compatible_history",
    query:
      "Which outcomes guide potassium recommendations, and what evidence-certainty issue shapes salt-substitute advice?",
    retainedClaim:
      "Potassium guideline questions evaluate intake effects across blood-pressure and cardiovascular outcomes.",
    currentClaim:
      "The lower-sodium salt-substitute recommendation reflects moderate-to-low certainty evidence across outcomes.",
  },
  {
    id: "ch-low-potassium-benefit-risk",
    group: "r2.12-pre-9855df9618092c6fea",
    stratum: "compatible_history",
    query:
      "Why does potassium intake matter for noncommunicable disease prevention, and how should salt substitution weigh desirable and undesirable effects?",
    retainedClaim:
      "Low potassium intake is associated with elevated blood pressure and noncommunicable disease risk.",
    currentClaim:
      "Lower-sodium salt-substitute guidance explicitly weighs desirable and undesirable population effects.",
  },
  {
    id: "ch-free-sugar-nss-long-term",
    group: "r2.12-pre-16c3061019b9deb414",
    stratum: "compatible_history",
    query:
      "How do sugar-reduction trials inform weight control, and what long-term limitation applies to non-sugar sweeteners?",
    retainedClaim:
      "Controlled trials assess body-weight effects when free-sugar intake is increased relative to control intake.",
    currentClaim:
      "Small short-term weight benefits from non-sugar sweeteners may be offset by possible long-term disease and mortality risks.",
  },
  {
    id: "ch-sugars-dental-nss",
    group: "r2.12-pre-241e7b5b29b712bb43",
    stratum: "compatible_history",
    query:
      "What evidence supports reducing free sugars for weight and dental health, and what dental evidence exists for non-sugar sweeteners?",
    retainedClaim:
      "Moderate-certainty evidence links reduced free-sugar intake with body-weight and dental-caries outcomes.",
    currentClaim:
      "Evidence for a dental-caries benefit from non-sugar sweeteners is limited and mainly observed in children under specific comparisons.",
  },
  {
    id: "ch-fat-quality-weight",
    group: "r2.12-pre-3d63b68f771483d1fd",
    stratum: "compatible_history",
    query:
      "How do fat quality and total-fat quantity address cardiovascular health and unhealthy weight gain?",
    retainedClaim:
      "As energy excess increases, restricting particular fatty acids becomes more relevant for cardiovascular health.",
    currentClaim:
      "Current total-fat guidance addresses unhealthy weight gain in the context of obesity and noncommunicable disease.",
  },
  {
    id: "ch-fat-composition-function",
    group: "r2.12-pre-14d23c831c33deef1e",
    stratum: "compatible_history",
    query:
      "Why do both fat composition and total-fat intake matter in dietary guidance?",
    retainedClaim:
      "The qualitative composition of dietary fats can modify cardiovascular risk pathways.",
    currentClaim:
      "Dietary fatty acids provide energy, support absorption, and form structural components of cell membranes.",
  },
  {
    id: "ch-fibre-colorectal-evidence",
    group: "r2.12-pre-9902385c74db75281e",
    stratum: "compatible_history",
    query:
      "What evidence connects fibre-rich foods with colorectal outcomes, and how does current guidance use prospective evidence?",
    retainedClaim:
      "Evidence on fruits, vegetables, fibre, and colorectal cancer was protective in some analyses but inconsistent across large studies.",
    currentClaim:
      "Current carbohydrate guidance considers prospective evidence on dietary fibre, whole grains, vegetables, fruits, and pulses.",
  },
  {
    id: "ch-disability-function",
    group: "r2.12-pre-712b90ccc66281e818",
    stratum: "compatible_history",
    query:
      "How can regular activity support functional ability, and what recommendation applies to adults living with disability?",
    retainedClaim:
      "Regular physical activity is associated with reduced risk of functional limitations in mid-life and older adults.",
    currentClaim:
      "Adults living with disability should undertake regular physical activity and follow aerobic activity recommendations.",
  },
  {
    id: "co-nss-obesity-context",
    group: "r2.12-pre-3f10dec0f770ab90ea",
    stratum: "current_only",
    query:
      "What population-health problem motivates current guidance on non-sugar sweeteners?",
    currentClaim:
      "Escalating overweight and obesity affect billions of people and motivate guidance on non-sugar sweetener use.",
  },
  {
    id: "co-nss-subgroup-analysis",
    group: "r2.12-pre-c5e6068e7e1901539a",
    stratum: "current_only",
    query:
      "Which product-use distinctions can be considered when analysing non-sugar sweetener evidence?",
    currentClaim:
      "Non-sugar sweetener evidence can distinguish discretionary from packaged use and solid from liquid products.",
  },
  {
    id: "co-total-fat-children",
    group: "r2.12-pre-febd26f5da4bbcdef5",
    stratum: "current_only",
    query:
      "Why should evidence about total-fat intake in adults not automatically be applied to children?",
    currentClaim:
      "Adult total-fat evidence could not automatically be extrapolated to children because children have unique energy needs for growth and development.",
  },
  {
    id: "co-carbohydrate-replacement",
    group: "r2.12-pre-b2de3d8ecd9ee444d7",
    stratum: "current_only",
    query:
      "What is the status of current WHO guidance on carbohydrate intake?",
    currentClaim:
      "The current carbohydrate guideline replaces earlier WHO guidance on carbohydrate intake.",
  },
  {
    id: "co-carbohydrate-food-sources",
    group: "r2.12-pre-26df9d90ede3abcb5b",
    stratum: "current_only",
    query:
      "Which food groups are principal dietary-fibre sources in current carbohydrate guidance?",
    currentClaim:
      "Whole grains, vegetables, fruits, and pulses are principal dietary sources of fibre considered by current guidance.",
  },
  {
    id: "co-disability-outcomes",
    group: "r2.12-pre-5827e68e7515bfc239",
    stratum: "current_only",
    query:
      "Which health domains are examined when evaluating activity for people living with disability?",
    currentClaim:
      "Evidence for people living with disability examines comorbidity risk, physical and cognitive function, and health-related quality of life.",
  },
  {
    id: "hn-total-fat-child-scope",
    group: "r2.12-pre-dbd985d66f699571f1",
    stratum: "hard_negative_current",
    query:
      "What population and outcome define the current total-fat evidence question?",
    currentClaim:
      "The current total-fat evidence question concerns apparently healthy adults or children and measures of body fatness.",
    unsafeClaim:
      "A broad older child-obesity prevention passage is forbidden because it does not define the current total-fat evidence population or intervention.",
  },
  {
    id: "hn-trans-fat-replacement",
    group: "r2.12-pre-665e6a17a683f45504",
    stratum: "hard_negative_current",
    query:
      "Which replacement nutrients are evaluated in the current trans-fat recommendation rationale?",
    currentClaim:
      "Current trans-fat guidance evaluates replacement with polyunsaturated and plant-source monounsaturated fatty acids.",
    unsafeClaim:
      "An older fish-and-nut observational passage is forbidden because it does not specify the current trans-fat replacement recommendation.",
  },
  {
    id: "hn-carbohydrate-quality",
    group: "r2.12-pre-8e337651348bc86869",
    stratum: "hard_negative_current",
    query:
      "Which carbohydrate-quality concerns are addressed by the current guideline?",
    currentClaim:
      "Current carbohydrate guidance addresses harmful high free-sugar intake and benefits of dietary fibre and carbohydrate-source foods.",
    unsafeClaim:
      "An older passage limited to comparative sugar cariogenicity is forbidden because it cannot answer the broader current carbohydrate-quality question.",
  },
  {
    id: "hn-fibre-evidence",
    group: "r2.12-pre-8f988df975edb71e37",
    stratum: "hard_negative_current",
    query:
      "What current evidence supports fibre-rich foods for adult health outcomes?",
    currentClaim:
      "Current guidance reports prospective evidence supporting whole grains and fibre-rich foods across adult health outcomes.",
    unsafeClaim:
      "An older bibliography fragment is forbidden because it contains citations rather than an applicable recommendation or synthesized finding.",
  },
  {
    id: "hn-fibre-body-fatness",
    group: "r2.12-pre-b6dbd0f30bf62eb52f",
    stratum: "hard_negative_current",
    query:
      "What does current evidence indicate about fibre intake and body-fatness outcomes?",
    currentClaim:
      "Current evidence evaluates associations between dietary fibre and measures of body fatness.",
    unsafeClaim:
      "An older small-trial weight-loss review is forbidden because it is not the current synthesized fibre recommendation evidence.",
  },
  {
    id: "hn-disability-population",
    group: "r2.12-pre-c962ce7ea66683946b",
    stratum: "hard_negative_current",
    query:
      "What benefits are specifically considered for children and adults living with disability?",
    currentClaim:
      "Current guidance states that many general activity benefits also apply to adults living with disability and considers additional disability-related benefits.",
    unsafeClaim:
      "A recommendation limited to adults aged 65 years and older is forbidden because age alone does not establish applicability to the disability population.",
  },
];

const [
  groupsText,
  groupManifestText,
  reviewsText,
  reviewManifestText,
  v4ManifestText,
  r211ManifestText,
] = await Promise.all([
  readFile(path.join(GROUP_DIR, "candidate_groups.predeclared.jsonl"), "utf8"),
  readFile(path.join(GROUP_DIR, "MANIFEST.json"), "utf8"),
  readFile(path.join(REVIEW_DIR, "semantic_review.jsonl"), "utf8"),
  readFile(path.join(REVIEW_DIR, "MANIFEST.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v4_devval_draft/source_manifest.json"), "utf8"),
  readFile(path.join(EXP, "data/corpus_v5_r2_11_draft/source_manifest.json"), "utf8"),
]);
const groupManifestSha = sha256(groupManifestText);
const groups = new Map(
  parseJsonl(groupsText).map((group) => [group.candidate_group_id, group]),
);
const eligible = new Set(
  parseJsonl(reviewsText)
    .filter((review) => review.decision.startsWith("eligible"))
    .map((review) => review.candidate_group_id),
);
const documents = new Map(
  [
    ...JSON.parse(v4ManifestText).documents,
    ...JSON.parse(r211ManifestText).documents,
  ].map((document) => [document.document_id, document]),
);
const evidence = (
  specId: string,
  candidate: any,
  role: "current" | "retained" | "forbidden",
  claim: string,
) => {
  const document: any = documents.get(candidate.document_id);
  if (!document) throw new Error(`Missing document ${candidate.document_id}`);
  return {
    item_id: `r2.12-${specId}-${role}`,
    role,
    document_id: candidate.document_id,
    atomic_claim_text: claim,
    official_record_url:
      document.official_record_url ?? document.official_page_url,
    official_pdf_url: document.official_pdf_url ?? document.download_url,
    local_path: document.local_path,
    source_sha256: candidate.source_sha256,
    locator: {
      page_number: candidate.page_number,
      chunk_id: candidate.chunk_id,
    },
  };
};
const records = specs.map((spec) => {
  const group: any = groups.get(spec.group);
  if (!group || !eligible.has(spec.group)) {
    throw new Error(`Group is not eligible: ${spec.group}`);
  }
  const [left, right] = group.candidate_items;
  const implicit =
    spec.stratum === "conditional_merge" ||
    spec.stratum === "compatible_history";
  return {
    schema_version: "v5-r2.12-confirmation-annotation-1",
    query_id: `r2.12-confirm-${spec.id}`,
    split: "development_confirmation",
    stratum: spec.stratum,
    lineage_group_id: `r2.12-lineage-${sha256(spec.group).slice(0, 18)}`,
    topic_id: group.source_family,
    query_text: spec.query,
    predeclared_candidate_group_id: spec.group,
    candidate_group_manifest_sha256: groupManifestSha,
    required_current_evidence: [
      evidence(spec.id, right, "current", spec.currentClaim),
    ],
    required_retained_evidence: implicit
      ? [
          evidence(
            spec.id,
            left,
            "retained",
            spec.retainedClaim as string,
          ),
        ]
      : [],
    deprecated_evidence: [],
    forbidden_evidence:
      spec.stratum === "hard_negative_current"
        ? [
            evidence(
              spec.id,
              left,
              "forbidden",
              spec.unsafeClaim as string,
            ),
          ]
        : [],
    implicit_retained_rationale: implicit
      ? "The two clauses require distinct, predeclared passages: the retained passage supplies the still-applicable foundation and the current passage supplies the present scope, evidence, or implementation detail."
      : undefined,
    annotation_rationale:
      spec.stratum === "hard_negative_current"
        ? "The current passage directly answers the scoped question; the older candidate is a plausible but unsafe scope or evidence-status distractor."
        : "Evidence roles were assigned through semantic review of official passages after candidate-group freeze and before any confirmation retrieval outcome.",
    review: {
      status: "codex_provisional",
      reviewer_id: "codex_semantic_reviewer",
      reviewer_type: "codex_non_owner",
      independent_blinded_or_clinical_review: false,
      retrieval_outcomes_observed: false,
      r2_10_outcomes_used: false,
      r2_11_outcomes_used: false,
      r2_12_diagnostic_outcomes_used: false,
    },
  };
});

const exclusionPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
];
const exclusionTexts = await Promise.all(
  exclusionPaths.map((relativePath) =>
    readFile(path.join(EXP, relativePath), "utf8"),
  ),
);
const forbiddenLineages = new Set<string>();
const forbiddenRequiredEvidence = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    if (record.lineage_group_id) forbiddenLineages.add(record.lineage_group_id);
    for (const field of [
      "required_current_evidence",
      "required_retained_evidence",
    ]) {
      for (const item of record[field] ?? []) {
        forbiddenRequiredEvidence.add(r212EvidenceKey(item));
      }
    }
  }
}
const candidateGroups = new Map(
  [...groups].map(([id, group]: [string, any]) => [
    id,
    new Set<string>(
      group.candidate_items.map((item: any) => item.evidence_key),
    ),
  ]),
);
const errors = validateR212ConfirmationLedger(records, {
  forbiddenLineageIds: forbiddenLineages,
  forbiddenRequiredEvidenceKeys: forbiddenRequiredEvidence,
  candidateGroups,
  candidateGroupManifestSha256: groupManifestSha,
});
if (errors.length > 0) {
  throw new Error(`R2.12 provisional ledger invalid: ${JSON.stringify(errors)}`);
}
const freezeErrors = validateR212ConfirmationLedger(records, {
  forbiddenLineageIds: forbiddenLineages,
  forbiddenRequiredEvidenceKeys: forbiddenRequiredEvidence,
  candidateGroups,
  candidateGroupManifestSha256: groupManifestSha,
  requireFreezeReady: true,
});
if (
  freezeErrors.length !== 1 ||
  freezeErrors[0].type !== "ReviewStatus" ||
  !freezeErrors[0].message.startsWith("32 records")
) {
  throw new Error(`Unexpected freeze blockers: ${JSON.stringify(freezeErrors)}`);
}
const counts = Object.fromEntries(
  Object.keys(R212_CONFIRMATION_MINIMUM_COUNTS).map((stratum) => [
    stratum,
    records.filter((record) => record.stratum === stratum).length,
  ]),
);
const recordsText = jsonl(records);
const packetLines = [
  "# R2.12 Confirmation Owner Review Packet",
  "",
  "Scope: 32 Development-confirmation annotations; no retrieval has run.",
  "",
  `Provisional ledger SHA-256: \`${sha256(recordsText)}\``,
  `Predeclared candidate-group manifest SHA-256: \`${groupManifestSha}\``,
  "",
  "Counts: conditional_merge=10, compatible_history=10, current_only=6, hard_negative_current=6.",
  "",
  ...records.flatMap((record, index) => [
    `## ${index + 1}. ${record.query_id}`,
    "",
    `- Stratum: \`${record.stratum}\``,
    `- Query: ${record.query_text}`,
    `- Current: ${record.required_current_evidence[0].atomic_claim_text}`,
    ...(record.required_retained_evidence.length
      ? [
          `- Retained: ${record.required_retained_evidence[0].atomic_claim_text}`,
        ]
      : []),
    ...(record.forbidden_evidence.length
      ? [`- Forbidden: ${record.forbidden_evidence[0].atomic_claim_text}`]
      : []),
    `- Candidate group: \`${record.predeclared_candidate_group_id}\``,
    "",
  ]),
  "## Approval boundary",
  "",
  "Approval confirms the 32 checksum-bound annotations only. It does not authorize Validation, fresh-test execution, or a promotion claim. Confirmation retrieval remains blocked until approval is recorded and the full runtime package is frozen.",
  "",
];
const packetText = `${packetLines.join("\n")}\n`;
const manifest = {
  schema_version: "v5-r2.12-confirmation-provisional-manifest-1",
  status: "codex_provisional_owner_review_required",
  provisional_record_count: records.length,
  stratum_counts: counts,
  minimum_counts_satisfied: Object.entries(
    R212_CONFIRMATION_MINIMUM_COUNTS,
  ).every(([stratum, minimum]) => counts[stratum] >= minimum),
  validator_error_count: errors.length,
  freeze_blockers: freezeErrors,
  forbidden_lineage_count: forbiddenLineages.size,
  forbidden_required_evidence_count: forbiddenRequiredEvidence.size,
  required_evidence_overlap_count: records
    .flatMap((record) => [
      ...record.required_current_evidence,
      ...record.required_retained_evidence,
    ])
    .filter((item) => forbiddenRequiredEvidence.has(r212EvidenceKey(item)))
    .length,
  candidate_group_manifest_sha256: groupManifestSha,
  candidate_group_review_manifest_sha256: sha256(reviewManifestText),
  candidate_group_semantic_review_sha256: sha256(reviewsText),
  provisional_annotations_sha256: sha256(recordsText),
  owner_review_packet_path: "R2_12_CONFIRMATION_OWNER_REVIEW_PACKET.md",
  owner_review_packet_sha256: sha256(packetText),
  project_owner_approval_required: true,
  retrieval_allowed: false,
  validation_allowed: false,
  fresh_test_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "provisional_annotations.jsonl"), recordsText),
  writeFile(path.join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(PACKET, packetText),
]);
console.log(JSON.stringify(manifest, null, 2));
