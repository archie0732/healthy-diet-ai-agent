import * as fs from 'fs';
import * as path from 'path';
import { AnswerGenerator } from '../../src/generation/answer_generator';
import { CitationParser } from '../../src/generation/citation_parser';
import { CorpusChunk } from '../../src/corpus/types';

function parseArgs() {
  const args = process.argv.slice(2);
  let runDir = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runDir' && i + 1 < args.length) {
      runDir = args[i + 1];
      i++;
    }
  }
  return { runDir };
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
  const { runDir } = parseArgs();
  const rootDir = process.cwd();

  if (!runDir) {
    console.error('Error: Please provide a run directory path via --runDir <path>');
    process.exit(1);
  }

  const resolvedRunDir = path.resolve(rootDir, runDir);
  const rawResultsPath = path.join(resolvedRunDir, 'results_raw.json');
  const chunksPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');

  if (!fs.existsSync(rawResultsPath)) {
    console.error(`Error: results_raw.json not found in ${resolvedRunDir}`);
    process.exit(1);
  }

  console.log(`Generating answers for run: ${resolvedRunDir}...`);

  try {
    const rawResults = JSON.parse(fs.readFileSync(rawResultsPath, 'utf8'));
    const chunks = loadJsonl<CorpusChunk>(chunksPath);

    const chunksMap = new Map<string, CorpusChunk>();
    for (const c of chunks) {
      chunksMap.set(c.chunk_id, c);
    }

    const generator = new AnswerGenerator();
    const answerResults: any[] = [];

    for (const item of rawResults) {
      const question = item.question;
      const queryId = item.query_id;
      
      const retrievedChunkIds = item.retrieved.map((r: any) => r.chunkId);
      const retrievedChunks = retrievedChunkIds
        .map((cid: string) => chunksMap.get(cid))
        .filter(Boolean) as CorpusChunk[];

      const gen = await generator.generateAnswer(question, retrievedChunks);

      // Parse and validate citations
      const sentenceCitations = CitationParser.parseSentenceCitations(gen.answer, retrievedChunkIds);

      answerResults.push({
        query_id: queryId,
        question,
        answer: gen.answer,
        citations: sentenceCitations.allCitations,
        citation_validation: {
          valid: sentenceCitations.valid,
          invalid: sentenceCitations.invalid,
          has_invalid: sentenceCitations.hasInvalidCitations,
          has_missing: sentenceCitations.hasMissingCitations
        },
        sentence_mappings: sentenceCitations.sentenceMappings,
        model_info: gen.modelInfo
      });
    }

    // Write raw answer output
    const answersRawPath = path.join(resolvedRunDir, 'answers_raw.json');
    fs.writeFileSync(answersRawPath, JSON.stringify(answerResults, null, 2), 'utf8');

    // Write human readable report
    let md = `# Generated Answers & Citation Report\n\n`;
    md += `**Run Directory:** \`${path.basename(resolvedRunDir)}\`\n`;
    md += `**Model:** \`${answerResults[0]?.model_info?.model_id || 'unknown'}\`\n`;
    md += `**Prompt Version:** \`${answerResults[0]?.model_info?.prompt_version || 'v3'}\`\n\n`;

    for (const item of answerResults) {
      md += `### Query: ${item.query_id} - ${item.question}\n\n`;
      md += `**Answer:**\n${item.answer}\n\n`;
      md += `**Citations:** ${item.citations.join(', ') || 'None'}\n`;
      md += `**Invalid Citations:** ${item.citation_validation.invalid.join(', ') || 'None'}\n`;
      md += `**Latency:** ${item.model_info.latency_ms} ms | **Tokens:** ${item.model_info.token_usage?.total_tokens || 0}\n\n`;
      md += `---\n\n`;
    }

    const answersReportPath = path.join(resolvedRunDir, 'answers_report.md');
    fs.writeFileSync(answersReportPath, md, 'utf8');

    console.log(`Answers generated successfully! Saved to:\n  - ${answersRawPath}\n  - ${answersReportPath}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Answer generation pipeline failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
