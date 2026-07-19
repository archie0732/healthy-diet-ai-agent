import * as fs from 'fs';
import * as path from 'path';

function main() {
  const rootDir = process.cwd();
  const paperDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/paper');
  if (!fs.existsSync(paperDir)) {
    fs.mkdirSync(paperDir, { recursive: true });
  }

  console.log('Generating academic paper LaTeX & Markdown tables...');

  // 1. Corpus Statistics Table
  const corpusTable = `
### Table 1: Corpus & Annotation Dataset Statistics (v3)

| Metric | Value |
| :--- | :---: |
| Total Document Chunks | 583 |
| Average Word Length per Chunk | 216.58 words |
| Null Lineage Chunks Rate | 82.0% |
| Adjudicated Evaluation Queries | 10 |
| Adjudicated Relation Pairs | 11 |
| Inter-Annotator Agreement (Relation Type Cohen's Kappa) | 0.861 |
| Inter-Annotator Agreement (Policy Label Cohen's Kappa) | 0.744 |
`;

  // 2. Retrieval Comparison Table (overall & stratified)
  const retrievalTable = `
### Table 2: Downstream Retrieval Comparison (development split)

| System Configuration | Recall | Precision | MRR | nDCG | Stale Hit Rate | Avg Unsafe Chunks |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Append-Only RAG** | 28.9% | 22.2% | 0.500 | 0.360 | 50.0% | 2.33 |
| **Recency-Only RAG** | 63.3% | 61.1% | 1.000 | 0.800 | 16.7% | 1.17 |
| **Proposed Full Version-Aware** | 31.1% | 22.2% | 0.556 | 0.380 | 0.0% | 2.33 |
`;

  // 3. LaTeX Table formatting
  const latexTable = `
\\begin{table}[htbp]
\\centering
\\caption{Downstream Retrieval performance comparison on Development Split}
\\label{tab:retrieval_comparison}
\\begin{tabular}{lcccccc}
\\hline
\\textbf{System Configuration} & \\textbf{Recall} & \\textbf{Precision} & \\textbf{MRR} & \\textbf{nDCG} & \\textbf{Stale Hit} & \\textbf{Unsafe Count} \\\\ \\hline
Append-Only RAG & 28.9\\% & 22.2\\% & 0.500 & 0.360 & 50.0\\% & 2.33 \\\\
Recency-Only RAG & 63.3\\% & 61.1\\% & 1.000 & 0.800 & 16.7\\% & 1.17 \\\\
Proposed Version-Aware & 31.1\\% & 22.2\\% & 0.556 & 0.380 & 0.0\\% & 2.33 \\\\ \\hline
\\end{tabular}
\\end{table}
`;

  fs.writeFileSync(path.join(paperDir, 'tables.md'), `${corpusTable}\n\n${retrievalTable}`, 'utf8');
  fs.writeFileSync(path.join(paperDir, 'tables.tex'), latexTable, 'utf8');

  console.log(`Paper tables compiled successfully! Saved inside ${paperDir}`);
  process.exit(0);
}

if (require.main === module) {
  main();
}
