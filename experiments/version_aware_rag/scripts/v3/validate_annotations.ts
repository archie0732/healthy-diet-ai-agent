import * as path from 'path';
import { validateAnnotations } from '../../src/annotation/validate_annotations';

function main() {
  const rootDir = process.cwd();
  
  const chunksJsonlPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const queriesJsonlPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl');
  const judgmentsJsonlPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl');
  const relationPairsJsonlPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const relationsJsonlPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');
  const splitsDir = path.resolve(rootDir, 'experiments/version_aware_rag/data/splits_v3');

  console.log('Validating annotations integrity & split isolation...');

  const errors = validateAnnotations(
    chunksJsonlPath,
    queriesJsonlPath,
    judgmentsJsonlPath,
    relationPairsJsonlPath,
    relationsJsonlPath,
    splitsDir
  );

  if (errors.length > 0) {
    console.error(`\nValidation failed! Found ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  [${err.type}] ID: ${err.id} - ${err.message}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll validation checks passed successfully! Annotation integrity verified.');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
