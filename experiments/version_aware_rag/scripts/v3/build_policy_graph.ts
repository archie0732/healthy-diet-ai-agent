import * as fs from 'fs';
import * as path from 'path';
import { RuleBaselineDetector } from '../../src/versioning/detectors/rule_baseline';
import { LLMDetector } from '../../src/versioning/detectors/llm_detector';
import { PolicyEngine } from '../../src/versioning/policy_engine';
import { CorpusChunk } from '../../src/corpus/types';

function parseArgs() {
  const args = process.argv.slice(2);
  let model = 'rule_baseline';
  let mode: 'oracle_relation' | 'predicted_relation' = 'predicted_relation';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && i + 1 < args.length) {
      const modeVal = args[i + 1];
      if (modeVal === 'oracle' || modeVal === 'oracle_relation') {
        mode = 'oracle_relation';
      } else {
        mode = 'predicted_relation';
      }
      i++;
    }
  }
  return { model, mode };
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

async function main() {
  const { model, mode } = parseArgs();
  const rootDir = process.cwd();

  const chunksPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const pairsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const goldPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');
  const outputPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.predicted.jsonl');

  console.log(`Building policy graph mode: ${mode} using model: ${model}...`);

  try {
    const chunks = loadJsonl<CorpusChunk>(chunksPath);
    const pairs = loadJsonl<any>(pairsPath);
    const goldRelations = loadJsonl<any>(goldPath);

    const chunksMap = new Map<string, CorpusChunk>();
    for (const c of chunks) {
      chunksMap.set(c.chunk_id, c);
    }

    const goldMap = new Map<string, any>();
    for (const g of goldRelations) {
      goldMap.set(g.pair_id, g);
    }

    let detector: any;
    if (mode === 'predicted_relation') {
      if (model === 'rule_baseline') {
        detector = new RuleBaselineDetector();
      } else if (model === 'llm_zero_shot') {
        detector = new LLMDetector('zero-shot');
      } else if (model === 'llm_few_shot') {
        detector = new LLMDetector('few-shot');
      } else {
        console.error(`Error: Unknown model "${model}"`);
        process.exit(1);
      }
    }

    const outputRelations: any[] = [];

    for (const pair of pairs) {
      const oldChunk = chunksMap.get(pair.old_chunk_id);
      const newChunk = chunksMap.get(pair.new_chunk_id);

      if (!oldChunk || !newChunk) continue;

      let relationType: any;
      let confidence = 1.0;
      let rationale = '';

      if (mode === 'oracle_relation') {
        const gold = goldMap.get(pair.pair_id);
        if (!gold) continue;
        relationType = gold.relation_type;
        rationale = gold.rationale || 'Gold adjudicated relation';
      } else {
        const prediction = await detector.classify({ oldChunk, newChunk });
        relationType = prediction.relationType;
        confidence = prediction.confidence;
        rationale = prediction.rationale;
      }
      
      const decision = PolicyEngine.resolve(
        relationType,
        pair.pair_id,
        {
          mode,
          oldEdition: oldChunk.edition,
          newEdition: newChunk.edition,
          oldChunkLineage: oldChunk.lineage_id
        },
        rationale
      );

      outputRelations.push({
        pair_id: pair.pair_id,
        relation_type: relationType,
        policy_label: decision.state,
        applies_to_populations: decision.appliesToPopulations,
        applies_under_conditions: decision.appliesUnderConditions,
        valid_from: decision.validFrom,
        valid_to: decision.validTo,
        rationale: decision.reason,
        annotator_id: mode === 'oracle_relation' ? 'oracle' : 'predicted',
        confidence
      });
    }

    fs.writeFileSync(
      outputPath,
      outputRelations.map(r => JSON.stringify(r)).join('\n') + '\n',
      'utf8'
    );

    console.log(`Policy graph built successfully (${outputRelations.length} relations)! Saved to ${outputPath}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Failed to build policy graph:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

