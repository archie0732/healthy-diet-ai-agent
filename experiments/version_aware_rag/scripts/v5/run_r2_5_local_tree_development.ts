import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP=path.join(process.cwd(),'experiments/version_aware_rag');
const CONFIG=path.join(EXP,'data/configs/v5_r2_5_expanded_local_action_detector');
const OUT=path.join(EXP,'results/v5/r2_5_local_tree_development');
const sha256=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const parse=(v:string)=>v.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const STOP=new Set('a an and are as at be been by for from has have in into is it its of on or that the their these this to was were when which while who with'.split(' '));
const words=(v:string)=>new Set(v.toLowerCase().replace(/[^a-z0-9%<>.-]+/g,' ').trim().split(/\s+/).filter(x=>x&&!STOP.has(x)));
const nums=(v:string)=>new Set((v.toLowerCase().match(/\b\d+(?:\.\d+)?(?:\s*(?:%|mg|g|iu|mmol|ounces?|servings?|years?|months?|day))?/g)||[]).map(x=>x.replace(/\s+/g,'')));
const inter=<T>(a:Set<T>,b:Set<T>)=>[...a].filter(x=>b.has(x)).length;
const count=(v:string,rs:RegExp[])=>rs.reduce((s,r)=>s+(v.match(r)?.length||0),0);
const featureNames=['token_jaccard','old_coverage','length_ratio','numeric_overlap','old_only_numeric','current_only_numeric','scope_cues','exception_cues','replacement_cues','detail_cues','old_general_cues','old_quantitative','current_quantitative','modal_overlap','lexical_conflict'];
function features(oldText:string,currentText:string){
 const o=oldText.toLowerCase(),c=currentText.toLowerCase(),ot=words(oldText),ct=words(currentText),ov=inter(ot,ct),on=nums(oldText),cn=nums(currentText);
 const scope=[/\bstarting at\b/g,/\byounger than\b/g,/\bolder than\b/g,/\bage[s]?\b/g,/\badults?\b/g,/\bchildren\b/g,/\binfants?\b/g,/\bpregnan\w*\b/g];
 const exc=[/\bexcept\w*\b/g,/\bif\b/g,/\bunless\b/g,/\bhighly active\b/g,/\bmedical condition\b/g,/\bhealth care professional\b/g,/\brisk\b/g,/\bdoes not apply\b/g];
 const repl=[/\breplace\w*\b/g,/\binstead\b/g,/\bno amount\b/g,/\bnot recommended\b/g,/\bavoid\b/g,/\bfull-fat\b/g,/\blow-fat\b/g];
 const detail=[/\bserving goals?\b/g,/\bper kilogram\b/g,/\bingredient\w*\b/g,/\bexamples?\b/g,/\bincluding\b/g,/\bconsult\b/g,/\bidentify\b/g,/\bprimary sources?\b/g];
 const general=[/\ball individuals\b/g,/\bregardless\b/g,/\bonly for\b/g,/\bshould not begin\b/g,/\bcustomiz\w*\b/g,/\bvariety\b/g,/\bat least half\b/g,/\bgeneral population\b/g];
 const quant=[/\bpercent\b/g,/%/g,/\bper day\b/g,/\bmg\b/g,/\bgrams?\b/g,/\biu\b/g,/\bservings?\b/g,/\bounces?\b/g,/\bkilogram\b/g];
 const modals=['should','recommend','limit','avoid','consume','provide','introduce','continue','prioritize','replace'];
 const conflicts=[['low-fat','full-fat'],['less than','increased'],['avoid','consume'],['one year','2 years']];
 return [ov/Math.max(1,new Set([...ot,...ct]).size),ov/Math.max(1,ot.size),Math.min(4,ct.size/Math.max(1,ot.size)),inter(on,cn)/Math.max(1,new Set([...on,...cn]).size),
 [...on].filter(x=>!cn.has(x)).length,[...cn].filter(x=>!on.has(x)).length,count(c,scope),count(c,exc),count(c,repl),count(c,detail),count(o,general),count(o,quant),count(c,quant),
 modals.filter(x=>o.includes(x)&&c.includes(x)).length/modals.length,conflicts.filter(([a,b])=>(o.includes(a)&&c.includes(b))||(o.includes(b)&&c.includes(a))).length];
}
type Tree={p:number,n:number,feature?:number,threshold?:number,left?:Tree,right?:Tree};
const gini=(ys:number[])=>{if(!ys.length)return 0;const p=ys.reduce((a,b)=>a+b,0)/ys.length;return 2*p*(1-p)};
function train(xs:number[][],ys:number[],depth:number,minLeaf:number):Tree{
 const node:Tree={p:ys.reduce((a,b)=>a+b,0)/ys.length,n:ys.length}; if(depth===0||gini(ys)===0||ys.length<minLeaf*2)return node;
 let best:any=null;
 for(let f=0;f<xs[0].length;f++){const vals=[...new Set(xs.map(x=>x[f]))].sort((a,b)=>a-b);for(let k=0;k<vals.length-1;k++){const t=(vals[k]+vals[k+1])/2,li=xs.map((x,i)=>x[f]<=t?i:-1).filter(i=>i>=0),ri=xs.map((x,i)=>x[f]>t?i:-1).filter(i=>i>=0);if(li.length<minLeaf||ri.length<minLeaf)continue;const loss=(li.length*gini(li.map(i=>ys[i]))+ri.length*gini(ri.map(i=>ys[i])))/ys.length;if(!best||loss<best.loss)best={f,t,li,ri,loss}}}
 if(!best)return node; node.feature=best.f;node.threshold=best.t;node.left=train(best.li.map((i:number)=>xs[i]),best.li.map((i:number)=>ys[i]),depth-1,minLeaf);node.right=train(best.ri.map((i:number)=>xs[i]),best.ri.map((i:number)=>ys[i]),depth-1,minLeaf);return node;
}
function predict(tree:Tree,x:number[]):number{if(tree.feature===undefined)return tree.p;return predict(x[tree.feature]<=tree.threshold! ? tree.left! : tree.right!,x)}
function metrics(ys:number[],scores:number[],threshold:number){let tp=0,fp=0,tn=0,fn=0;ys.forEach((y,i)=>{const p=scores[i]>=threshold?1:0;if(y&&p)tp++;else if(!y&&p)fp++;else if(!y)tn++;else fn++});return{true_preserve:tp,false_preserve_count:fp,true_block:tn,missed_preserve:fn,accuracy:(tp+tn)/ys.length,pair_preserve_precision:tp+fp?tp/(tp+fp):0,pair_preserve_recall:tp+fn?tp/(tp+fn):0}}
const [devText,manifestText,guardText]=await Promise.all([readFile(path.join(CONFIG,'development.jsonl'),'utf8'),readFile(path.join(CONFIG,'SPLIT_MANIFEST.json'),'utf8'),readFile(path.join(CONFIG,'EXECUTION_GUARD.json'),'utf8')]);
const manifest=JSON.parse(manifestText),guard=JSON.parse(guardText);if(!['development_unlocked_local_detector_only','blocked_no_safe_local_detector'].includes(guard.status)||guard.validation_execution_count!==0||sha256(devText)!==manifest.development_sha256)throw new Error('Local tree guard failed');
const rows=parse(devText),xs=rows.map((r:any)=>features(r.old_evidence.atomic_claim_text||r.old_evidence.text,r.current_evidence.atomic_claim_text||r.current_evidence.text)),ys=rows.map((r:any)=>r.action_label==='PAIR_PRESERVE'?1:0);
const configs:any[]=[];
for(const maxDepth of [2,3,4,5])for(const minLeaf of [2,3,4,5]){
 const scores=rows.map((row:any,i:number)=>{const group=row.lineage_group||row.source_pair_id||row.pair_id,idx=rows.map((r:any,j:number)=>({j,g:r.lineage_group||r.source_pair_id||r.pair_id})).filter((x:any)=>x.g!==group).map((x:any)=>x.j);return predict(train(idx.map((j:number)=>xs[j]),idx.map((j:number)=>ys[j]),maxDepth,minLeaf),xs[i])});
 const thresholds=[...new Set([0.5,...scores.map(s=>s+1e-9)])].sort((a,b)=>a-b);for(const threshold of thresholds)configs.push({max_depth:maxDepth,min_leaf:minLeaf,threshold,scores,metrics:metrics(ys,scores,threshold)});
}
const eligible=configs.filter(c=>c.metrics.false_preserve_count===0&&c.metrics.pair_preserve_precision===1&&c.metrics.pair_preserve_recall>=.5).sort((a,b)=>b.metrics.pair_preserve_recall-a.metrics.pair_preserve_recall||b.metrics.accuracy-a.metrics.accuracy||a.max_depth-b.max_depth||b.min_leaf-a.min_leaf);
const selected=eligible[0]||null,bestSafe=configs.filter(c=>c.metrics.false_preserve_count===0).sort((a,b)=>b.metrics.pair_preserve_recall-a.metrics.pair_preserve_recall||b.metrics.accuracy-a.metrics.accuracy)[0];
const chosen=selected||bestSafe,report={status:selected?'local_tree_selected_validation_unlock_eligible':'blocked_no_safe_local_tree',development_only:true,external_model_api_used:false,evaluation:'leave_one_lineage_group_out',feature_names:featureNames,forbidden_features:['pair_id','topic','relation_type','judgments','validation_data'],gate:'false_preserve=0, precision=1, recall>=0.5',selected_config:selected?{max_depth:selected.max_depth,min_leaf:selected.min_leaf,threshold:selected.threshold,metrics:selected.metrics}:null,best_zero_false_preserve_config:{max_depth:bestSafe.max_depth,min_leaf:bestSafe.min_leaf,threshold:bestSafe.threshold,metrics:bestSafe.metrics},frozen_tree:selected?train(xs,ys,selected.max_depth,selected.min_leaf):null,out_of_fold_predictions:rows.map((r:any,i:number)=>({pair_id:r.pair_id,gold:r.action_label,score:chosen.scores[i],predicted:chosen.scores[i]>=chosen.threshold?'PAIR_PRESERVE':'BLOCK_RETAINED'}))};
await mkdir(OUT,{recursive:true});const reportText=JSON.stringify(report,null,2)+'\n';await writeFile(path.join(OUT,'DEVELOPMENT_SELECTION.json'),reportText,'utf8');await writeFile(path.join(CONFIG,'EXECUTION_GUARD.json'),JSON.stringify({...guard,status:selected?'local_tree_development_frozen_validation_unlocked':'blocked_no_safe_local_tree',development_selection_complete:true,selected_config:selected?'local_tree_text_features':null,development_selection_sha256:sha256(reportText),validation_execution_count:0},null,2)+'\n','utf8');
console.log(JSON.stringify({status:report.status,selected_config:report.selected_config,best_zero_false_preserve_config:report.best_zero_false_preserve_config},null,2));
