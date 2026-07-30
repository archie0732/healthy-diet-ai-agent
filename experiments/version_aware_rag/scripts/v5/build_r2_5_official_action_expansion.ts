import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const PARENT = path.join(EXP, 'data/configs/v5_r2_4_atomic_action_detector');
const OUT = path.join(EXP, 'data/configs/v5_r2_5_expanded_local_action_detector');
const REVIEW = path.join(EXP, 'data/annotations_v5/r2_5_official_action_expansion');
const CHUNKS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [parentText, valText, parentManifestText, chunksText] = await Promise.all([
  readFile(path.join(PARENT, 'development.jsonl'), 'utf8'), readFile(path.join(PARENT, 'validation.sealed.jsonl'), 'utf8'),
  readFile(path.join(PARENT, 'SPLIT_MANIFEST.json'), 'utf8'), readFile(CHUNKS, 'utf8'),
]);
const chunkMap = new Map(parseJsonl(chunksText).map((row: any) => [row.chunk_id, row]));
function evidence(chunkId: string, claim: string) {
  const chunk: any = chunkMap.get(chunkId); if (!chunk) throw new Error(`Missing ${chunkId}`);
  return { document_id: chunk.document_id, edition: chunk.edition, published_at: chunk.published_at, official_url: chunk.source_url,
    official_pdf_url: chunk.source_download_url, source_sha256: chunk.source_checksum, page_number: chunk.page_number, chunk_id: chunkId,
    source_text: chunk.text, source_text_sha256: sha256(chunk.text), atomic_claim_text: claim, atomic_claim_sha256: sha256(claim),
    atomic_extraction: 'codex_claim_normalization_from_preserved_official_pdf_chunk' };
}
const specs: any[] = [
  ['sodium-duplicate','BLOCK_RETAINED','who-sodium-2012-page-10-pass-1-94b88869a3','who-sodium-2012-page-26-pass-2-b9dbdf82b0','Adults should reduce sodium below 2 grams per day (5 grams salt).','Adults should reduce sodium below 2 grams per day (5 grams salt).','Repeated recommendation in executive summary and main recommendations.'],
  ['potassium-duplicate','BLOCK_RETAINED','who-potassium-2012-page-10-pass-1-d7bcb1c747','who-potassium-2012-page-24-pass-2-13b8318d9d','Adults should increase potassium from food to at least 3510 milligrams per day.','Adults should increase potassium from food to at least 3510 milligrams per day.','Repeated recommendation.'],
  ['sugars-duplicate','BLOCK_RETAINED','who-sugars-2015-page-12-pass-0-737526a649','who-sugars-2015-page-24-pass-0-6cc2ad62cb','Adults and children should keep free sugars below 10 percent of total energy.','Adults and children should keep free sugars below 10 percent of total energy.','Repeated recommendation.'],
  ['nss-duplicate','BLOCK_RETAINED','who-nss-2023-page-10-pass-1-9d61be8a51','who-nss-2023-page-34-pass-0-fcf5b1e8c1','Do not use non-sugar sweeteners for weight control or reducing noncommunicable disease risk.','Do not use non-sugar sweeteners for weight control or reducing noncommunicable disease risk.','Repeated recommendation.'],
  ['carbohydrate-duplicate','BLOCK_RETAINED','who-carbohydrate-2023-page-10-pass-0-d0ff69fccf','who-carbohydrate-2023-page-36-pass-0-22748be8fb','Carbohydrates should come primarily from whole grains, vegetables, fruits, and pulses.','Carbohydrates should come primarily from whole grains, vegetables, fruits, and pulses.','Repeated recommendation.'],
  ['total-fat-duplicate','BLOCK_RETAINED','who-total-fat-2023-page-10-pass-0-55a27fcbc1','who-total-fat-2023-page-30-pass-0-fa6fc58d51','Adults should limit total fat to 30 percent of total energy or less.','Adults should limit total fat to 30 percent of total energy or less.','Repeated recommendation.'],
  ['sfa-duplicate','BLOCK_RETAINED','who-sat-trans-fat-2023-page-11-pass-0-241c79aa0a','who-sat-trans-fat-2023-page-46-pass-0-36ec9de23d','Adults and children should reduce saturated fatty acids to 10 percent of total energy.','Adults and children should reduce saturated fatty acids to 10 percent of total energy.','Repeated recommendation.'],
  ['tfa-duplicate','BLOCK_RETAINED','who-sat-trans-fat-2023-page-14-pass-0-475eaafaf8','who-sat-trans-fat-2023-page-50-pass-0-60267ddc5b','Adults and children should reduce trans-fatty acids to 1 percent of total energy.','Adults and children should reduce trans-fatty acids to 1 percent of total energy.','Repeated recommendation.'],
  ['lsss-duplicate','BLOCK_RETAINED','who-lsss-2025-page-12-pass-0-a257aa450a','who-lsss-2025-page-40-pass-0-16cb9713ae','Adults may replace regular table salt with lower-sodium salt substitutes containing potassium.','Adults may replace regular table salt with lower-sodium salt substitutes containing potassium.','Repeated recommendation.'],
  ['sodium-safety','PAIR_PRESERVE','who-sodium-2012-page-10-pass-1-94b88869a3','who-sodium-2012-page-11-pass-0-2f53a84f4c','Adults should reduce sodium below 2 grams per day.','The sodium recommendation excludes illnesses or therapies that risk hyponatraemia, acute water build-up, or require physician-supervised diets.','Target and safety exclusions are distinct.'],
  ['potassium-safety','PAIR_PRESERVE','who-potassium-2012-page-10-pass-1-d7bcb1c747','who-potassium-2012-page-24-pass-0-f9a5c41a38','Adults should increase potassium from food to at least 3510 milligrams per day.','The potassium recommendation has population and clinical applicability remarks that constrain safe use.','Target and applicability constraints are distinct.'],
  ['sugars-definition','PAIR_PRESERVE','who-sugars-2015-page-12-pass-0-737526a649','who-sugars-2015-page-9-pass-2-c6df443c64','Keep free sugars below 10 percent of total energy.','Free sugars include sugars added by manufacturers, cooks, or consumers and sugars naturally present in honey, syrups, fruit juices, and concentrates.','Threshold and definition are distinct.'],
  ['sugars-therapeutic','PAIR_PRESERVE','who-sugars-2015-page-12-pass-0-737526a649','who-sugars-2015-page-13-pass-0-e0fc2ce75b','Keep free sugars below 10 percent of total energy.','The recommendation does not apply to people who need therapeutic diets, including management of severe or moderate acute malnutrition.','General rule and clinical exception are distinct.'],
  ['carb-fruit-age','PAIR_PRESERVE','who-carbohydrate-2023-page-10-pass-0-d0ff69fccf','who-carbohydrate-2023-page-36-pass-0-22748be8fb','Adults should consume at least 400 grams of vegetables and fruits per day.','Children should consume age-specific vegetable and fruit amounts: 250 grams at ages 2 to 5, 350 grams at ages 6 to 9, and 400 grams from age 10.','Adult and child scopes require distinct targets.'],
  ['carb-fibre-age','PAIR_PRESERVE','who-carbohydrate-2023-page-10-pass-0-d0ff69fccf','who-carbohydrate-2023-page-36-pass-1-2cb9742195','Adults should consume at least 25 grams of naturally occurring dietary fibre from foods per day.','Children should consume age-specific naturally occurring dietary fibre amounts.','Adult and child scopes require distinct targets.'],
  ['total-fat-undernutrition','PAIR_PRESERVE','who-total-fat-2023-page-10-pass-0-55a27fcbc1','who-total-fat-2023-page-12-pass-0-4275c33ec1','Adults should limit total fat to 30 percent of total energy or less to prevent unhealthy weight gain.','Where undernutrition is prevalent and fat intake is already low, maintaining or increasing fat may be important for adequate energy and essential fatty acids.','General ceiling and undernutrition exception are distinct.'],
  ['sfa-replacement','PAIR_PRESERVE','who-sat-trans-fat-2023-page-11-pass-0-241c79aa0a','who-sat-trans-fat-2023-page-46-pass-0-36ec9de23d','Reduce saturated fatty acids to 10 percent of total energy.','Replace saturated fatty acids with polyunsaturated fats, plant monounsaturated fats, or fibre-containing carbohydrates.','Ceiling and replacement method are distinct.'],
  ['tfa-replacement','PAIR_PRESERVE','who-sat-trans-fat-2023-page-14-pass-0-475eaafaf8','who-sat-trans-fat-2023-page-50-pass-0-60267ddc5b','Reduce trans-fatty acids to 1 percent of total energy.','Replace trans-fatty acids with polyunsaturated or primarily plant-source monounsaturated fats.','Ceiling and replacement method are distinct.'],
  ['lsss-food-potassium','PAIR_PRESERVE','who-lsss-2025-page-12-pass-0-a257aa450a','who-lsss-2025-page-14-pass-0-c0ad49759d','Adults may replace regular salt with lower-sodium salt substitutes containing potassium.','Foods such as beans, peas, nuts, and green vegetables should remain the primary sources of dietary potassium.','Salt substitution and primary dietary potassium sources are distinct constraints.'],
  ['nss-diabetes-scope','PAIR_PRESERVE','who-nss-2023-page-10-pass-1-9d61be8a51','who-nss-2023-page-13-pass-0-cd69f60b78','Do not use non-sugar sweeteners for weight control or reducing noncommunicable disease risk.','The recommendation may not apply to people with pre-existing diabetes and does not address therapeutic uses of non-sugar sweeteners.','General recommendation and scope limitation are distinct.'],
];
const expansion = specs.map(([id,label,oldId,currentId,oldClaim,currentClaim,rationale], index) => ({
  pair_id:`r2.5exp-${String(index+1).padStart(2,'0')}`, source_pair_id:id, lineage_group:`who-${id}`, action_label:label,
  old_evidence:evidence(oldId,oldClaim), current_evidence:evidence(currentId,currentClaim), reviewer_rationale:rationale,
  reviewer_id:'codex-gpt5-primary-reviewer', reviewer_type:'ai_primary_reviewer_not_independent_human', external_model_api_used:false,
  detector_development_eligible:true, validation_only:false, fresh_v5_test_eligible:false,
}));
const parent = parseJsonl(parentText).map((row:any)=>({...row,lineage_group:row.lineage_group||`dga-${row.source_pair_id}`}));
const combined=[...parent,...expansion], combinedText=combined.map((row:any)=>JSON.stringify(row)).join('\n')+'\n', expansionText=expansion.map((row:any)=>JSON.stringify(row)).join('\n')+'\n';
await Promise.all([mkdir(OUT,{recursive:true}),mkdir(REVIEW,{recursive:true})]);
await writeFile(path.join(OUT,'development.jsonl'),combinedText,'utf8'); await writeFile(path.join(OUT,'validation.sealed.jsonl'),valText,'utf8');
await writeFile(path.join(REVIEW,'development_expansion.jsonl'),expansionText,'utf8');
const manifest={schema_version:'v5-r2.5-official-expansion-1',status:'expanded_development_frozen_validation_unchanged',parent_manifest_sha256:sha256(parentManifestText),
 development_sha256:sha256(combinedText),validation_sealed_sha256:sha256(valText),validation_artifact_changed:false,development_count:combined.length,added_count:expansion.length,
 development_distribution:Object.fromEntries(['PAIR_PRESERVE','BLOCK_RETAINED'].map(label=>[label,combined.filter((r:any)=>r.action_label===label).length])),
 lineage_group_count:new Set(combined.map((r:any)=>r.lineage_group)).size,official_source_expansion:true,external_model_api_used:false,validation_execution_count:0,fresh_v5_test_created:false};
const manifestText=JSON.stringify(manifest,null,2)+'\n'; await writeFile(path.join(OUT,'SPLIT_MANIFEST.json'),manifestText,'utf8');
await writeFile(path.join(OUT,'EXECUTION_GUARD.json'),JSON.stringify({status:'development_unlocked_local_detector_only',split_manifest_sha256:sha256(manifestText),development_selection_complete:false,validation_execution_count:0,external_gemini_or_gemma_calls_allowed:false,tuning_after_validation_allowed:false,fresh_v5_test_created:false},null,2)+'\n','utf8');
console.log(JSON.stringify(manifest,null,2));
