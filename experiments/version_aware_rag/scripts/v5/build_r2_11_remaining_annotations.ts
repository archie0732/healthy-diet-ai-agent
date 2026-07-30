import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  R211DevelopmentAnnotation,
  R211Evidence,
  R211EvidenceRoleSchema,
  R211Stratum,
} from "../../src/annotation/r2_11_schema";
import {
  R211_MINIMUM_STRATUM_COUNTS,
  validateR211DevelopmentLedger,
} from "../../src/annotation/validate_r2_11_development";

const ROOT = process.cwd();
const EXP = path.join(ROOT, "experiments/version_aware_rag");
const OUT = path.join(
  EXP,
  "data/annotations_v5/r2_11_remaining_codex_reviewed",
);
const PACKET = path.join(EXP, "R2_11_REMAINING_51_OWNER_REVIEW_PACKET.md");
const EXISTING_APPROVED = path.join(
  EXP,
  "data/annotations_v5/r2_11_physical_activity_owner_approved/approved_annotations.jsonl",
);

type Chunk = {
  chunk_id: string;
  document_id: string;
  source_url: string;
  source_download_url: string;
  source_checksum: string;
  page_number: number;
  text: string;
};

type DocumentRecord = {
  document_id: string;
  local_path: string;
  official_page_url?: string;
  official_record_url?: string;
  download_url?: string;
  official_pdf_url?: string;
  sha256: string;
};

type EvidenceSpec = {
  chunkId: string;
  claim: string;
};

type DraftSpec = {
  id: string;
  topic: string;
  stratum: R211Stratum;
  query: string;
  current: EvidenceSpec;
  retained?: EvidenceSpec;
  deprecated?: EvidenceSpec;
  forbidden?: EvidenceSpec;
  rationale: string;
};

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const parseJsonl = (value: string) =>
  value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const [v4ChunksText, r211ChunksText, v4ManifestText, r211ManifestText] =
  await Promise.all([
    readFile(path.join(EXP, "data/corpus_v4_devval_draft/chunks.jsonl"), "utf8"),
    readFile(path.join(EXP, "data/corpus_v5_r2_11_draft/chunks.jsonl"), "utf8"),
    readFile(
      path.join(EXP, "data/corpus_v4_devval_draft/source_manifest.json"),
      "utf8",
    ),
    readFile(
      path.join(EXP, "data/corpus_v5_r2_11_draft/source_manifest.json"),
      "utf8",
    ),
  ]);

const chunks = new Map<string, Chunk>(
  [...parseJsonl(v4ChunksText), ...parseJsonl(r211ChunksText)].map((chunk) => [
    chunk.chunk_id,
    chunk,
  ]),
);
const v4Manifest = JSON.parse(v4ManifestText);
const r211Manifest = JSON.parse(r211ManifestText);
const documents = new Map<string, DocumentRecord>(
  [...v4Manifest.documents, ...r211Manifest.documents].map((document) => [
    document.document_id,
    document,
  ]),
);

const m = (
  id: string,
  topic: string,
  stratum: "conditional_merge" | "compatible_history",
  query: string,
  retainedChunkId: string,
  retainedClaim: string,
  currentChunkId: string,
  currentClaim: string,
): DraftSpec => ({
  id,
  topic,
  stratum,
  query,
  retained: { chunkId: retainedChunkId, claim: retainedClaim },
  current: { chunkId: currentChunkId, claim: currentClaim },
  rationale: `The retained evidence supplies ${retainedClaim.toLowerCase()} The current evidence supplies ${currentClaim.toLowerCase()} Both atomic facts are needed to answer the query.`,
});

const c = (
  id: string,
  topic: string,
  query: string,
  currentChunkId: string,
  currentClaim: string,
): DraftSpec => ({
  id,
  topic,
  stratum: "current_only",
  query,
  current: { chunkId: currentChunkId, claim: currentClaim },
  rationale:
    "The current evidence directly and completely answers the scoped question; no retained evidence is required.",
});

const h = (
  id: string,
  topic: string,
  query: string,
  currentChunkId: string,
  currentClaim: string,
  unsafeRole: "deprecated" | "forbidden",
  unsafeChunkId: string,
  unsafeClaim: string,
): DraftSpec => ({
  id,
  topic,
  stratum: "hard_negative_current",
  query,
  current: { chunkId: currentChunkId, claim: currentClaim },
  [unsafeRole]: { chunkId: unsafeChunkId, claim: unsafeClaim },
  rationale: `The current item answers the question. The ${unsafeRole} item is a plausible but unsafe distractor because ${unsafeClaim.toLowerCase()}`,
});

const specs: DraftSpec[] = [
  // conditional_merge: sodium and lower-sodium salt substitutes
  m(
    "r2.11-rem-cm-sodium-target-lsss-scope",
    "sodium-lsss",
    "conditional_merge",
    "For an adult choosing a table-salt strategy, what sodium limit and cardiovascular purpose apply, and where does the lower-sodium substitute recommendation apply?",
    "who-sodium-2012-page-10-pass-1-94b88869a3",
    "Adults should reduce sodium to below 2 g/day to lower blood pressure and cardiovascular, stroke, and coronary-heart-disease risk.",
    "who-lsss-2025-page-14-pass-2-c2b70a8640",
    "The lower-sodium salt substitute recommendation covers discretionary table salt, not manufactured foods, restaurant foods, or sodium-containing condiments.",
  ),
  m(
    "r2.11-rem-cm-sodium-iodine-lsss-iodization",
    "sodium-lsss",
    "conditional_merge",
    "How should a population reduce salt while protecting iodine intake when lower-sodium salt substitutes are introduced?",
    "who-sodium-2012-page-11-pass-1-aa53feeb3d",
    "Salt reduction and salt iodization are compatible, with population monitoring needed to adjust iodization as salt intake changes.",
    "who-lsss-2025-page-15-pass-0-27fafffbe4",
    "Lower-sodium salt substitutes should be iodized in alignment with national salt-iodization policies.",
  ),
  m(
    "r2.11-rem-cm-sodium-environment-lsss-conditional",
    "sodium-lsss",
    "conditional_merge",
    "What population-level change can support lower sodium intake, and why does adopting potassium-containing table-salt substitutes require setting-specific deliberation?",
    "who-sodium-2012-page-14-pass-1-4e911f59a2",
    "Reducing sodium in processed foods can enable a larger population sodium reduction and greater blood-pressure impact.",
    "who-lsss-2025-page-12-pass-2-6ff8ae8e8b",
    "The substitute recommendation is conditional and may require discussion of setting-specific trade-offs before policy adoption.",
  ),

  // conditional_merge: potassium and lower-sodium salt substitutes
  m(
    "r2.11-rem-cm-potassium-food-lsss-distinction",
    "potassium-lsss",
    "conditional_merge",
    "How should adults increase dietary potassium for cardiovascular benefit while correctly interpreting the role of potassium-containing table-salt substitutes?",
    "who-potassium-2012-page-10-pass-1-d7bcb1c747",
    "Adults should increase potassium from food, with at least 3510 mg/day suggested to reduce blood pressure and cardiovascular risk.",
    "who-lsss-2025-page-9-pass-1-775c409275",
    "Potassium-containing lower-sodium salt substitutes are a sodium-reduction strategy and are not included as a way to meet the food-based potassium recommendation.",
  ),
  m(
    "r2.11-rem-cm-potassium-renal-lsss-healthcare",
    "potassium-lsss",
    "conditional_merge",
    "For a population programme, how does potassium safety depend on renal excretion and what safeguards are needed before using lower-sodium salt substitutes?",
    "who-potassium-2012-page-13-pass-2-5541ed2bc8",
    "Food-based potassium is safely excreted by people without renal impairment caused by a condition or drug therapy.",
    "who-lsss-2025-page-14-pass-1-aa5616208e",
    "Lower-sodium salt substitutes exclude people with impaired potassium excretion and should be implemented where adequate health care can identify and supervise risk.",
  ),
  m(
    "r2.11-rem-cm-potassium-sodium-combination-lsss",
    "potassium-lsss",
    "conditional_merge",
    "How should increasing potassium and reducing sodium be combined, and when is replacing regular table salt with a potassium-containing substitute appropriate?",
    "who-potassium-2012-page-14-pass-0-b8093b8610",
    "Combining higher food-based potassium with lower sodium can reduce blood pressure and cardiovascular outcomes.",
    "who-lsss-2025-page-12-pass-0-a257aa450a",
    "Adults may replace regular table salt with a potassium-containing lower-sodium substitute, excluding pregnancy, childhood, kidney impairment, or compromised potassium excretion.",
  ),

  // conditional_merge: free sugars and non-sugar sweeteners
  m(
    "r2.11-rem-cm-sugars-weight-nss",
    "sugars-nss",
    "conditional_merge",
    "How should free sugars be reduced for weight and disease prevention without treating non-sugar sweeteners as the long-term solution?",
    "who-sugars-2015-page-11-pass-0-2b3a30792a",
    "Reducing free sugars is associated with lower body weight, while increasing them is associated with weight gain.",
    "who-nss-2023-page-10-pass-1-9d61be8a51",
    "Non-sugar sweeteners should not be used to achieve weight control or reduce noncommunicable-disease risk.",
  ),
  m(
    "r2.11-rem-cm-sugars-definition-nss-safety",
    "sugars-nss",
    "conditional_merge",
    "Which sweet carbohydrates count as free sugars, and how should evidence within established intake limits be interpreted for non-sugar sweeteners?",
    "who-sugars-2015-page-9-pass-2-c6df443c64",
    "Free sugars include added mono- and disaccharides plus sugars naturally present in honey, syrups, and fruit juices.",
    "who-nss-2023-page-13-pass-2-5b1b8da595",
    "The non-sugar-sweetener recommendation is based on health-effect studies generally conducted within established acceptable daily intakes.",
  ),
  m(
    "r2.11-rem-cm-sugars-dental-nss-population",
    "sugars-nss",
    "conditional_merge",
    "For a general-population programme, what lower free-sugar level may further protect dental health and which people are covered by non-sugar-sweetener guidance?",
    "who-sugars-2015-page-13-pass-0-e0fc2ce75b",
    "Further limiting free sugars below 5% of energy is supported by the cumulative nature of dental caries.",
    "who-nss-2023-page-16-pass-2-7db4dfd440",
    "The non-sugar-sweetener guidance covers the general population of adults and children, including pregnant women, but not diabetes management.",
  ),

  // conditional_merge: fat guidance
  m(
    "r2.11-rem-cm-fat-range-current-limit",
    "dietary-fat",
    "conditional_merge",
    "How should an adult population balance a healthy total-fat range with prevention of unhealthy weight gain?",
    "who-fao-trs-916-2003-part2-page-3-pass-0-3d3473fca2",
    "Population goals placed total fat at 15-30% of energy and allowed up to 35% for highly active groups eating plant-rich diets.",
    "who-total-fat-2023-page-10-pass-1-118f68e0a5",
    "Adults should limit total fat to 30% of energy or less to reduce unhealthy weight gain, while emphasizing unsaturated fat quality.",
  ),
  m(
    "r2.11-rem-cm-fat-replacement-current",
    "dietary-fat",
    "conditional_merge",
    "When reducing saturated and trans fats, which replacement fats support cardiovascular health and what intake ceilings apply?",
    "who-fao-trs-916-2003-part2-page-29-pass-1-1813f36a26",
    "Replacing saturated and trans fats with polyunsaturated vegetable oils lowered coronary-heart-disease risk.",
    "who-sat-trans-fat-2023-page-11-pass-1-adafc8ca5e",
    "Reducing saturated fat below baseline levels reduces cardiovascular risk, with greater reductions producing greater benefit.",
  ),
  m(
    "r2.11-rem-cm-fat-undernutrition-minimum",
    "dietary-fat",
    "conditional_merge",
    "How should total-fat advice be adapted where undernutrition or low energy intake is a concern while still preventing unhealthy weight gain?",
    "who-fao-trs-916-2003-part2-page-35-pass-1-70cabf98b3",
    "Where energy intake is inadequate and body-fat stores are low, both the amount and quality of fat must be considered to meet energy needs.",
    "who-total-fat-2023-page-12-pass-0-4275c33ec1",
    "Most adults need at least 15-20% of energy from fat, and low-intake or undernourished populations may need to maintain or increase fat while preserving fat quality.",
  ),

  // compatible_history: sodium and LSSS
  m(
    "r2.11-rem-ch-sodium-policy-lsss-feasibility",
    "sodium-lsss",
    "compatible_history",
    "What policy tools can lower population sodium intake, and which practical barriers should a lower-sodium salt-substitute programme anticipate?",
    "who-sodium-2012-page-9-pass-1-6c27b89d72",
    "Food labelling, consumer education, and food-based dietary guidelines can support population sodium reduction.",
    "who-lsss-2025-page-11-pass-1-3e49311732",
    "Substitute programmes face availability, price, awareness, taste, perceived-benefit, and kidney-safety barriers.",
  ),
  m(
    "r2.11-rem-ch-sodium-outcomes-lsss-trials",
    "sodium-lsss",
    "compatible_history",
    "What health outcomes support lowering sodium, and what blood-pressure effects have been observed when adults use lower-sodium salt substitutes?",
    "who-sodium-2012-page-15-pass-0-159ae8488f",
    "Population sodium reduction is a cost-effective intervention intended to reduce noncommunicable-disease burden.",
    "who-lsss-2025-page-10-pass-1-4761642b8a",
    "Adult trials of lower-sodium salt substitutes showed reductions in systolic and diastolic blood pressure.",
  ),
  m(
    "r2.11-rem-ch-sodium-clinical-exceptions-lsss-scope",
    "sodium-lsss",
    "compatible_history",
    "Which clinical exceptions constrain population sodium advice, and how narrowly is the table-salt substitute intervention scoped?",
    "who-sodium-2012-page-12-pass-1-14a001784d",
    "General sodium advice excludes conditions or drug therapies causing hyponatraemia, acute water accumulation, or physician-supervised diets.",
    "who-lsss-2025-page-9-pass-0-5ed09ba605",
    "The substitute guideline is one component of a broader sodium-reduction response to cardiovascular and kidney disease risk.",
  ),

  // compatible_history: potassium and LSSS
  m(
    "r2.11-rem-ch-potassium-ratio-lsss-excretion",
    "potassium-lsss",
    "compatible_history",
    "How should sodium and potassium goals be viewed together, and what intake changes occur when regular salt is replaced with a potassium-containing substitute?",
    "who-potassium-2012-page-11-pass-0-bf6ecadfaf",
    "Meeting both sodium and potassium guidance would produce an approximately one-to-one sodium-to-potassium ratio.",
    "who-lsss-2025-page-13-pass-1-7c2ceaf78a",
    "Substitute trials showed lower urinary sodium and higher urinary potassium on average.",
  ),
  m(
    "r2.11-rem-ch-potassium-food-safety-lsss-evidence",
    "potassium-lsss",
    "compatible_history",
    "How should potassium promotion be combined with sodium reduction while accounting for uncertainty surrounding potassium-containing salt substitutes?",
    "who-potassium-2012-page-14-pass-1-688f656c95",
    "Public-health potassium guidance should be combined with reduced sodium consumption.",
    "who-lsss-2025-page-13-pass-2-bcce78b573",
    "Substitute evidence on hyperkalaemia was limited and inconsistently measured, making those safety estimates unreliable.",
  ),
  m(
    "r2.11-rem-ch-potassium-programmes-lsss-conditional",
    "potassium-lsss",
    "compatible_history",
    "How can public-health programmes promote potassium while accounting for uncertainty when introducing lower-sodium salt substitutes?",
    "who-potassium-2012-page-9-pass-1-3b070df9fe",
    "Labelling, education, and food-based dietary guidelines can be used to increase population potassium intake.",
    "who-lsss-2025-page-14-pass-0-c0ad49759d",
    "The substitute recommendation is conditional because evidence certainty is low and undiagnosed potassium-excretion disorders may change the benefit-harm balance.",
  ),

  // compatible_history: sugars and NSS
  m(
    "r2.11-rem-ch-sugars-weight-nss-longterm",
    "sugars-nss",
    "compatible_history",
    "What health risks motivate lowering free sugars, and why are short-term non-sugar-sweetener effects insufficient for long-term guidance?",
    "who-sugars-2015-page-9-pass-1-1e29ca6c35",
    "High free-sugar intake can displace nutritious foods and is associated with unhealthy weight gain, noncommunicable diseases, and dental caries.",
    "who-nss-2023-page-11-pass-0-4a95386dd7",
    "Short trials showed small effects, while evidence found no long-term body-fat benefit and suggested possible long-term disease harms.",
  ),
  m(
    "r2.11-rem-ch-sugars-dental-nss-children",
    "sugars-nss",
    "compatible_history",
    "How do free sugars affect dental caries, and what does the evidence show for non-sugar sweeteners in children?",
    "who-sugars-2015-page-11-pass-1-637d2189aa",
    "Dental caries rises across the range of free-sugar intake, with lower caries observed at lower population exposure.",
    "who-nss-2023-page-12-pass-0-c869108f89",
    "Child evidence for non-sugar sweeteners was limited and did not consistently show body-fat or broader health benefits.",
  ),
  m(
    "r2.11-rem-ch-sugars-policy-nss-alternatives",
    "sugars-nss",
    "compatible_history",
    "Which policy approaches can reduce free sugars, and what foods are preferred instead of replacing them with non-sugar sweeteners?",
    "who-sugars-2015-page-14-pass-1-0e7574b3c7",
    "Policy-makers can use public-health interventions to reduce population free-sugar intake against a benchmark.",
    "who-nss-2023-page-14-pass-0-a361751377",
    "Fruits and minimally processed unsweetened foods and beverages are preferred to simply replacing free sugars with non-sugar sweeteners.",
  ),

  // compatible_history: fat
  m(
    "r2.11-rem-ch-fat-polyunsaturated-current-sfa",
    "dietary-fat",
    "compatible_history",
    "Which fat replacements lower cardiovascular risk when saturated fat intake is reduced?",
    "who-fao-trs-916-2003-part2-page-30-pass-0-b8c2d015ac",
    "Monounsaturated and n-6 polyunsaturated fats lower total and LDL cholesterol when substituted for saturated fats.",
    "who-sat-trans-fat-2023-page-10-pass-0-d52f86edd1",
    "Replacing saturated fat with polyunsaturated fat, plant monounsaturated fat, or fibre-rich carbohydrate foods adds cardiovascular benefit.",
  ),
  m(
    "r2.11-rem-ch-fat-cvd-current-tfa",
    "dietary-fat",
    "compatible_history",
    "Why should trans fat be replaced rather than merely reduced, and which replacement nutrients are preferred?",
    "who-fao-trs-916-2003-part2-page-29-pass-0-88cbe34aea",
    "Trans fats contribute convincingly to cardiovascular risk and adversely affect lipid profiles.",
    "who-sat-trans-fat-2023-page-15-pass-0-a93f106851",
    "Replacing trans fat with polyunsaturated or plant monounsaturated fats is supported by disease-outcome and lipid evidence.",
  ),
  m(
    "r2.11-rem-ch-fat-population-goals-children",
    "dietary-fat",
    "compatible_history",
    "How do population fat-quality goals relate to applying saturated- and trans-fat guidance to children?",
    "who-fao-trs-916-2003-part2-page-3-pass-1-2a0a3a1a99",
    "Population fat goals must preserve adequate energy and essential-fat intake, including higher needs in some groups.",
    "who-sat-trans-fat-2023-page-16-pass-0-f4a5615de2",
    "Child saturated- and trans-fat recommendations rely on extrapolation because direct child studies were not identified.",
  ),

  // compatible_history: physical activity
  m(
    "r2.11-rem-ch-pa-progression-disability",
    "physical-activity",
    "compatible_history",
    "How should an adult living with disability begin and progress activity while minimizing injury risk?",
    "who-physical-activity-2010-page-33-pass-1-fefc752266",
    "Small progressive activity increments with adaptation periods are associated with fewer musculoskeletal injuries than abrupt increases.",
    "who-physical-activity-2020-page-23-pass-1-919bd66c84",
    "Adults living with disability should start with small amounts and gradually increase frequency, intensity, and duration.",
  ),
  m(
    "r2.11-rem-ch-pa-weekly-benefits",
    "physical-activity",
    "compatible_history",
    "Why should activity be distributed through daily life, and which major health outcomes can regular activity improve?",
    "who-physical-activity-2010-page-32-pass-2-6d156b0c46",
    "Regular activity across the week can support integration into daily life through active travel.",
    "who-physical-activity-2020-page-25-pass-0-aa794aae64",
    "Regular activity protects against cardiovascular disease, diabetes, some cancers, dementia, poor mental health, and unhealthy weight.",
  ),
  m(
    "r2.11-rem-ch-pa-volume-sedentary-disability",
    "physical-activity",
    "compatible_history",
    "How should additional activity volume be balanced with replacing sedentary time for adults living with disability?",
    "who-physical-activity-2010-page-33-pass-0-91206a0e21",
    "Activity above 150 minutes can add benefit, though marginal benefit decreases beyond roughly 300 moderate-intensity minutes.",
    "who-physical-activity-2020-page-23-pass-0-d11fa5c71c",
    "Adults living with disability should limit sedentary time and replace it with activity of any intensity.",
  ),

  // current_only
  c(
    "r2.11-rem-co-pa-disability-start",
    "physical-activity",
    "How should children and adolescents living with disability begin if they are not meeting activity recommendations?",
    "who-physical-activity-2020-page-21-pass-0-d0d9c6acbd",
    "Children and adolescents living with disability should start with small amounts and gradually increase activity over time.",
  ),
  c(
    "r2.11-rem-co-pa-inequity",
    "physical-activity",
    "What population inequities should be considered when expanding opportunities to be physically active?",
    "who-physical-activity-2020-page-25-pass-1-f39011cd61",
    "Activity levels differ by sex, country, and region partly because access to opportunities is unequal.",
  ),
  c(
    "r2.11-rem-co-pa-updated-scope",
    "physical-activity",
    "Which population groups are explicitly included in the broad scope of the activity and sedentary-behaviour guidance?",
    "who-physical-activity-2020-page-26-pass-2-bfb0781e8d",
    "The scope includes children, adults, older adults, pregnant people, and people living with chronic conditions or disability.",
  ),
  c(
    "r2.11-rem-co-cf-milks",
    "complementary-feeding",
    "For an infant aged 6-11 months who receives milk other than breast milk, which milk options may be used and which sweetened milks are inappropriate?",
    "who-complementary-feeding-2023-page-12-pass-1-85a2669535",
    "Formula or animal milk may be fed at 6-11 months, while sweetened milks are inappropriate because they contain added sugars.",
  ),
  c(
    "r2.11-rem-co-cf-introduction",
    "complementary-feeding",
    "When should complementary foods be introduced while breastfeeding continues?",
    "who-complementary-feeding-2023-page-13-pass-0-dd3a83d6ba",
    "Complementary foods should be introduced at 6 months while breastfeeding continues.",
  ),
  c(
    "r2.11-rem-co-cf-unhealthy-foods",
    "complementary-feeding",
    "Which foods, beverages, and sweeteners should be avoided during complementary feeding?",
    "who-complementary-feeding-2023-page-14-pass-0-917e12e50b",
    "Foods high in sugar, salt, or trans fat, sugar-sweetened beverages, and non-sugar sweeteners should not be consumed.",
  ),
  c(
    "r2.11-rem-co-carb-food-sources",
    "carbohydrate-quality",
    "Why was 400 g per day selected as the adult vegetable-and-fruit minimum?",
    "who-carbohydrate-2023-page-11-pass-2-39d13c25a0",
    "Risk reduction was steepest up to 400 g/day, after which effects levelled for some outcomes, making 400 g a feasible minimum with significant benefit.",
  ),
  c(
    "r2.11-rem-co-carb-child-fibre",
    "carbohydrate-quality",
    "Why is at least 25 g per day a practical adult dietary-fibre minimum?",
    "who-carbohydrate-2023-page-12-pass-1-a01c1d0ea7",
    "The 25-29 g/day range demonstrated benefit across the largest number of health outcomes, while evidence became sparse above 40 g/day.",
  ),
  c(
    "r2.11-rem-co-carb-food-safety",
    "carbohydrate-quality",
    "How can vegetables and fruits be selected or prepared where foodborne-illness risk is high?",
    "who-carbohydrate-2023-page-13-pass-1-c0f9a43adc",
    "Hard skins or removable peels, washing with potable water, and cooked or canned varieties can reduce foodborne-illness risk.",
  ),
  c(
    "r2.11-rem-co-fat-body-fatness",
    "dietary-fat",
    "What does the evidence show about lower total-fat intake and adult body-fatness outcomes?",
    "who-total-fat-2023-page-9-pass-2-6cb8542764",
    "Adults consuming less than 30% of energy from fat had lower body-fatness measures than those consuming 30% or more.",
  ),
  c(
    "r2.11-rem-co-fat-adult-scope",
    "dietary-fat",
    "Who is covered by the total-fat limit for unhealthy-weight-gain prevention, and why is there no equivalent child limit?",
    "who-total-fat-2023-page-11-pass-0-7c523d83bc",
    "The total-fat limit applies from age 20; evidence was insufficient and could not be extrapolated to formulate a child limit.",
  ),
  c(
    "r2.11-rem-co-fat-quality-scope",
    "dietary-fat",
    "From what age does fat-quality guidance apply, and why must fat quantity and quality be considered together?",
    "who-total-fat-2023-page-12-pass-1-4b96d414ee",
    "Fat-quality guidance applies from age 2 and recognizes that both the amount and type of fat affect health and nutritional well-being.",
  ),

  // hard_negative_current: physical activity
  h(
    "r2.11-rem-hn-pa-adult-bouts",
    "physical-activity",
    "What weekly aerobic and strengthening pattern currently applies to adults, without imposing an obsolete minimum bout duration?",
    "who-physical-activity-2020-page-12-pass-0-bfd51843f1",
    "Adults should complete 150-300 moderate or 75-150 vigorous aerobic minutes weekly and strengthen major muscle groups on at least two days.",
    "deprecated",
    "who-physical-activity-2010-page-26-pass-0-b7a8534739",
    "It contains the superseded requirement that aerobic activity occur in bouts of at least 10 minutes.",
  ),
  h(
    "r2.11-rem-hn-pa-older-target",
    "physical-activity",
    "What aerobic and muscle-strengthening pattern applies to older adults under the current guidance?",
    "who-physical-activity-2020-page-14-pass-1-8a6a80ebfe",
    "Older adults should meet the current aerobic range and perform major-muscle strengthening on at least two days weekly.",
    "deprecated",
    "who-physical-activity-2010-page-20-pass-1-3973a2c709",
    "It is a child activity recommendation and would misapply the population.",
  ),
  h(
    "r2.11-rem-hn-pa-pregnancy",
    "physical-activity",
    "Which maternal and fetal outcomes are associated with physical activity during pregnancy and postpartum?",
    "who-physical-activity-2020-page-16-pass-0-2767acb096",
    "Activity during pregnancy and postpartum lowers several maternal risks and does not increase adverse birth outcomes.",
    "forbidden",
    "who-physical-activity-2010-page-31-pass-2-7fa94992ca",
    "It addresses balance and strength for adults aged 65 and above, not pregnancy or postpartum outcomes.",
  ),

  // hard_negative_current: complementary feeding
  h(
    "r2.11-rem-hn-cf-diversity",
    "complementary-feeding",
    "Which food groups should anchor a nutrient-dense complementary-feeding diet?",
    "who-complementary-feeding-2023-page-13-pass-1-c2a200a77a",
    "Animal-source foods, fruits, vegetables, nuts, pulses, and seeds should be key components, while starchy staples should be minimized.",
    "forbidden",
    "who-complementary-feeding-2023-page-22-pass-1-9f73308973",
    "It states evidence-review questions rather than a recommendation.",
  ),
  h(
    "r2.11-rem-hn-cf-supplements",
    "complementary-feeding",
    "When may fortified products or small-quantity lipid-based nutrient supplements be useful during complementary feeding?",
    "who-complementary-feeding-2023-page-14-pass-1-40335d8ef3",
    "Fortification can improve micronutrient intake where cereals dominate, and small-quantity lipid-based supplements may help in food-insecure populations with deficiencies.",
    "forbidden",
    "who-complementary-feeding-2023-page-24-pass-2-c87eb55afc",
    "It describes modelling limitations and does not establish an intervention recommendation.",
  ),
  h(
    "r2.11-rem-hn-cf-responsive",
    "complementary-feeding",
    "What does responsive feeding require for children aged 6-23 months?",
    "who-complementary-feeding-2023-page-15-pass-0-8ce3e60c93",
    "Children should be encouraged to eat autonomously in response to physiological and developmental needs.",
    "forbidden",
    "who-complementary-feeding-2023-page-17-pass-0-bb7408be3e",
    "It defines the complementary-feeding period but does not prescribe responsive feeding behaviour.",
  ),

  // hard_negative_current: non-sugar sweeteners
  h(
    "r2.11-rem-hn-nss-nutritional-value",
    "non-sugar-sweeteners",
    "Why should non-sugar sweeteners not be treated as essential components of a healthy diet?",
    "who-nss-2023-page-12-pass-2-6e7bf86531",
    "Non-sugar sweeteners are not essential dietary factors, have no nutritional value, and are not the only way to reduce free sugars.",
    "forbidden",
    "who-nss-2023-page-15-pass-1-7cf1d0f784",
    "It reports how sweeteners are marketed for weight control rather than endorsing that claim.",
  ),
  h(
    "r2.11-rem-hn-nss-diabetes-scope",
    "non-sugar-sweeteners",
    "Does the non-sugar-sweetener recommendation provide disease-management guidance for people with existing diabetes?",
    "who-nss-2023-page-9-pass-1-def2b58159",
    "Diabetes management is outside the guideline scope, so the recommendation may not apply to people with existing diabetes.",
    "forbidden",
    "who-nss-2023-page-13-pass-3-2ee1820105",
    "Acceptable-daily-intake discussion addresses toxicological safety, not diabetes management.",
  ),
  h(
    "r2.11-rem-hn-nss-longterm",
    "non-sugar-sweeteners",
    "What uncertainty prevents non-sugar sweeteners from being assumed effective for long-term weight control?",
    "who-nss-2023-page-16-pass-0-a0871ba3c6",
    "Long-term weight-control effectiveness and long-term health effects remain uncertain at habitual intakes.",
    "forbidden",
    "who-nss-2023-page-9-pass-0-28f66d38cb",
    "It describes marketing claims and the motivation for review, not proof of long-term effectiveness.",
  ),

  // hard_negative_current: lower-sodium salt substitutes
  h(
    "r2.11-rem-hn-lsss-one-strategy",
    "lower-sodium-salt-substitutes",
    "How should lower-sodium table salt fit within a broader sodium-reduction strategy?",
    "who-lsss-2025-page-12-pass-1-36d0a8c32e",
    "Lower-sodium salt substitutes are only one part of an overall sodium-reduction strategy.",
    "forbidden",
    "who-lsss-2025-page-9-pass-1-775c409275",
    "The food-based potassium recommendation does not authorize using substitutes simply to raise potassium intake.",
  ),
  h(
    "r2.11-rem-hn-lsss-outcome-gaps",
    "lower-sodium-salt-substitutes",
    "Which health outcomes remain insufficiently reported in lower-sodium salt-substitute trials?",
    "who-lsss-2025-page-10-pass-2-910a4f47a6",
    "Evidence was insufficient for several outcomes including blood-pressure control, some heart events, stroke death, and abnormal blood-potassium outcomes.",
    "forbidden",
    "who-lsss-2025-page-10-pass-1-4761642b8a",
    "Observed mean blood-pressure reductions cannot be substituted for unreported clinical outcomes.",
  ),
  h(
    "r2.11-rem-hn-lsss-child-pregnancy",
    "lower-sodium-salt-substitutes",
    "What can be concluded about lower-sodium salt substitutes for children and pregnant women?",
    "who-lsss-2025-page-11-pass-0-6c354b0afc",
    "Child evidence was very uncertain and pregnancy studies were absent, so effectiveness and safety conclusions cannot be drawn.",
    "forbidden",
    "who-lsss-2025-page-10-pass-3-6d2f542743",
    "A fragment about child blood-pressure evidence is insufficient to support use in children or pregnancy.",
  ),
];

const evidence = (
  queryId: string,
  role: "current" | "retained" | "deprecated" | "forbidden",
  spec: EvidenceSpec,
): R211Evidence => {
  const chunk = chunks.get(spec.chunkId);
  if (!chunk) throw new Error(`Missing chunk ${spec.chunkId}`);
  const document = documents.get(chunk.document_id);
  if (!document) throw new Error(`Missing document ${chunk.document_id}`);
  if (document.sha256 !== chunk.source_checksum) {
    throw new Error(`Source checksum mismatch for ${chunk.chunk_id}`);
  }
  return {
    item_id: `${queryId}::${role.toUpperCase()}`,
    role: R211EvidenceRoleSchema.parse(role),
    document_id: chunk.document_id,
    atomic_claim_text: spec.claim,
    official_record_url:
      document.official_record_url ??
      document.official_page_url ??
      chunk.source_url,
    official_pdf_url:
      document.official_pdf_url ??
      document.download_url ??
      chunk.source_download_url,
    local_path: document.local_path,
    source_sha256: document.sha256,
    locator: {
      page_number: chunk.page_number,
      chunk_id: chunk.chunk_id,
    },
  };
};

const records: R211DevelopmentAnnotation[] = specs.map((spec) => {
  const retained = spec.retained
    ? [evidence(spec.id, "retained", spec.retained)]
    : [];
  const deprecated = spec.deprecated
    ? [evidence(spec.id, "deprecated", spec.deprecated)]
    : [];
  const forbidden = spec.forbidden
    ? [evidence(spec.id, "forbidden", spec.forbidden)]
    : [];
  return {
    schema_version: "v5-r2.11-development-annotation-1",
    query_id: spec.id,
    split: "development",
    stratum: spec.stratum,
    lineage_group_id: spec.id,
    topic_id: spec.topic,
    query_text: spec.query,
    required_current_evidence: [
      evidence(spec.id, "current", spec.current),
    ],
    required_retained_evidence: retained,
    deprecated_evidence: deprecated,
    forbidden_evidence: forbidden,
    implicit_retained_rationale:
      retained.length > 0
        ? "The retained and current passages supply distinct atomic facts explicitly requested by the query; neither passage alone answers both parts."
        : undefined,
    annotation_rationale: spec.rationale,
    review: {
      status: "codex_provisional",
      reviewer_id: "codex-gpt5-primary-reviewer",
      reviewer_type: "ai_primary_reviewer_not_independent_human",
      independent_blinded_or_clinical_review: false,
      retrieval_outcomes_observed: false,
      r2_10_outcomes_used: false,
    },
  };
});

const localErrors = validateR211DevelopmentLedger(records);
if (localErrors.length > 0) {
  throw new Error(`Remaining-ledger validation failed: ${JSON.stringify(localErrors)}`);
}

const existingApproved = parseJsonl(await readFile(EXISTING_APPROVED, "utf8"));
const combined = [...existingApproved, ...records];
const exclusionRelativePaths = [
  "data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl",
  "data/annotations_v4/fresh_test_user_approved/fresh_test.sealed.jsonl",
  "data/annotations_v5/r2_10_fresh_test_draft/fresh_test_draft.jsonl",
];
const exclusionTexts = await Promise.all(
  exclusionRelativePaths.map((relativePath) =>
    readFile(path.join(EXP, relativePath), "utf8"),
  ),
);
const forbiddenLineageIds = new Set<string>();
const excludedChunkIds = new Set<string>();
for (const text of exclusionTexts) {
  for (const record of parseJsonl(text)) {
    for (const key of ["lineage_group_id", "lineage_group", "lineage_id"]) {
      if (typeof record[key] === "string") forbiddenLineageIds.add(record[key]);
    }
  }
  for (const match of text.matchAll(
    /who-[a-z0-9-]+-page-\d+-pass-\d+-[a-f0-9]+/g,
  )) {
    excludedChunkIds.add(match[0]);
  }
}
const freezeErrors = validateR211DevelopmentLedger(combined, {
  forbiddenLineageIds,
  requireFreezeReady: true,
});
const unexpectedFreezeErrors = freezeErrors.filter(
  (error) => error.type !== "ReviewStatus",
);
if (unexpectedFreezeErrors.length > 0) {
  throw new Error(
    `Combined minimum ledger failed: ${JSON.stringify(unexpectedFreezeErrors)}`,
  );
}

const counts = Object.fromEntries(
  Object.keys(R211_MINIMUM_STRATUM_COUNTS).map((stratum) => [
    stratum,
    combined.filter((record) => record.stratum === stratum).length,
  ]),
);
const topicCounts = Object.fromEntries(
  [...new Set(records.map((record) => record.topic_id))]
    .sort()
    .map((topic) => [
      topic,
      records.filter((record) => record.topic_id === topic).length,
    ]),
);
const requiredChunkIds = records.flatMap((record) => [
  ...record.required_current_evidence,
  ...record.required_retained_evidence,
]).map((item) => item.locator.chunk_id);
if (new Set(requiredChunkIds).size !== requiredChunkIds.length) {
  throw new Error("Required evidence chunks are not lineage-disjoint.");
}
const excludedRequiredChunks = requiredChunkIds.filter((chunkId) =>
  excludedChunkIds.has(String(chunkId)),
);
if (excludedRequiredChunks.length > 0) {
  throw new Error(
    `Required evidence overlaps held-out evaluation chunks: ${excludedRequiredChunks.join(", ")}`,
  );
}

const ledgerText = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
const semanticReview = records.map((record) => ({
  query_id: record.query_id,
  decision: "codex_provisional_accept",
  schema_valid: true,
  atomic_evidence_reviewed: true,
  required_evidence_lineage_disjoint: true,
  retrieval_outcomes_observed: false,
  r2_10_outcomes_used: false,
  owner_approval_required: true,
}));
const semanticText = `${semanticReview.map((row) => JSON.stringify(row)).join("\n")}\n`;
const manifest = {
  schema_version: "v5-r2.11-remaining-codex-reviewed-manifest-1",
  status: "codex_provisional_owner_review_required",
  provisional_annotations_path:
    "data/annotations_v5/r2_11_remaining_codex_reviewed/provisional_annotations.jsonl",
  provisional_annotations_sha256: sha256(ledgerText),
  semantic_review_sha256: sha256(semanticText),
  provisional_record_count: records.length,
  combined_record_count: combined.length,
  combined_stratum_counts: counts,
  minimum_stratum_counts: R211_MINIMUM_STRATUM_COUNTS,
  minimum_counts_satisfied: Object.entries(R211_MINIMUM_STRATUM_COUNTS).every(
    ([stratum, minimum]) =>
      Number(counts[stratum]) >= minimum,
  ),
  topic_counts: topicCounts,
  validation_error_count: localErrors.length,
  combined_freeze_blockers: freezeErrors,
  exclusion_input_sha256: Object.fromEntries(
    exclusionRelativePaths.map((relativePath, index) => [
      relativePath,
      sha256(exclusionTexts[index]),
    ]),
  ),
  excluded_required_chunk_overlap_count: excludedRequiredChunks.length,
  project_owner_approval_required_count: records.length,
  owner_review_packet_path: "R2_11_REMAINING_51_OWNER_REVIEW_PACKET.md",
  owner_review_packet_sha256: "",
  full_ledger_frozen: false,
  retrieval_allowed: false,
};

const packetSections = records
  .map((record, index) => {
    const current = record.required_current_evidence[0];
    const retained = record.required_retained_evidence[0];
    const unsafe =
      record.deprecated_evidence[0] ?? record.forbidden_evidence[0];
    return [
      `### ${index + 1}. ${record.query_id}`,
      "",
      `- Stratum: \`${record.stratum}\``,
      `- Topic: \`${record.topic_id}\``,
      `- Query: ${record.query_text}`,
      `- Current evidence (${current.document_id}, PDF page ${current.locator.page_number}): ${current.atomic_claim_text}`,
      retained
        ? `- Retained evidence (${retained.document_id}, PDF page ${retained.locator.page_number}): ${retained.atomic_claim_text}`
        : null,
      unsafe
        ? `- ${unsafe.role} distractor (${unsafe.document_id}, PDF page ${unsafe.locator.page_number}): ${unsafe.atomic_claim_text}`
        : null,
      `- Review rationale: ${record.annotation_rationale}`,
      "",
    ]
      .filter((line) => line !== null)
      .join("\n");
  })
  .join("\n");

const packetText = `# R2.11 Remaining 51 Owner Review Packet

Date: 2026-07-24

Scope: 51 Codex-reviewed provisional Development annotations. Together with
the five already approved physical-activity annotations, these meet the
preregistered 56-record minimum. No retrieval outcomes were generated or
observed.

## Integrity

- Provisional record count: 51
- Combined record count: 56
- Combined strata: conditional_merge=16, compatible_history=16,
  current_only=12, hard_negative_current=12
- Local annotation validator errors: 0
- Only remaining combined freeze blocker: owner approval for these 51 records
- Retrieval allowed: no
- R2.10 outcomes used: no
- Provisional ledger SHA-256: \`${sha256(ledgerText)}\`
- Semantic review SHA-256: \`${sha256(semanticText)}\`

Approval of this packet approves these 51 Development records only. The
approved records must then be combined with the five checksum-bound approved
records, validated against all exclusion ledgers, and frozen before retrieval.

## Records

${packetSections}
## Requested owner decision

Please approve all 51 records, list record numbers or query IDs requiring
revision, or reject this packet.
`;
manifest.owner_review_packet_sha256 = sha256(packetText);
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "provisional_annotations.jsonl"), ledgerText, "utf8"),
  writeFile(path.join(OUT, "semantic_review.jsonl"), semanticText, "utf8"),
  writeFile(path.join(OUT, "MANIFEST.json"), manifestText, "utf8"),
  writeFile(PACKET, packetText, "utf8"),
]);

console.log(
  JSON.stringify(
    {
      provisional_record_count: records.length,
      combined_record_count: combined.length,
      combined_stratum_counts: counts,
      provisional_annotations_sha256: manifest.provisional_annotations_sha256,
      owner_packet_sha256: sha256(packetText),
      combined_freeze_blockers: freezeErrors,
    },
    null,
    2,
  ),
);
