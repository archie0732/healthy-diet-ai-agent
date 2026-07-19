import * as path from 'path';
import { buildCorpus } from '../../src/corpus/build_corpus';

function main() {
  const documentsJsonPath = path.resolve(
    process.cwd(),
    'experiments/version_aware_rag/data/corpus_v3/documents.json'
  );
  const outputDir = path.resolve(
    process.cwd(),
    'experiments/version_aware_rag/data/corpus_v3'
  );

  console.log('Building v3 passage-level corpus...');
  console.log(`Documents Registry: ${documentsJsonPath}`);
  console.log(`Output Directory: ${outputDir}`);

  try {
    buildCorpus(documentsJsonPath, outputDir);
    console.log('Corpus built successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error(`Corpus build failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
