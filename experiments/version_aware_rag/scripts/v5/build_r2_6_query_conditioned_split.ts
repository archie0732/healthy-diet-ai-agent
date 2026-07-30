import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP=path.join(process.cwd(),'experiments/version_aware_rag');
const INPUT=path.join(EXP,'data/configs/v5_r2_5_expanded_local_action_detector/development.jsonl');
const OUT=path.join(EXP,'data/configs/v5_r2_6_query_conditioned_action_detector');
const sha256=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const parse=(v:string)=>v.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const queries:Record<string,string>={
 'v5claim-001':'What proportion of grain intake should be whole grain?',
 'v5claim-002':'Which dairy foods and fortified alternatives are currently recommended?',
 'v5claim-003':'Which animal and plant foods count as recommended protein foods?',
 'v5claim-004':'What daily alcohol moderation limits apply to women and men?',
 'v5claim-005':'What added-sugar ceiling applies from age two?',
 'v5claim-006':'What saturated-fat ceiling and age boundary currently apply?',
 'v5claim-007':'What are the current operative limits for added sugars?',
 'v5claim-008':'What sodium limits currently apply to children in each age band?',
 'v5claim-009':'How long should breastfeeding continue under current guidance?',
 'v5claim-010':'What is the current alcohol guidance, including who should abstain?',
 'v5claim-011':'Does current guidance recommend low-fat or full-fat dairy?',
 'v5claim-012':'Should non-nutritive sweeteners be recommended as part of a healthy diet?',
 'v5claim-013':'What sodium ceiling applies generally, and what exception applies to highly active people?',
 'v5claim-014':'What added-sugar guidance applies above and below age two?',
 'v5claim-015':'Who should avoid alcohol, and should a person begin drinking for health?',
 'v5claim-016':'How should a generally healthy dietary pattern be adapted for someone with chronic disease?',
 'v5claim-017':'Which protein foods and daily protein target are currently recommended?',
 'v5claim-018':'Which vegetable and fruit groups should be eaten, and what daily serving goals apply?',
 'v5claim-019':'What whole-grain proportion and daily serving goal should be followed?',
 'v5claim-020':'Which infants need vitamin D, at what dose, and when should it begin?',
 'v5claim-021':'What is the added-sugar limit and how can added sugars be identified on labels?',
 'v5claim-022':'When and how should allergenic foods be introduced, and when is professional advice needed?',
 'sodium-duplicate':'What is the WHO adult sodium ceiling?',
 'potassium-duplicate':'What is the WHO adult potassium intake target?',
 'sugars-duplicate':'What free-sugar ceiling applies to adults and children?',
 'nss-duplicate':'Should non-sugar sweeteners be used for weight control or NCD prevention?',
 'carbohydrate-duplicate':'Which foods should provide most dietary carbohydrate?',
 'total-fat-duplicate':'What total-fat ceiling applies to adults?',
 'sfa-duplicate':'What saturated-fat ceiling applies to adults and children?',
 'tfa-duplicate':'What trans-fat ceiling applies to adults and children?',
 'lsss-duplicate':'May adults replace regular salt with a lower-sodium potassium salt substitute?',
 'sodium-safety':'What is the adult sodium target, and which clinical conditions require an exception or supervised diet?',
 'potassium-safety':'What is the adult potassium target, and what clinical applicability limitations constrain it?',
 'sugars-definition':'What is the free-sugar ceiling, and which sugars count as free sugars?',
 'sugars-therapeutic':'What is the general free-sugar ceiling, and does it apply to therapeutic diets for acute malnutrition?',
 'carb-fruit-age':'How much fruit and vegetables should adults and each child age group consume?',
 'carb-fibre-age':'How much naturally occurring dietary fibre should adults and children consume?',
 'total-fat-undernutrition':'What total-fat ceiling prevents unhealthy weight gain, and how should it change where undernutrition is prevalent?',
 'sfa-replacement':'What saturated-fat ceiling applies, and which nutrients should replace saturated fat?',
 'tfa-replacement':'What trans-fat ceiling applies, and which fats should replace trans fat?',
 'lsss-food-potassium':'How can lower-sodium salt be used while keeping foods as the primary source of dietary potassium?',
 'nss-diabetes-scope':'What is the non-sugar-sweetener recommendation, and how does its scope differ for people with pre-existing diabetes or therapeutic uses?'
};
const validationIds=new Set(['sodium-duplicate','potassium-duplicate','sugars-duplicate','nss-duplicate','total-fat-duplicate','sfa-duplicate','sodium-safety','sugars-definition','carb-fruit-age','total-fat-undernutrition','tfa-replacement','nss-diabetes-scope']);
const inputText=await readFile(INPUT,'utf8'),rows=parse(inputText);
const conditioned=rows.map((row:any)=>{
 const query=queries[row.source_pair_id];if(!query)throw new Error(`Missing query for ${row.source_pair_id}`);
 return {...row,pair_id:`r2.6-${row.source_pair_id}`,query:{text:query,text_sha256:sha256(query),author:'codex-gpt5-primary-reviewer',external_model_api_used:false},
 endpoint_contract:'Preserve OLD only when it contains an operative claim needed to answer QUERY that is not fully supplied, displaced, or contradicted by CURRENT.'};
});
const validation=conditioned.filter((row:any)=>validationIds.has(row.source_pair_id)),development=conditioned.filter((row:any)=>!validationIds.has(row.source_pair_id));
if(validation.length!==12)throw new Error(`Expected 12 validation rows, got ${validation.length}`);
const dist=(items:any[])=>Object.fromEntries(['PAIR_PRESERVE','BLOCK_RETAINED'].map(label=>[label,items.filter(r=>r.action_label===label).length]));
if(dist(validation).PAIR_PRESERVE!==6||dist(validation).BLOCK_RETAINED!==6)throw new Error('Validation must be balanced 6/6');
const devLineages=new Set(development.map((r:any)=>r.lineage_group)),overlap=validation.filter((r:any)=>devLineages.has(r.lineage_group));
if(overlap.length)throw new Error('Lineage leakage');
await mkdir(OUT,{recursive:true});
const devText=development.map((r:any)=>JSON.stringify(r)).join('\n')+'\n',valText=validation.map((r:any)=>JSON.stringify(r)).join('\n')+'\n';
await writeFile(path.join(OUT,'development.jsonl'),devText,'utf8');await writeFile(path.join(OUT,'validation.sealed.jsonl'),valText,'utf8');
const manifest={schema_version:'v5-r2.6-query-conditioned-1',status:'query_conditioned_split_frozen_before_model_selection',endpoint:'query_plus_atomic_old_plus_atomic_current_to_binary_action',
 source_pool_sha256:sha256(inputText),development_count:development.length,validation_count:validation.length,development_distribution:dist(development),validation_distribution:dist(validation),
 development_lineage_count:new Set(development.map((r:any)=>r.lineage_group)).size,validation_lineage_count:new Set(validation.map((r:any)=>r.lineage_group)).size,lineage_overlap_count:0,
 development_sha256:sha256(devText),validation_sealed_sha256:sha256(valText),external_model_api_used:false,validation_execution_count:0,
 validation_limitation:'These lineages appeared in prior pair-only Development exploration. They are held out only for the materially new query-conditioned endpoint and are not pristine held-out evidence.',
 old_pair_only_validation_superseded_unexecuted:true,fresh_v5_test_created:false};
const manifestText=JSON.stringify(manifest,null,2)+'\n';await writeFile(path.join(OUT,'SPLIT_MANIFEST.json'),manifestText,'utf8');
await writeFile(path.join(OUT,'EXECUTION_GUARD.json'),JSON.stringify({status:'query_conditioned_development_unlocked_local_only',split_manifest_sha256:sha256(manifestText),development_selection_complete:false,validation_execution_count:0,external_model_api_allowed:false,tuning_after_validation_allowed:false,fresh_v5_test_created:false},null,2)+'\n','utf8');
console.log(JSON.stringify(manifest,null,2));
