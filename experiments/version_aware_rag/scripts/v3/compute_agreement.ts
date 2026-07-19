import * as fs from 'fs';
import * as path from 'path';
import { computeCohensKappa, computeJaccardSimilarity } from '../../src/annotation/agreement';

interface QueryJudgment {
  query_id: string;
  required_chunk_ids: string[];
  compatible_chunk_ids: string[];
  deprecated_chunk_ids: string[];
}

interface RelationAnnotation {
  pair_id: string;
  relation_type: string;
  policy_label: string;
}

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function main() {
  const rootDir = process.cwd();
  
  const annotationsDir = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3');
  
  const jPathA = path.join(annotationsDir, 'judgments.annotator_a.jsonl');
  const jPathB = path.join(annotationsDir, 'judgments.annotator_b.jsonl');
  
  const rPathA = path.join(annotationsDir, 'relations.annotator_a.jsonl');
  const rPathB = path.join(annotationsDir, 'relations.annotator_b.jsonl');

  console.log('Calculating inter-annotator agreement statistics...');

  try {
    const judgmentsA = loadJsonl<QueryJudgment>(jPathA);
    const judgmentsB = loadJsonl<QueryJudgment>(jPathB);
    
    const relationsA = loadJsonl<RelationAnnotation>(rPathA);
    const relationsB = loadJsonl<RelationAnnotation>(rPathB);

    // 1. Chunk Set Judgment Agreement (Jaccard similarity per query)
    const jaccardScores: number[] = [];
    const exactRequiredMatches: number[] = [];
    const count = Math.min(judgmentsA.length, judgmentsB.length);

    for (let i = 0; i < count; i++) {
      const ja = judgmentsA[i];
      const jb = judgmentsB.find(j => j.query_id === ja.query_id);
      if (!jb) continue;

      const setA = [...ja.required_chunk_ids, ...ja.compatible_chunk_ids];
      const setB = [...jb.required_chunk_ids, ...jb.compatible_chunk_ids];
      const jaccard = computeJaccardSimilarity(setA, setB);
      jaccardScores.push(jaccard);

      // Exact match on required set
      const reqA = [...ja.required_chunk_ids].sort().join(',');
      const reqB = [...jb.required_chunk_ids].sort().join(',');
      exactRequiredMatches.push(reqA === reqB ? 1 : 0);
    }

    const avgJaccard = jaccardScores.reduce((a, b) => a + b, 0) / jaccardScores.length;
    const exactRequiredRate = exactRequiredMatches.reduce((a, b) => a + b, 0) / exactRequiredMatches.length;

    // 2. Relation pair categorical label agreement (Cohen's Kappa)
    const relTypesA: string[] = [];
    const relTypesB: string[] = [];
    const policyLabelsA: string[] = [];
    const policyLabelsB: string[] = [];

    const relationMapB = new Map<string, RelationAnnotation>();
    for (const r of relationsB) {
      relationMapB.set(r.pair_id, r);
    }

    for (const ra of relationsA) {
      const rb = relationMapB.get(ra.pair_id);
      if (!rb) continue;

      relTypesA.push(ra.relation_type);
      relTypesB.push(rb.relation_type);
      policyLabelsA.push(ra.policy_label);
      policyLabelsB.push(rb.policy_label);
    }

    const kappaRelationType = computeCohensKappa(relTypesA, relTypesB);
    const kappaPolicyLabel = computeCohensKappa(policyLabelsA, policyLabelsB);

    console.log('\n=========================================================================================================================');
    console.log('                                       INTER-ANNOTATOR AGREEMENT REPORT (v3)                                             ');
    console.log('=========================================================================================================================');
    console.log(`Avg Jaccard Similarity (Evidence Sets):   ${(avgJaccard * 100).toFixed(1)}%`);
    console.log(`Exact Match Rate (Required Sets):         ${(exactRequiredRate * 100).toFixed(1)}%`);
    console.log(`Cohen's Kappa (Relation Type):            ${kappaRelationType.toFixed(3)}`);
    console.log(`Cohen's Kappa (Policy Label):             ${kappaPolicyLabel.toFixed(3)}`);
    console.log('=========================================================================================================================\n');
    process.exit(0);
  } catch (error: any) {
    console.error(`Failed to calculate agreement statistics:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
