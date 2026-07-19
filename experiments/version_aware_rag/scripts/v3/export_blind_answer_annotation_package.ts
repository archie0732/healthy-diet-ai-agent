import * as fs from 'fs';
import * as path from 'path';
import { getFileChecksum } from '../../../../src/shared/hash';

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findLatestRun(v3Dir: string, pattern: string): string | null {
  if (!fs.existsSync(v3Dir)) return null;
  const dirs = fs.readdirSync(v3Dir)
    .filter(d => fs.statSync(path.join(v3Dir, d)).isDirectory() && d.includes(pattern))
    .sort()
    .reverse();
  return dirs.length > 0 ? path.join(v3Dir, dirs[0]) : null;
}

// Pseudo-random seedable shuffle for deterministic reproducibility
function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let m = arr.length, t, i;
  let s = seed;
  const pseudoRandom = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  while (m) {
    i = Math.floor(pseudoRandom() * m--);
    t = arr[m];
    arr[m] = arr[i];
    arr[i] = t;
  }
  return arr;
}

async function main() {
  const rootDir = process.cwd();
  const v3Dir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3');
  const paperDir = path.resolve(v3Dir, 'paper');
  const blindReviewDir = path.resolve(paperDir, 'blind_review');
  const privateDir = path.resolve(v3Dir, 'private');

  if (!fs.existsSync(blindReviewDir)) fs.mkdirSync(blindReviewDir, { recursive: true });
  if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir, { recursive: true });

  console.log('Exporting Blind Answer Annotation Package...');

  const systemConfigs = [
    { name: 'baseline_append_only', alias: 'System_B' },
    { name: 'baseline_recency_only', alias: 'System_C' },
    { name: 'proposed_full_version_aware', alias: 'System_A' }
  ];

  const rawAnswerItems: Array<{
    query_id: string;
    system_alias: string;
    real_system: string;
    question: string;
    answer: string;
    citations: string[];
  }> = [];

  const aliasMap: Record<string, string> = {};

  for (const cfg of systemConfigs) {
    aliasMap[cfg.name] = cfg.alias;
    const runPath = findLatestRun(v3Dir, cfg.name);
    if (!runPath) {
      throw new Error(`Could not find run directory for ${cfg.name}`);
    }

    const answersRawPath = path.join(runPath, 'answers_raw.json');
    if (!fs.existsSync(answersRawPath)) {
      throw new Error(`answers_raw.json missing in ${runPath}`);
    }

    const answers = loadJson<any[]>(answersRawPath);
    for (const item of answers) {
      rawAnswerItems.push({
        query_id: item.query_id,
        system_alias: cfg.alias,
        real_system: cfg.name,
        question: item.question,
        answer: item.answer,
        citations: item.citations || []
      });
    }
  }

  // Sort deterministically by query_id and system_alias to assign stable item_ids
  rawAnswerItems.sort((a, b) => {
    if (a.query_id !== b.query_id) return a.query_id.localeCompare(b.query_id);
    return a.system_alias.localeCompare(b.system_alias);
  });

  const totalItems = rawAnswerItems.length;
  console.log(`Loaded ${totalItems} items across 3 systems.`);

  // Create stable item_ids and secret mapping
  const itemMapping: Record<string, any> = {};
  const blindBaseItems: Array<{
    item_id: string;
    query_id: string;
    question: string;
    system_alias: string;
    answer: string;
    citations: string[];
  }> = [];

  rawAnswerItems.forEach((item, index) => {
    const itemId = `blind-${String(index + 1).padStart(3, '0')}`;
    itemMapping[itemId] = {
      query_id: item.query_id,
      real_system: item.real_system,
      system_alias: item.system_alias
    };

    blindBaseItems.push({
      item_id: itemId,
      query_id: item.query_id,
      question: item.question,
      system_alias: item.system_alias,
      answer: item.answer,
      citations: item.citations
    });
  });

  // Save secret mapping to private location
  const secretMappingPath = path.join(privateDir, 'system_alias_mapping.secret.json');
  const secretMappingContent = {
    created_at: new Date().toISOString(),
    seed: 42,
    alias_mapping: aliasMap,
    item_mapping: itemMapping
  };

  fs.writeFileSync(secretMappingPath, JSON.stringify(secretMappingContent, null, 2), 'utf8');
  const secretChecksum = getFileChecksum(secretMappingPath);
  secretMappingContent['checksum'] = secretChecksum;
  fs.writeFileSync(secretMappingPath, JSON.stringify(secretMappingContent, null, 2), 'utf8');
  console.log(`Secret system alias mapping saved to: ${secretMappingPath}`);

  // Create randomized packages for Annotator 1 and Annotator 2
  const packageAnnotator1 = seededShuffle(blindBaseItems, 101);
  const packageAnnotator2 = seededShuffle(blindBaseItems, 202);

  const pkg1Path = path.join(blindReviewDir, 'annotation_package_annotator_1.json');
  const pkg2Path = path.join(blindReviewDir, 'annotation_package_annotator_2.json');

  fs.writeFileSync(pkg1Path, JSON.stringify(packageAnnotator1, null, 2), 'utf8');
  fs.writeFileSync(pkg2Path, JSON.stringify(packageAnnotator2, null, 2), 'utf8');

  // Create README.md in blind review package
  const readmeMd = `# Blind Answer Annotation Package (v3)

This package contains 24 randomized items for blind human evaluation across 3 RAG systems on held-out dietary queries.

## Package Contents
- \`annotation_package_annotator_1.json\`: Anonymized items randomized for Evaluator 1.
- \`annotation_package_annotator_2.json\`: Anonymized items randomized for Evaluator 2.
- \`annotation_rubric.md\`: Standardized scoring rubric across 6 quality metrics.
- \`README.md\`: Instructions for evaluators.

## Evaluation Format
For each item, evaluators should record scores in a JSON file formatted as:
\`\`\`json
{
  "item_id": "blind-001",
  "annotator_id": "annotator_1",
  "answer_correctness": 1.0,
  "completeness": 0.5,
  "version_correctness": 1.0,
  "conditional_boundary_preservation": 1.0,
  "unsupported_claim": 0.0,
  "citation_entailment": 1.0,
  "notes": "Optional comments"
}
\`\`\`
`;
  fs.writeFileSync(path.join(blindReviewDir, 'README.md'), readmeMd, 'utf8');

  console.log(`Blind annotation package successfully exported to ${blindReviewDir}:`);
  console.log(`  - ${pkg1Path}`);
  console.log(`  - ${pkg2Path}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Exporting blind annotation package failed:', err);
    process.exit(1);
  });
}
