import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const PARENT = path.join(EXP, 'data/configs/v5_r2_3_codex_audited_action_detector');
const OUT = path.join(EXP, 'data/configs/v5_r2_4_atomic_action_detector');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const atomic: Record<string, { old: string; current: string }> = {
  'v5claim-001': { old: 'At least half of grains should be whole grains.', current: 'At least half of grains should be whole grain.' },
  'v5claim-002': { old: 'Choose fat-free or low-fat dairy, including milk, yogurt, cheese, and fortified soy beverages.', current: 'Choose dairy including fat-free or low-fat milk, yogurt, cheese, lactose-free versions, and fortified soy beverages or yogurt as alternatives.' },
  'v5claim-003': { old: 'Consume a variety of protein foods from seafood, lean meats and poultry, eggs, legumes, nuts, seeds, and soy.', current: 'Consume protein foods from lean meats, poultry, eggs, seafood, beans, peas, lentils, nuts, seeds, and soy.' },
  'v5claim-004': { old: 'If alcohol is consumed, limit it to one drink per day for women and two drinks per day for men.', current: 'If alcohol is consumed, limit it to one drink or less per day for women and two drinks or less per day for men.' },
  'v5claim-005': { old: 'Consume less than 10 percent of calories per day from added sugars.', current: 'Consume less than 10 percent of calories per day from added sugars starting at age 2.' },
  'v5claim-006': { old: 'Consume less than 10 percent of calories per day from saturated fats.', current: 'Consume less than 10 percent of calories per day from saturated fat starting at age 2.' },
  'v5claim-007': { old: 'Starting at age 2, keep added sugars below 10 percent of calories per day and avoid added sugars below age 2.', current: 'No amount of added sugars is recommended as part of a healthy diet; one meal should contain no more than 10 grams of added sugars and product-specific limits also apply.' },
  'v5claim-008': { old: 'Keep sodium below 2,300 milligrams per day and even lower for children younger than 14.', current: 'Keep sodium below 2,300 milligrams per day from age 14; use age-band limits of 1,200, 1,500, and 1,800 milligrams per day for younger children.' },
  'v5claim-009': { old: 'Continue human milk through at least the first year of life and longer if desired.', current: 'Continue breastfeeding as long as mutually desired for 2 years or beyond.' },
  'v5claim-010': { old: 'Adults may drink in moderation up to two drinks per day for men and one drink per day for women.', current: 'Consume less alcohol for better health, and completely avoid alcohol during pregnancy, recovery from alcohol use disorder, inability to control intake, or interacting medications and conditions.' },
  'v5claim-011': { old: 'Choose fat-free or low-fat milk, yogurt, and cheese.', current: 'When consuming dairy, include full-fat dairy with no added sugars.' },
  'v5claim-012': { old: 'Approved high-intensity sweeteners have been determined to be safe for the general population.', current: 'No amount of non-nutritive sweeteners is recommended as part of a healthy diet; limit foods and beverages containing low-calorie non-nutritive sweeteners.' },
  'v5claim-013': { old: 'Keep sodium below 2,300 milligrams per day, and even lower for children younger than 14.', current: 'The general population age 14 and above should consume less than 2,300 milligrams of sodium per day; highly active individuals may benefit from increased sodium to offset sweat losses.' },
  'v5claim-014': { old: 'Consume less than 10 percent of calories per day from added sugars.', current: 'Starting at age 2, keep added sugars below 10 percent of calories per day; below age 2, avoid foods and beverages with added sugars.' },
  'v5claim-015': { old: 'Do not begin drinking or drink more for any reason; alcohol is only for adults of legal drinking age and should be avoided during pregnancy.', current: 'Consume less alcohol and completely avoid it during pregnancy, recovery from alcohol use disorder, inability to control intake, or use of interacting medications and medical conditions.' },
  'v5claim-016': { old: 'A healthy dietary pattern benefits people regardless of current health status and should be customized to individual and cultural needs.', current: 'People with chronic disease should work with a health care professional to adapt the dietary guidelines to their condition.' },
  'v5claim-017': { old: 'Consume protein foods from lean meats, poultry, eggs, seafood, beans, peas, lentils, nuts, seeds, and soy.', current: 'Consume varied animal and plant protein foods and target 1.2 to 1.6 grams of protein per kilogram of body weight per day.' },
  'v5claim-018': { old: 'Consume vegetables from dark-green, red and orange, legume, starchy, and other subgroups, plus fruits especially whole fruit.', current: 'Consume varied colorful vegetables and fruits, emphasizing whole forms, with goals of three vegetable and two fruit servings per day.' },
  'v5claim-019': { old: 'At least half of grains should be whole grain.', current: 'Prioritize fibre-rich whole grains with a goal of two to four servings per day and reduce refined carbohydrates.' },
  'v5claim-020': { old: 'Provide supplemental vitamin D beginning soon after birth.', current: 'Breastfed infants and infants consuming less than 32 ounces of formula per day should receive 400 IU of vitamin D daily starting shortly after birth.' },
  'v5claim-021': { old: 'Starting at age 2, keep added sugars below 10 percent of calories per day and avoid added sugars below age 2.', current: 'Identify added sugars from ingredient names containing sugar, syrup, or the suffix -ose, while distinguishing naturally occurring sugars.' },
  'v5claim-022': { old: 'At about 6 months, introduce potentially allergenic foods with other complementary foods.', current: 'At about 6 months, introduce allergenic foods such as nut butters, eggs, shellfish, and wheat with other complementary foods and ask a health professional about individual risk.' },
};

const [devText, valText, parentManifestText] = await Promise.all([
  readFile(path.join(PARENT, 'development.jsonl'), 'utf8'), readFile(path.join(PARENT, 'validation.sealed.jsonl'), 'utf8'), readFile(path.join(PARENT, 'SPLIT_MANIFEST.json'), 'utf8'),
]);
const rows = parseJsonl(devText);
const output = rows.map((row: any) => {
  const claims = atomic[row.source_pair_id];
  if (!claims) throw new Error(`Missing atomic claims for ${row.source_pair_id}`);
  return {
    ...row,
    pair_id: `r2.4dev-${row.source_pair_id}`,
    parent_pair_id: row.pair_id,
    old_evidence: { ...row.old_evidence, atomic_claim_text: claims.old, atomic_claim_sha256: sha256(claims.old), atomic_extraction: 'codex_claim_normalization_from_preserved_source_span' },
    current_evidence: { ...row.current_evidence, atomic_claim_text: claims.current, atomic_claim_sha256: sha256(claims.current), atomic_extraction: 'codex_claim_normalization_from_preserved_source_span' },
  };
});
await mkdir(OUT, { recursive: true });
const outputText = output.map((row: any) => JSON.stringify(row)).join('\n') + '\n';
await writeFile(path.join(OUT, 'development.jsonl'), outputText, 'utf8');
await writeFile(path.join(OUT, 'validation.sealed.jsonl'), valText, 'utf8');
const manifest = {
  schema_version: 'v5-r2.4-atomic-action-1', status: 'atomic_development_frozen_validation_unchanged',
  parent_manifest_sha256: sha256(parentManifestText), parent_development_sha256: sha256(devText),
  development_sha256: sha256(outputText), validation_sealed_sha256: sha256(valText), validation_artifact_changed: false,
  development_count: output.length, atomic_claim_count: output.length * 2,
  development_distribution: Object.fromEntries(['PAIR_PRESERVE', 'BLOCK_RETAINED'].map((label) => [label, output.filter((row: any) => row.action_label === label).length])),
  atomic_claim_policy: 'Normalized atomic propositions are used for detector input; original source text, URLs, line/page locators, and hashes remain embedded and unchanged.',
  reviewer_provenance: 'codex-gpt5-primary-reviewer_not_independent_human', external_model_api_used: false,
  validation_execution_count: 0, fresh_v5_test_created: false,
};
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(path.join(OUT, 'SPLIT_MANIFEST.json'), manifestText, 'utf8');
await writeFile(path.join(OUT, 'EXECUTION_GUARD.json'), JSON.stringify({
  status: 'development_unlocked_local_detector_only', split_manifest_sha256: sha256(manifestText), development_selection_complete: false,
  validation_execution_count: 0, external_gemini_or_gemma_calls_allowed: false, tuning_after_validation_allowed: false, fresh_v5_test_created: false,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
