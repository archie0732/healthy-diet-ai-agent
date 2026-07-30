import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const NORMALIZED = path.join(EXP, 'data/normalized');
const OUT = path.join(EXP, 'data/annotations_v5/codex_mined_relation_pairs');
const REPORT = path.join(EXP, 'results/v5/codex_mined_relation_pairs');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const files = {
  dga2015: 'Dietary-Guidelines-for-Americans-2015-2020.md',
  dga2020: 'Dietary-Guidelines-for-Americans-2020-2025.md',
  dga2025: 'Dietary-Guidelines-for-Americans-2025-2030.md'
} as const;
const urls = {
  dga2015: 'https://health.gov/our-work/food-nutrition/previous-dietary-guidelines/2015',
  dga2020: 'https://www.dietaryguidelines.gov/sites/default/files/2020-12/Dietary_Guidelines_for_Americans_2020-2025.pdf',
  dga2025: 'https://www.dietaryguidelines.gov/sites/default/files/2026-01/Dietary_Guidelines_for_Americans_2025-2030.pdf'
} as const;
type Doc = keyof typeof files;
type Relation = 'duplicate' | 'superseded' | 'conflicting' | 'conditional_difference' | 'complementary';
type Ref = { doc: Doc; start: number; end: number };
type Spec = { id: string; relation: Relation; old: Ref; current: Ref; topic: string; scope: string[]; rationale: string };
const specs: Spec[] = [
  { id:'v5claim-001', relation:'duplicate', old:{doc:'dga2015',start:1436,end:1436}, current:{doc:'dga2020',start:85,end:85}, topic:'whole grains', scope:['general'], rationale:'Both recommend that at least half of grain intake be whole grain.' },
  { id:'v5claim-002', relation:'duplicate', old:{doc:'dga2015',start:1437,end:1437}, current:{doc:'dga2020',start:87,end:91}, topic:'low-fat dairy', scope:['general'], rationale:'Both identify fat-free or low-fat dairy and fortified soy alternatives as the dairy component.' },
  { id:'v5claim-003', relation:'duplicate', old:{doc:'dga2015',start:1438,end:1439}, current:{doc:'dga2020',start:93,end:95}, topic:'protein variety', scope:['general'], rationale:'Both list the same broad variety of lean animal and plant protein foods.' },
  { id:'v5claim-004', relation:'duplicate', old:{doc:'dga2015',start:1449,end:1450}, current:{doc:'dga2020',start:113,end:117}, topic:'alcohol moderation limits', scope:['adults of legal drinking age'], rationale:'Both state the one-drink women/two-drink men moderation ceiling.' },
  { id:'v5claim-005', relation:'duplicate', old:{doc:'dga2015',start:1446,end:1446}, current:{doc:'dga2020',start:103,end:105}, topic:'added sugar daily limit', scope:['age 2 and older'], rationale:'The core quantitative recommendation remains less than 10 percent of daily calories.' },
  { id:'v5claim-006', relation:'duplicate', old:{doc:'dga2015',start:1447,end:1447}, current:{doc:'dga2020',start:107,end:108}, topic:'saturated fat daily limit', scope:['age 2 and older'], rationale:'The core quantitative recommendation remains less than 10 percent of daily calories.' },

  { id:'v5claim-007', relation:'superseded', old:{doc:'dga2020',start:103,end:106}, current:{doc:'dga2025',start:121,end:138}, topic:'added sugar quantitative limit', scope:['general'], rationale:'The newer guideline changes the operative metric from a daily energy percentage to per-meal and product-specific gram limits.' },
  { id:'v5claim-008', relation:'superseded', old:{doc:'dga2020',start:110,end:111}, current:{doc:'dga2025',start:163,end:171}, topic:'child sodium limits', scope:['children younger than 14'], rationale:'The newer guideline replaces the vague lower-than-adult instruction with explicit age-band limits.' },
  { id:'v5claim-009', relation:'superseded', old:{doc:'dga2020',start:50,end:53}, current:{doc:'dga2025',start:175,end:186}, topic:'breastfeeding duration', scope:['infants','breastfeeding'], rationale:'The newer guideline changes the expressed continuation target from at least one year to two years or beyond.' },
  { id:'v5claim-010', relation:'superseded', old:{doc:'dga2020',start:113,end:119}, current:{doc:'dga2025',start:152,end:162}, topic:'alcohol guidance', scope:['adults'], rationale:'The newer passage removes the earlier numeric moderation ceilings and replaces them with consume-less and expanded avoidance guidance.' },

  { id:'v5claim-011', relation:'conflicting', old:{doc:'dga2020',start:87,end:91}, current:{doc:'dga2025',start:75,end:79}, topic:'dairy fat level', scope:['general'], rationale:'The older passage recommends fat-free or low-fat dairy while the newer passage explicitly recommends full-fat dairy.' },
  { id:'v5claim-012', relation:'conflicting', old:{doc:'dga2015',start:2423,end:2445}, current:{doc:'dga2025',start:121,end:147}, topic:'non-nutritive sweeteners', scope:['general'], rationale:'The older passage describes approved high-intensity sweeteners as safe for the general population, while the newer passage says no amount is recommended and directs consumers to limit them.' },

  { id:'v5claim-013', relation:'conditional_difference', old:{doc:'dga2020',start:110,end:111}, current:{doc:'dga2025',start:163,end:166}, topic:'sodium activity exception', scope:['age 14 and older','highly active individuals'], rationale:'The adult 2,300 mg rule remains, but the newer passage adds an explicit high-activity exception for sweat losses.' },
  { id:'v5claim-014', relation:'conditional_difference', old:{doc:'dga2015',start:1446,end:1446}, current:{doc:'dga2020',start:103,end:106}, topic:'added sugar age scope', scope:['children younger than 2','age 2 and older'], rationale:'The newer passage retains the percentage rule for age two and older but adds complete avoidance for younger children.' },
  { id:'v5claim-015', relation:'conditional_difference', old:{doc:'dga2015',start:1462,end:1464}, current:{doc:'dga2025',start:152,end:162}, topic:'alcohol avoidance populations', scope:['pregnancy','alcohol use disorder','medication interaction'], rationale:'Pregnancy avoidance remains applicable while the newer passage adds distinct clinical and behavioral avoidance groups.' },
  { id:'v5claim-016', relation:'conditional_difference', old:{doc:'dga2020',start:67,end:70}, current:{doc:'dga2025',start:285,end:290}, topic:'chronic disease diet adaptation', scope:['chronic disease'], rationale:'The general pattern remains valid, but the newer passage directs people with chronic disease to consider condition-specific adaptation with a clinician.' },

  { id:'v5claim-017', relation:'complementary', old:{doc:'dga2020',start:93,end:95}, current:{doc:'dga2025',start:61,end:71}, topic:'protein intake', scope:['general'], rationale:'The older passage supplies food-source variety while the newer passage adds a quantitative protein target; both are needed for a complete answer.' },
  { id:'v5claim-018', relation:'complementary', old:{doc:'dga2020',start:80,end:85}, current:{doc:'dga2025',start:88,end:101}, topic:'vegetable and fruit intake', scope:['general'], rationale:'The newer passage adds daily serving goals and preparation guidance to compatible food-group advice.' },
  { id:'v5claim-019', relation:'complementary', old:{doc:'dga2020',start:85,end:85}, current:{doc:'dga2025',start:110,end:118}, topic:'whole grain intake', scope:['general'], rationale:'The older proportion rule and newer two-to-four-serving target are compatible, distinct constraints.' },
  { id:'v5claim-020', relation:'complementary', old:{doc:'dga2020',start:50,end:53}, current:{doc:'dga2025',start:188,end:196}, topic:'infant vitamin D', scope:['breastfed infants','infants consuming less than 32 ounces formula'], rationale:'The newer passage supplies the 400 IU dose and formula-intake scope missing from the older generic supplementation instruction.' },
  { id:'v5claim-021', relation:'complementary', old:{doc:'dga2020',start:103,end:106}, current:{doc:'dga2025',start:140,end:149}, topic:'added sugar identification', scope:['general'], rationale:'A quantitative intake limit and ingredient-label identification guidance are compatible and answer different parts of the same task.' },
  { id:'v5claim-022', relation:'complementary', old:{doc:'dga2020',start:54,end:58}, current:{doc:'dga2025',start:185,end:197}, topic:'allergenic food introduction', scope:['infants'], rationale:'The newer passage adds concrete allergen examples and professional-risk consultation to the compatible introduction recommendation.' }
];

const texts = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(path.join(NORMALIZED, file), 'utf8')])));
const lines = Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, text.split(/\r?\n/)]));
const extract = (ref: Ref) => {
  const selected = lines[ref.doc].slice(ref.start - 1, ref.end);
  if (selected.length !== ref.end - ref.start + 1) throw new Error(`Bad line range ${ref.doc}:${ref.start}-${ref.end}`);
  return selected.join('\n').trim();
};
const reviewedAt = new Date().toISOString();
const records = specs.map((spec, index) => ({
  pair_id: spec.id,
  relation_type: spec.relation,
  policy_label: ['superseded','conflicting'].includes(spec.relation) ? 'deprecated' : 'retain',
  topic: spec.topic,
  scope_tags: spec.scope,
  old_evidence: { document_id: spec.old.doc, edition: files[spec.old.doc], local_path: `data/normalized/${files[spec.old.doc]}`, official_url: urls[spec.old.doc], line_start: spec.old.start, line_end: spec.old.end, text: extract(spec.old), text_sha256: sha256(extract(spec.old)) },
  current_evidence: { document_id: spec.current.doc, edition: files[spec.current.doc], local_path: `data/normalized/${files[spec.current.doc]}`, official_url: urls[spec.current.doc], line_start: spec.current.start, line_end: spec.current.end, text: extract(spec.current), text_sha256: sha256(extract(spec.current)) },
  review_decision: 'accept',
  reviewer_id: 'codex-gpt5-primary-reviewer',
  reviewer_type: 'ai_primary_reviewer_not_independent_human',
  reviewer_rationale: spec.rationale,
  reviewed_at: reviewedAt,
  evidence_alignment_verified: true,
  fresh_v5_test_eligible: false,
  detector_development_eligible: true,
  deterministic_order: index + 1
}));
await Promise.all([mkdir(OUT, { recursive: true }), mkdir(REPORT, { recursive: true })]);
const jsonl = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
await writeFile(path.join(OUT, 'reviewed_pairs.jsonl'), jsonl, 'utf8');
const distribution = Object.fromEntries(['duplicate','superseded','conflicting','conditional_difference','complementary'].map((label) => [label, records.filter((record) => record.relation_type === label).length]));
const manifest = { status:'codex_primary_review_complete_development_only', record_count:records.length, distribution, independent_human_review:false, project_owner_signoff:false, fresh_v5_test_eligible:false, source_checksums:Object.fromEntries(Object.entries(texts).map(([key,text])=>[key,sha256(text)])), reviewed_pairs_sha256:sha256(jsonl), label_balance_was_not_forced:true, prior_v4_fresh_outcomes_used:false };
await writeFile(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest,null,2)+'\n','utf8');
const report = `# Codex-Mined Atomic Relation Pairs\n\nStatus: Development-only Codex primary review. This is not independent human adjudication.\n\n- Records: ${records.length}\n- Distribution: ${Object.entries(distribution).map(([k,v])=>`${k}=${v}`).join(', ')}\n- Sources: official DGA 2015-2020, 2020-2025, and 2025-2030 documents recorded in SOURCE_CATALOG.md\n- Unit: atomic claim span with exact local line range and SHA-256\n- V5 fresh-test eligibility: false\n\nNo class count was padded by knowingly mismatching unrelated claims. In particular, conflicting remains rare because genuine contradictions were required.\n`;
await writeFile(path.join(REPORT,'CODEX_MINED_PAIR_REPORT.md'),report,'utf8');
console.log(JSON.stringify(manifest,null,2));
