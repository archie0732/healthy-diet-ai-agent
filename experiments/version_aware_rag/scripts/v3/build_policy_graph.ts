import * as fs from 'fs';
import * as path from 'path';
import { RuleBaselineDetector } from '../../src/versioning/detectors/rule_baseline';
import { LLMDetector } from '../../src/versioning/detectors/llm_detector';
import { PolicyEngine } from '../../src/versioning/policy_engine';
import { CorpusChunk } from '../../src/corpus/types';

function parseArgs() {
  const args = process.argv.slice(2);
  let model = 'rule_baseline';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    }
  }
  return { model };
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
  const { model } = parseArgs();
  const rootDir = process.cwd();

  const chunksPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const pairsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const outputPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.predicted.jsonl');

  console.log(`Building policy graph using detector model: ${model}...`);

  try {
    const chunks = loadJsonl<CorpusChunk>(chunksPath);
    const pairs = loadJsonl<any>(pairsPath);

    const chunksMap = new Map<string, CorpusChunk>();
    for (const c of chunks) {
      chunksMap.set(c.chunk_id, c);
    }

    // Initialize detector
    let detector: any;
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

    const predictedRelations: any[] = [];

    for (const pair of pairs) {
      const oldChunk = chunksMap.get(pair.old_chunk_id);
      const newChunk = chunksMap.get(pair.new_chunk_id);

      if (!oldChunk || !newChunk) continue;

      const prediction = await detector.classify({ oldChunk, newChunk });
      
      // Resolve policy using policy engine
      const decision = PolicyEngine.resolve(
        prediction.relationType,
        pair.pair_id,
        oldChunk.lineage_id,
        prediction.rationale
      );

      predictedRelations.push({
        pair_id: pair.pair_id,
        relation_type: prediction.relationType,
        policy_label: decision.state,
        rationale: decision.reason,
        annotator_id: 'predicted',
        confidence: prediction.confidence
      });
    }

    fs.writeFileSync(
      outputPath,
      predictedRelations.map(r => JSON.stringify(r)).join('\n') + '\n',
      'utf8'
    );

    console.log(`Policy graph built successfully! Predicted relation annotations saved to ${outputPath}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Failed to build policy graph:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
