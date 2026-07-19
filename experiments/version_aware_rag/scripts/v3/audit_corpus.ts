import * as fs from 'fs';
import * as path from 'path';
import { auditCorpus } from '../../src/corpus/audit_corpus';

function main() {
  const chunksJsonlPath = path.resolve(
    process.cwd(),
    'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl'
  );
  const reportPath = path.resolve(
    process.cwd(),
    'experiments/version_aware_rag/data/corpus_v3/corpus_report.json'
  );

  console.log('Auditing v3 passage-level corpus...');
  console.log(`Chunks File: ${chunksJsonlPath}`);

  try {
    const report = auditCorpus(chunksJsonlPath);
    
    // Save report to disk
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    
    // Print summary to console
    console.log('\n=========================================================================================================================');
    console.log('                                          CORPUS QUALITY AUDIT REPORT                                                    ');
    console.log('=========================================================================================================================');
    console.log(`Total Chunks:              ${report.total_chunks}`);
    console.log(`Null Lineage Rate:         ${(report.null_lineage_rate * 100).toFixed(0)}% (${report.null_lineage_count} chunks)`);
    console.log(`Exact Duplicate Pairs:      ${report.exact_duplicates}`);
    console.log(`Near Duplicate Pairs:       ${report.near_duplicates}`);
    console.log(`Word Length Stats:         Min: ${report.word_length_stats.min}, Max: ${report.word_length_stats.max}, Avg: ${report.word_length_stats.avg}`);
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    console.log('Edition Breakdown:');
    for (const [edition, count] of Object.entries(report.version_distribution)) {
      console.log(`  - ${edition.padEnd(20)}: ${count} chunks`);
    }
    console.log('=========================================================================================================================\n');
    console.log(`Report successfully written to ${reportPath}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Corpus audit failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
