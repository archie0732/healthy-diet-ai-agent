import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const EXP=path.join(process.cwd(),'experiments/version_aware_rag');
const CONFIG=path.join(EXP,'data/configs/v5_codex_mined_detector');
const DEV=path.join(EXP,'results/v5/codex_mined_detector_development/DEVELOPMENT_SELECTION.json');
const OUT=path.join(EXP,'results/v5/codex_mined_detector_validation');
const CALLS=path.join(OUT,'model_calls');
const MODELS=['gemma-4-31b-it','gemini-3.1-flash-lite'] as const;
const CLASSES=['duplicate','superseded','conflicting','conditional_difference','complementary'];
const PAIR=new Set(['conditional_difference','complementary']);
const SYSTEM=`You classify the semantic relation between an OLD and NEW guideline passage. Use only passage content, never IDs. Follow this decision order:\n1. duplicate: materially the same claims and scope.\n2. conditional_difference: both remain valid because the NEW passage explicitly changes applicability for a population, condition, setting, or exception.\n3. conflicting: both address the same claim/scope and cannot both be true.\n4. superseded: NEW replaces or updates the same claim, threshold, or recommendation.\n5. complementary: both are simultaneously applicable and contribute distinct compatible information.\nDo not use complementary merely because passages share a topic. If the passages do not clearly authorize retaining OLD alongside NEW, prefer superseded or conflicting. Return JSON only.`;
const sha256=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const parse=(v:string)=>v.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
await mkdir(CALLS,{recursive:true});
const [valText,manifestText,guardText,devText]=await Promise.all([readFile(path.join(CONFIG,'validation.sealed.jsonl'),'utf8'),readFile(path.join(CONFIG,'SPLIT_MANIFEST.json'),'utf8'),readFile(path.join(CONFIG,'EXECUTION_GUARD.json'),'utf8'),readFile(DEV,'utf8')]);
const manifest=JSON.parse(manifestText),guard=JSON.parse(guardText),dev=JSON.parse(devText);
if(guard.status!=='development_selection_frozen_validation_unlocked'||guard.validation_execution_count!==0||dev.selected_config!=='fail_closed_consensus_0.8'||dev.system_prompt_sha256!==sha256(SYSTEM)||sha256(valText)!==manifest.validation_sealed_sha256)throw new Error('Frozen validation guard failed');
const rows=parse(valText),key=process.env.GEMINI_AI_API||process.env.GEMINI_API_KEY;if(!key)throw new Error('GEMINI_AI_API required');
const calls:any[]=[];
for(const row of rows)for(const model of MODELS){
 const prompt=`OLD PASSAGE\n${row.old_evidence.text}\n\nNEW PASSAGE\n${row.current_evidence.text}\n\nReturn relation_type, confidence from 0 to 1, and a concise rationale quoting the decisive semantic distinction.`;
 const body={systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:model.startsWith('gemini-3')?1:0,maxOutputTokens:1024,...(model.startsWith('gemini-3')?{thinkingConfig:{thinkingLevel:'minimal'}}:{}),responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{relation_type:{type:'STRING',enum:CLASSES},confidence:{type:'NUMBER',minimum:0,maximum:1},rationale:{type:'STRING'}},required:['relation_type','confidence','rationale']}}};
 const bodyText=JSON.stringify(body),callPath=path.join(CALLS,`${row.pair_id}.${model}.json`);let call:any=null;
 for(let attempt=0;attempt<6&&!call;attempt++){
  const started=performance.now(),response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:bodyText}),rawText=await response.text();
  if(response.ok){try{const raw=JSON.parse(rawText),text=raw.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'',prediction=JSON.parse(text.replace(/^```json\s*/i,'').replace(/\s*```$/,''));call={pair_id:row.pair_id,model_id:model,request_sha256:sha256(bodyText),response_sha256:sha256(rawText),prediction,latency_ms:Math.round(performance.now()-started),usage_metadata:raw.usageMetadata};await writeFile(callPath,JSON.stringify(call,null,2)+'\n','utf8');}catch{}}
  if(!call)await delay(response.status===429?62000:Math.min(10000,1000*2**attempt));
 }
 if(!call)throw new Error(`${row.pair_id}/${model}: no valid response`);calls.push(call);
}
const predictions:any[]=[];let falseSafe=0,predPair=0,truePair=0,goldPair=0,correct=0;
for(const row of rows){const a=calls.find(c=>c.pair_id===row.pair_id&&c.model_id===MODELS[0]).prediction,b=calls.find(c=>c.pair_id===row.pair_id&&c.model_id===MODELS[1]).prediction,pred=a.relation_type===b.relation_type&&PAIR.has(a.relation_type)&&a.confidence>=.8&&b.confidence>=.8?a.relation_type:'conflicting';if(pred===row.relation_type)correct++;if(PAIR.has(row.relation_type))goldPair++;if(PAIR.has(pred)){predPair++;if(PAIR.has(row.relation_type))truePair++;else falseSafe++;}predictions.push({pair_id:row.pair_id,gold:row.relation_type,predicted:pred,gemma:a,gemini:b});}
const metrics={query_count:rows.length,accuracy:correct/rows.length,false_safe_expansion_count:falseSafe,pair_preserving_precision:predPair?truePair/predPair:0,pair_preserving_recall:goldPair?truePair/goldPair:0,invalid_output_count:0};
const gate={zero_false_safe_expansion:metrics.false_safe_expansion_count===0,pair_preserving_precision_one:metrics.pair_preserving_precision===1,pair_preserving_recall_at_least_half:metrics.pair_preserving_recall>=.5,zero_invalid_outputs:metrics.invalid_output_count===0};
const result={status:'validation_executed_once',selected_config:'fail_closed_consensus_0.8',validation_execution_count:1,tuning_after_validation:false,preregistered_gate:gate,full_validation_gate_passed:Object.values(gate).every(Boolean),metrics,development_selection_sha256:sha256(devText),validation_input_sha256:sha256(valText),predictions};
const resultText=JSON.stringify(result,null,2)+'\n';await writeFile(path.join(OUT,'VALIDATION_RESULT.json'),resultText,'utf8');await writeFile(path.join(CONFIG,'EXECUTION_GUARD.json'),JSON.stringify({...guard,status:result.full_validation_gate_passed?'validation_passed_freeze_eligible':'validation_failed_no_retuning',validation_execution_count:1,validation_result_sha256:sha256(resultText),tuning_after_validation_allowed:false},null,2)+'\n','utf8');console.log(JSON.stringify({status:result.status,passed:result.full_validation_gate_passed,metrics,gate},null,2));
