import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  R214_CONFIRMATION_MINIMUM_COUNTS,
  r214EvidenceKey,
  validateR214ConfirmationLedger,
} from "../../src/annotation/validate_r2_14_confirmation";

const EXP = path.join(process.cwd(), "experiments/version_aware_rag");
const GROUP_DIR = path.join(
  EXP,
  "data/annotations_v5/r2_14_predeclared_candidate_groups",
);
const REVIEW_DIR = path.join(
  EXP,
  "data/annotations_v5/r2_14_candidate_groups_codex_reviewed",
);
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_14_confirmation_codex_reviewed",
);
const PACKET = path.join(EXP, "R2_14_CONFIRMATION_OWNER_REVIEW_PACKET.md");
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
    id: "cm-sodium-exposure-hypertension",
    group: "r2.14-pre-c4d926e23314d131ef",
    stratum: "conditional_merge",
    query:
      "How do observed sodium exposure and salt-substitute evidence inform hypertension prevention?",
    retainedClaim:
      "Cohort evidence reports materially different sodium-intake levels across exposure groups.",
    currentClaim:
      "Lower-sodium salt-substitute evidence includes hypertension prevalence or incidence outcomes.",
  },
  {
    id: "cm-sodium-cvd-outcomes",
    group: "r2.14-pre-d1de417f76d1623bfa",
    stratum: "conditional_merge",
    query:
      "Which cardiovascular evidence and outcomes should guide a sodium-reduction programme?",
    retainedClaim:
      "The sodium guideline reviewed evidence on cardiovascular disease and coronary heart disease.",
    currentClaim:
      "The lower-sodium salt-substitute guideline selected outcomes to guide systematic evidence review.",
  },
  {
    id: "cm-sodium-intervention-reformulation",
    group: "r2.14-pre-806e312e12f7aaf38b",
    stratum: "conditional_merge",
    query:
      "How can nutrient guidance support sodium interventions and product reformulation?",
    retainedClaim:
      "The sodium nutrient guideline can support systematic development of nutrition interventions.",
    currentClaim:
      "Lower-sodium substitutes can support reformulation when further sodium reduction in manufactured foods is difficult.",
  },
  {
    id: "cm-child-sodium-lsss-evidence",
    group: "r2.14-pre-3f68da5ca88e059bf5",
    stratum: "conditional_merge",
    query:
      "What evidence limitations matter when considering sodium reduction and salt substitutes for children?",
    retainedClaim:
      "A small child study comparing reduced and usual sodium intake reported no change.",
    currentClaim:
      "The salt-substitute guideline reports child blood-pressure estimates with substantial uncertainty.",
  },
  {
    id: "cm-potassium-target-lsss-settings",
    group: "r2.14-pre-f0f52dd92079939cbd",
    stratum: "conditional_merge",
    query:
      "What potassium intake level supports blood-pressure control, and where can lower-sodium substitutes be used?",
    retainedClaim:
      "WHO suggests at least 90 mmol, or 3510 mg, of potassium per day for adults.",
    currentClaim:
      "Lower-sodium salt substitutes can be used in discretionary salt and sodium-containing condiments.",
  },
  {
    id: "cm-potassium-level-renal-safety",
    group: "r2.14-pre-5d04765730d2df77cf",
    stratum: "conditional_merge",
    query:
      "How should an adult potassium target be combined with renal safety limits for salt substitution?",
    retainedClaim:
      "The potassium guideline evaluates increasing adult intake to at least 90 mmol per day.",
    currentClaim:
      "Salt-substitute safety evidence is not generalizable to people at risk of high blood potassium.",
  },
  {
    id: "cm-potassium-effects-benefit-risk",
    group: "r2.14-pre-67b7b31cb94666b07e",
    stratum: "conditional_merge",
    query:
      "How should intervention differences and benefit-risk balance shape potassium-based salt substitution?",
    retainedClaim:
      "The potassium guideline examined whether effects differed by type of intervention.",
    currentClaim:
      "The salt-substitute recommendation weighs the balance of desirable and undesirable effects.",
  },
  {
    id: "cm-child-potassium-setting-risk",
    group: "r2.14-pre-3d0ddc2eb493a27e89",
    stratum: "conditional_merge",
    query:
      "How do child blood-pressure evidence and setting-specific exposure affect implementation decisions?",
    retainedClaim:
      "Child evidence was consistent with a beneficial blood-pressure effect from increased potassium intake.",
    currentClaim:
      "Absolute salt-substitute intake can vary by setting and alter both benefits and risks.",
  },
  {
    id: "cm-sugars-nss-body-fatness",
    group: "r2.14-pre-6853b806b1f9a2f504",
    stratum: "conditional_merge",
    query:
      "What body-weight evidence informs reducing free sugars and using non-sugar sweeteners?",
    retainedClaim:
      "The free-sugars review included randomized trials and prospective studies of body weight.",
    currentClaim:
      "Meta-analyses did not find significant associations between non-sugar sweetener use and some other body-fatness measures.",
  },
  {
    id: "cm-sugars-nss-population",
    group: "r2.14-pre-ee06bc1d0a9c6f884e",
    stratum: "conditional_merge",
    query:
      "How broadly do sugar-reduction and non-sugar-sweetener recommendations apply?",
    retainedClaim:
      "WHO sugar guidance was developed within longstanding work on diet and noncommunicable disease prevention.",
    currentClaim:
      "With a stated exception for people with diabetes, the non-sugar-sweetener recommendation applies across ages and life stages.",
  },
  {
    id: "ch-potassium-subgroup-caution",
    group: "r2.14-pre-6fdc7995867b266d8f",
    stratum: "compatible_history",
    query:
      "What duration and subgroup caveats apply when interpreting potassium-related effects?",
    retainedClaim:
      "The potassium evidence review considered effects after four or more weeks of increased consumption.",
    currentClaim:
      "Salt-substitute subgroup findings may not be robust and should be interpreted cautiously.",
  },
  {
    id: "ch-potassium-food-feasibility",
    group: "r2.14-pre-fea202db288ec35202",
    stratum: "compatible_history",
    query:
      "How do food sources and implementation context support higher potassium intake?",
    retainedClaim:
      "Potassium intake recommendations can be achieved through widely available foods while respecting national dietary customs.",
    currentClaim:
      "The salt-substitute guideline provides rationale and contextual remarks for implementation.",
  },
  {
    id: "ch-child-potassium-lsss",
    group: "r2.14-pre-82fb786503c1bdfe2f",
    stratum: "compatible_history",
    query:
      "What evidence is available for potassium-related interventions in children?",
    retainedClaim:
      "The potassium guideline evaluates increased versus lower potassium intake in children.",
    currentClaim:
      "Evidence on lower-sodium salt substitutes in children is much more limited than adult evidence.",
  },
  {
    id: "ch-free-sugars-nss-diet",
    group: "r2.14-pre-9dde0152d662a2cb4c",
    stratum: "compatible_history",
    query:
      "How should free-sugar reduction and non-sugar-sweetener use fit within a healthy diet?",
    retainedClaim:
      "Free-sugar recommendations focus on added and exposed sugars rather than intrinsic sugars in intact foods or milk.",
    currentClaim:
      "Evidence is insufficient for recommendations on individual sweeteners, and free-sugar reduction should occur within a healthy diet.",
  },
  {
    id: "ch-sugars-weight-nss-outcomes",
    group: "r2.14-pre-b414993d8d5436d88c",
    stratum: "compatible_history",
    query:
      "What does the evidence indicate about sugar-related weight change and sweetener health outcomes?",
    retainedClaim:
      "Increasing or decreasing free sugars is associated with corresponding changes in body weight.",
    currentClaim:
      "The non-sugar-sweetener review found no significant relationships for several assessed outcomes.",
  },
  {
    id: "ch-free-sugars-nss-context",
    group: "r2.14-pre-ba03ee4375fcc7e15a",
    stratum: "compatible_history",
    query:
      "How should guidance on non-sugar sweeteners relate to reducing free sugars?",
    retainedClaim:
      "WHO recommends reducing free-sugar intake throughout the life course.",
    currentClaim:
      "The non-sugar-sweetener recommendation should be considered alongside WHO free-sugar guidance.",
  },
  {
    id: "ch-fat-trials-quality",
    group: "r2.14-pre-1f46dbba4b3df62aec",
    stratum: "compatible_history",
    query:
      "How do trial limitations and dietary-fat quality affect interpretation of weight outcomes?",
    retainedClaim:
      "Dietary weight trials can be difficult to blind and may be affected by non-physiological influences.",
    currentClaim:
      "The source of unsaturated fat may influence weight gain, so fat quality can matter alongside quantity.",
  },
  {
    id: "ch-diet-transition-fat-function",
    group: "r2.14-pre-16941c66d1ea60ef88",
    stratum: "compatible_history",
    query:
      "Why should dietary transitions account for both processed foods and the physiological roles of fat?",
    retainedClaim:
      "Nutrition transitions can replace traditional nutrient-rich foods with heavily marketed energy-dense products.",
    currentClaim:
      "Dietary fats provide energy and perform structural and physiological functions.",
  },
  {
    id: "ch-sfa-diabetes-cholesterol",
    group: "r2.14-pre-c41e92a31277ed0314",
    stratum: "compatible_history",
    query:
      "How do saturated-fat patterns, diabetes risk, and cholesterol-related cardiovascular risk connect?",
    retainedClaim:
      "Diets high in saturated fat and low in non-starch polysaccharides occur in a context where excess adiposity raises type 2 diabetes risk.",
    currentClaim:
      "Higher total cholesterol is associated with increased coronary heart disease risk.",
  },
  {
    id: "ch-nutrient-dense-food-guidelines",
    group: "r2.14-pre-9f4f090dd49dd34747",
    stratum: "compatible_history",
    query:
      "How can nutrient-dense food choices be translated into practical carbohydrate guidance?",
    retainedClaim:
      "Nutrient-dense choices include fruits, vegetables, legumes, whole grains, lean meats, and low-fat dairy products.",
    currentClaim:
      "WHO recommends translating carbohydrate recommendations into culturally and contextually specific food-based guidelines.",
  },
  {
    id: "co-lsss-industry-partnership",
    group: "r2.14-pre-b2fffc787e3ba00c81",
    stratum: "current_only",
    query:
      "What implementation approach can expand the availability of lower-sodium alternatives?",
    currentClaim:
      "Singapore uses industry partnerships and grants to expand availability and adoption of lower-sodium alternatives.",
  },
  {
    id: "co-nss-dissemination",
    group: "r2.14-pre-0f1ecdae72a61eb3fb",
    stratum: "current_only",
    query:
      "How is the current non-sugar-sweetener guideline intended to be disseminated?",
    currentClaim:
      "The guideline is intended for dissemination through WHO channels including the e-Library of Evidence for Nutrition Actions.",
  },
  {
    id: "co-total-fat-energy-balance",
    group: "r2.14-pre-6b0dd5cf57bbb22308",
    stratum: "current_only",
    query:
      "How does energy balance qualify current total-fat guidance?",
    currentClaim:
      "People who maintain energy balance can prevent excess energy storage even when considering total-fat intake.",
  },
  {
    id: "co-sfa-implementation-utility",
    group: "r2.14-pre-4a81a26f69938ec129",
    stratum: "current_only",
    query:
      "Why may separate recommendations for individual saturated fatty acids be difficult to implement?",
    currentClaim:
      "Recommendations for individual saturated fatty acids may have limited utility for end users and be difficult to implement.",
  },
  {
    id: "co-carbohydrate-equity",
    group: "r2.14-pre-7a3013df94fbf2d8c9",
    stratum: "current_only",
    query:
      "How can carbohydrate-related policy actions affect health inequities?",
    currentClaim:
      "Policy effects vary by action and setting, but well-designed measures may reduce inequities that disproportionately affect lower socioeconomic groups.",
  },
  {
    id: "co-activity-older-adults",
    group: "r2.14-pre-aa301e6ca4968a0bde",
    stratum: "current_only",
    query:
      "What is the core physical-activity message for adults aged 65 years and above?",
    currentClaim:
      "For adults aged 65 years and above, doing some physical activity is better than doing none.",
  },
  {
    id: "hn-total-fat-prevention-scope",
    group: "r2.14-pre-a00aa0c85d83a4e5d0",
    stratum: "hard_negative_current",
    query:
      "Is the current total-fat guideline intended to manage existing obesity?",
    currentClaim:
      "The current total-fat guideline addresses prevention of unhealthy weight gain, not management of existing overweight or obesity.",
    unsafeClaim:
      "The older insulin-resistance and undernutrition passage is forbidden because it does not define the current guideline scope.",
  },
  {
    id: "hn-total-fat-adverse-effects",
    group: "r2.14-pre-370bd01a936e84c201",
    stratum: "hard_negative_current",
    query:
      "What safety consideration accompanies reducing total-fat intake?",
    currentClaim:
      "The current total-fat guideline considers adverse effects that might offset benefits of reduced fat intake.",
    unsafeClaim:
      "The older alcohol-and-obesity passage is forbidden because it concerns confounding in a different exposure.",
  },
  {
    id: "hn-sfa-child-replacement",
    group: "r2.14-pre-1d2777f05d695b6224",
    stratum: "hard_negative_current",
    query:
      "What happens to blood cholesterol in children when saturated fat is replaced with polyunsaturated fat?",
    currentClaim:
      "Child dietary interventions found reductions in total or LDL cholesterol when saturated fatty acids were replaced with polyunsaturated fatty acids.",
    unsafeClaim:
      "The older cancer-risk passage is forbidden because it does not establish the child lipid effect of fatty-acid replacement.",
  },
  {
    id: "hn-sfa-conditional-status",
    group: "r2.14-pre-a72f9273e279049b7b",
    stratum: "hard_negative_current",
    query:
      "Why is the relevant saturated-fat recommendation conditional?",
    currentClaim:
      "The guideline explicitly classifies the relevant saturated-fat recommendation as conditional based on its evidence assessment.",
    unsafeClaim:
      "The older societal-cost passage is forbidden because it does not explain the recommendation's evidence-based conditional status.",
  },
  {
    id: "hn-sedentary-diabetes",
    group: "r2.14-pre-3484c102ba8ed0b101",
    stratum: "hard_negative_current",
    query:
      "What does current evidence indicate about sedentary behaviour and type 2 diabetes incidence?",
    currentClaim:
      "Higher sedentary behaviour was associated with increased incidence of type 2 diabetes.",
    unsafeClaim:
      "The older safety-equipment passage is forbidden because it addresses injury prevention rather than sedentary behaviour and diabetes.",
  },
  {
    id: "hn-child-activity-duration",
    group: "r2.14-pre-86724370c851dbe120",
    stratum: "hard_negative_current",
    query:
      "How much moderate-to-vigorous activity should children and adolescents average each day?",
    currentClaim:
      "Children and adolescents should average at least 60 minutes per day of moderate-to-vigorous physical activity.",
    unsafeClaim:
      "The older gradual-progression passage is forbidden because it does not state the child daily-duration recommendation.",
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
    item_id: `r2.14-${specId}-${role}`,
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
    schema_version: "v5-r2.14-confirmation-annotation-1",
    query_id: `r2.14-confirm-${spec.id}`,
    split: "development_confirmation",
    stratum: spec.stratum,
    lineage_group_id: `r2.14-lineage-${sha256(spec.group).slice(0, 18)}`,
    topic_id: group.source_family,
    query_text: spec.query,
    predeclared_candidate_group_id: spec.group,
    candidate_group_manifest_sha256: groupManifestSha,
    required_current_evidence: [
      evidence(spec.id, right, "current", spec.currentClaim),
    ],
    required_retained_evidence: implicit
      ? [evidence(spec.id, left, "retained", spec.retainedClaim as string)]
      : [],
    deprecated_evidence: [],
    forbidden_evidence:
      spec.stratum === "hard_negative_current"
        ? [evidence(spec.id, left, "forbidden", spec.unsafeClaim as string)]
        : [],
    implicit_retained_rationale: implicit
      ? "The query requires two distinct clauses: the retained passage supplies still-applicable background and the current passage supplies present evidence, scope, or implementation detail."
      : undefined,
    annotation_rationale:
      spec.stratum === "hard_negative_current"
        ? "The current passage directly answers the scoped question; the paired older passage is a plausible but unsafe distractor."
        : "Evidence roles were assigned after role-neutral candidate-group freeze and semantic review, before any R2.14 retrieval execution.",
    review: {
      status: "codex_provisional",
      reviewer_id: "codex_semantic_reviewer",
      reviewer_type: "codex_non_owner",
      independent_blinded_or_clinical_review: false,
      retrieval_outcomes_observed: false,
      r2_10_outcomes_used: false,
      r2_11_outcomes_used: false,
      r2_12_outcomes_used: false,
      r2_13_outcomes_used: false,
    },
  };
});

const exclusionPaths = [
  "data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl",
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
  "data/configs/v5_r2_11_frozen_development/development.frozen.jsonl",
  "data/configs/v5_r2_12_frozen_confirmation/confirmation.approved.frozen.jsonl",
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
        forbiddenRequiredEvidence.add(r214EvidenceKey(item));
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
const errors = validateR214ConfirmationLedger(records, {
  forbiddenLineageIds: forbiddenLineages,
  forbiddenRequiredEvidenceKeys: forbiddenRequiredEvidence,
  candidateGroups,
  candidateGroupManifestSha256: groupManifestSha,
});
if (errors.length > 0) {
  throw new Error(`R2.14 provisional ledger invalid: ${JSON.stringify(errors)}`);
}
const freezeErrors = validateR214ConfirmationLedger(records, {
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
  Object.keys(R214_CONFIRMATION_MINIMUM_COUNTS).map((stratum) => [
    stratum,
    records.filter((record) => record.stratum === stratum).length,
  ]),
);
const recordsText = jsonl(records);
const packetLines = [
  "# R2.14 Confirmation Owner Review Packet",
  "",
  "Scope: 32 new lineage-disjoint Development-confirmation annotations. No R2.14 retrieval has run.",
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
      ? [`- Retained: ${record.required_retained_evidence[0].atomic_claim_text}`]
      : []),
    ...(record.forbidden_evidence.length
      ? [`- Forbidden: ${record.forbidden_evidence[0].atomic_claim_text}`]
      : []),
    `- Candidate group: \`${record.predeclared_candidate_group_id}\``,
    "",
  ]),
  "## Approval boundary",
  "",
  "Approval confirms only these 32 checksum-bound annotations. It authorizes freezing the R2.14 Development confirmation package and its one preregistered execution; it does not authorize Validation, fresh-test execution, or a promotion claim.",
  "",
  "Exact bulk-approval phrase: `核准全部 32 筆`",
  "",
];
const packetText = `${packetLines.join("\n")}\n`;
const manifest = {
  schema_version: "v5-r2.14-confirmation-provisional-manifest-1",
  status: "codex_provisional_owner_review_required",
  provisional_record_count: records.length,
  stratum_counts: counts,
  minimum_counts_satisfied: Object.entries(
    R214_CONFIRMATION_MINIMUM_COUNTS,
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
    .filter((item) => forbiddenRequiredEvidence.has(r214EvidenceKey(item)))
    .length,
  candidate_group_manifest_sha256: groupManifestSha,
  candidate_group_review_manifest_sha256: sha256(reviewManifestText),
  candidate_group_semantic_review_sha256: sha256(reviewsText),
  provisional_annotations_sha256: sha256(recordsText),
  owner_review_packet_path: "R2_14_CONFIRMATION_OWNER_REVIEW_PACKET.md",
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
