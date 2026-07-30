import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP=path.join(process.cwd(),'experiments/version_aware_rag');
const INPUT=path.join(EXP,'data/annotations_v5/codex_mined_relation_pairs/reviewed_pairs.jsonl');
const OUT=path.join(EXP,'data/configs/v5_codex_mined_detector');
const sha256=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const parse=(v:string)=>v.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const inputText=await readFile(INPUT,'utf8'),rows=parse(inputText);

// Selected before detector execution. Shared-evidence connected components stay
// wholly within one split. v5claim-010 and -015 share a current evidence span.
const validationIds=new Set(['v5claim-006','v5claim-010','v5claim-012','v5claim-015','v5claim-018']);
const validation=rows.filter((row:any)=>validationIds.has(row.pair_id));
const development=rows.filter((row:any)=>!validationIds.has(row.pair_id));
const devEvidence=new Set(development.flatMap((row:any)=>[row.old_evidence.text_sha256,row.current_evidence.text_sha256]));
const overlap=validation.flatMap((row:any)=>[row.old_evidence.text_sha256,row.current_evidence.text_sha256]).filter((hash:string)=>devEvidence.has(hash));
if(overlap.length)throw new Error(`Evidence leakage across splits: ${[...new Set(overlap)].join(',')}`);
const dist=(items:any[])=>Object.fromEntries(['duplicate','superseded','conflicting','conditional_difference','complementary'].map(label=>[label,items.filter(row=>row.relation_type===label).length]));
await mkdir(OUT,{recursive:true});
const devText=development.map((row:any)=>JSON.stringify(row)).join('\n')+'\n',valText=validation.map((row:any)=>JSON.stringify(row)).join('\n')+'\n';
await writeFile(path.join(OUT,'development.jsonl'),devText,'utf8');
await writeFile(path.join(OUT,'validation.sealed.jsonl'),valText,'utf8');
const manifest={status:'split_frozen_before_detector_calls',split_unit:'connected_component_of_atomic_evidence_sha256',development_count:development.length,validation_count:validation.length,development_distribution:dist(development),validation_distribution:dist(validation),evidence_hash_overlap_count:overlap.length,input_sha256:sha256(inputText),development_sha256:sha256(devText),validation_sealed_sha256:sha256(valText),validation_labels_must_not_be_read_during_development_selection:true,reviewer_provenance:'codex-gpt5-primary-reviewer_not_independent_human'};
const manifestText=JSON.stringify(manifest,null,2)+'\n';
await writeFile(path.join(OUT,'SPLIT_MANIFEST.json'),manifestText,'utf8');
await writeFile(path.join(OUT,'EXECUTION_GUARD.json'),JSON.stringify({status:'development_unlocked',split_manifest_sha256:sha256(manifestText),development_selection_complete:false,validation_execution_count:0,tuning_after_validation_allowed:false,fresh_v5_test_created:false},null,2)+'\n','utf8');
console.log(JSON.stringify(manifest,null,2));
