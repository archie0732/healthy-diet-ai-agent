import * as path from 'path';
import { buildSplits } from '../../src/annotation/build_splits';

function main() {
  const rootDir = process.cwd();
  
  const legacyQueriesPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations/evaluation_queries_v2.json');
  const legacyJudgmentsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations/evaluation_query_judgments_v2.json');
  const legacyPairsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations/evaluation_pairs.json');
  const legacyMappingPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/legacy_mapping.json');

  const annotationsV3Dir = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3');
  const splitsV3Dir = path.resolve(rootDir, 'experiments/version_aware_rag/data/splits_v3');

  console.log('Migrating legacy annotations & dividing dataset splits...');

  try {
    buildSplits(
      legacyQueriesPath,
      legacyJudgmentsPath,
      legacyPairsPath,
      legacyMappingPath,
      annotationsV3Dir,
      splitsV3Dir
    );
    console.log('Splits built successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error(`Failed to build splits:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
