import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'experiments/version_aware_rag/data/sources_v4/who');
const OUTPUT_DIR = path.join(ROOT, 'experiments/version_aware_rag/data/corpus_v4_devval_draft');
const RETRIEVED_AT = '2026-07-21';
const MAX_CHARS = 1800;
const OVERLAP_CHARS = 200;

type SourceSpec = {
  document_id: string;
  file_name: string;
  title: string;
  published_at: string;
  edition: string;
  official_page_url: string;
  download_url: string;
  license: string;
};

const SOURCES: SourceSpec[] = [
  {
    document_id: 'who-potassium-2012',
    file_name: 'who_potassium_2012.pdf',
    title: 'Guideline: potassium intake for adults and children',
    published_at: '2012-12-25',
    edition: '2012',
    official_page_url: 'https://www.who.int/publications/i/item/9789241504829',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/8516dcd5-49a9-486e-890b-48471468a5bb/content',
    license: 'WHO publication; verify reuse terms on official record',
  },
  {
    document_id: 'who-sodium-2012',
    file_name: 'who_sodium_2012.pdf',
    title: 'Guideline: sodium intake for adults and children',
    published_at: '2012-12-25',
    edition: '2012',
    official_page_url: 'https://www.who.int/publications/i/item/9789241504836',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/d0f9feb5-ed78-44d1-9e06-533a93352012/content',
    license: 'WHO publication; verify reuse terms on official record',
  },
  {
    document_id: 'who-sugars-2015',
    file_name: 'who_sugars_2015.pdf',
    title: 'Guideline: sugars intake for adults and children',
    published_at: '2015-03-04',
    edition: '2015',
    official_page_url: 'https://www.who.int/publications/i/item/9789241549028',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/4be74f01-de93-4596-bbd1-02a97afb1221/content',
    license: 'WHO publication; reuse terms on official record',
  },
  {
    document_id: 'who-nss-2023',
    file_name: 'who_non_sugar_sweeteners_2023.pdf',
    title: 'Use of non-sugar sweeteners: WHO guideline',
    published_at: '2023-05-15',
    edition: '2023',
    official_page_url: 'https://www.who.int/publications/i/item/9789240073616',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/e567a191-33a4-44ff-8b37-788a4e432764/content',
    license: 'CC BY-NC-SA 3.0 IGO',
  },
  {
    document_id: 'who-carbohydrate-2023',
    file_name: 'who_carbohydrate_2023.pdf',
    title: 'Carbohydrate intake for adults and children: WHO guideline',
    published_at: '2023-07-17',
    edition: '2023',
    official_page_url: 'https://www.who.int/publications/i/item/9789240073593',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/6c31b739-c2e8-4515-970d-d9e42346c7f4/content',
    license: 'CC BY-NC-SA 3.0 IGO',
  },
  {
    document_id: 'who-total-fat-2023',
    file_name: 'who_total_fat_2023.pdf',
    title: 'Total fat intake for the prevention of unhealthy weight gain in adults and children: WHO guideline',
    published_at: '2023-07-17',
    edition: '2023',
    official_page_url: 'https://www.who.int/publications/i/item/9789240073654',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/fe09e661-09a6-4f53-ae8a-420cbd0c6a6e/content',
    license: 'CC BY-NC-SA 3.0 IGO',
  },
  {
    document_id: 'who-sat-trans-fat-2023',
    file_name: 'who_saturated_trans_fat_2023.pdf',
    title: 'Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline',
    published_at: '2023-07-17',
    edition: '2023',
    official_page_url: 'https://www.who.int/publications/i/item/9789240073630',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/463fa93e-6c17-4e5b-a4d7-928354ea34c3/content',
    license: 'CC BY-NC-SA 3.0 IGO',
  },
  {
    document_id: 'who-lsss-2025',
    file_name: 'who_lower_sodium_salt_substitutes_2025.pdf',
    title: 'Use of lower-sodium salt substitutes: WHO guideline',
    published_at: '2025-01-27',
    edition: '2025',
    official_page_url: 'https://www.who.int/publications/i/item/9789240105591',
    download_url: 'https://iris.who.int/server/api/core/bitstreams/31fad89a-d7c2-450c-9b74-cd2a8752e60f/content',
    license: 'CC BY-NC-SA 3.0 IGO',
  },
];

const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

const normalize = (text: string) =>
  text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitPage = (text: string) => {
  if (text.length <= MAX_CHARS) return [{ start: 0, end: text.length, text }];
  const parts: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHARS, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n\n', end), text.lastIndexOf('. ', end));
      if (boundary > start + Math.floor(MAX_CHARS * 0.6)) end = boundary + 1;
    }
    parts.push({ start, end, text: text.slice(start, end).trim() });
    if (end >= text.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }
  return parts.filter((part) => part.text.length > 0);
};

await mkdir(OUTPUT_DIR, { recursive: true });
const chunks: Record<string, unknown>[] = [];
const documents: Record<string, unknown>[] = [];

for (const source of SOURCES) {
  const absolutePath = path.join(SOURCE_DIR, source.file_name);
  const bytes = await readFile(absolutePath);
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error(`${source.file_name} is not a PDF`);
  }

  const sourceChecksum = sha256(bytes);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    for (const page of result.pages) {
      const pageText = normalize(page.text);
      if (!pageText) continue;
      for (const [passageIndex, passage] of splitPage(pageText).entries()) {
        const idHash = sha256(`${source.document_id}|${page.num}|${passageIndex}|${passage.text}`).slice(0, 10);
        chunks.push({
          chunk_id: `${source.document_id}-page-${page.num}-pass-${passageIndex}-${idHash}`,
          document_id: source.document_id,
          edition: source.edition,
          published_at: source.published_at,
          source_url: source.official_page_url,
          source_download_url: source.download_url,
          source_checksum: sourceChecksum,
          page_number: page.num,
          passage_index: passageIndex,
          char_start: passage.start,
          char_end: passage.end,
          text: passage.text,
          topic_ids: [],
          lineage_id: null,
          population_tags: [],
          condition_tags: [],
          annotation_status: 'unreviewed_source_chunk',
        });
      }
    }
    documents.push({
      ...source,
      local_path: path.relative(ROOT, absolutePath).replaceAll('\\', '/'),
      retrieved_at: RETRIEVED_AT,
      sha256: sourceChecksum,
      byte_length: bytes.length,
      page_count: result.total,
    });
  } finally {
    await parser.destroy();
  }
}

const chunkLines = chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n';
await writeFile(path.join(OUTPUT_DIR, 'chunks.jsonl'), chunkLines, 'utf8');

const manifest = {
  schema_version: 'v4-devval-source-manifest-1',
  status: 'draft-source-corpus-not-gold',
  created_at: new Date().toISOString(),
  retrieved_at: RETRIEVED_AT,
  extraction: {
    package: 'pdf-parse',
    version: '2.4.5',
    max_chars: MAX_CHARS,
    overlap_chars: OVERLAP_CHARS,
  },
  documents,
  document_count: documents.length,
  chunk_count: chunks.length,
  chunks_sha256: sha256(chunkLines),
  held_out_test_eligible: false,
};
await writeFile(path.join(OUTPUT_DIR, 'source_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ document_count: documents.length, chunk_count: chunks.length, chunks_sha256: manifest.chunks_sha256 }, null, 2));
