import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(
  ROOT,
  "experiments/version_aware_rag/data/sources_v5/r2_11",
);
const OUTPUT_DIR = path.join(
  ROOT,
  "experiments/version_aware_rag/data/corpus_v5_r2_11_draft",
);
const RETRIEVED_AT = "2026-07-24";
const MAX_CHARS = 1800;
const OVERLAP_CHARS = 200;

type SourceSpec = {
  document_id: string;
  local_path: string;
  title: string;
  published_at: string;
  edition: string;
  official_record_url: string;
  official_pdf_url: string;
  license: string;
  official_record_page_count: number | null;
  visually_verified_pdf_pages: number[];
};

const SOURCES: SourceSpec[] = [
  {
    document_id: "who-physical-activity-2010",
    local_path:
      "experiments/version_aware_rag/data/sources_v5/r2_11/who_physical_activity_2010.pdf",
    title: "Global recommendations on physical activity for health",
    published_at: "2010-01-01",
    edition: "2010",
    official_record_url:
      "https://www.who.int/publications/i/item/9789241599979",
    official_pdf_url:
      "https://iris.who.int/server/api/core/bitstreams/d0972fd5-8f7d-4c87-b092-889e0f5f4618/content",
    license: "WHO publication; verify reuse terms on official record",
    official_record_page_count: 58,
    visually_verified_pdf_pages: [8],
  },
  {
    document_id: "who-physical-activity-2020",
    local_path:
      "experiments/version_aware_rag/data/sources_v5/r2_11/who_physical_activity_2020.pdf",
    title: "WHO guidelines on physical activity and sedentary behaviour",
    published_at: "2020-11-25",
    edition: "2020",
    official_record_url:
      "https://www.who.int/publications/i/item/9789240015128",
    official_pdf_url:
      "https://iris.who.int/server/api/core/bitstreams/faa83413-d89e-4be9-bb01-b24671aef7ca/content",
    license: "CC BY-NC-SA 3.0 IGO",
    official_record_page_count: null,
    visually_verified_pdf_pages: [12],
  },
  {
    document_id: "who-complementary-feeding-2023",
    local_path:
      "experiments/version_aware_rag/data/sources_v5/r2_11/who_complementary_feeding_2023.pdf",
    title:
      "WHO guideline for complementary feeding of infants and young children 6-23 months of age",
    published_at: "2023-10-16",
    edition: "2023",
    official_record_url:
      "https://www.who.int/publications/i/item/9789240081864",
    official_pdf_url:
      "https://iris.who.int/server/api/core/bitstreams/5abca011-4db2-4cf1-b959-45b756f7b600/content",
    license: "CC BY-NC-SA 3.0 IGO",
    official_record_page_count: 95,
    visually_verified_pdf_pages: [13, 14],
  },
  {
    document_id: "who-fao-trs-916-2003-part2",
    local_path:
      "experiments/version_aware_rag/data/sources_v5/who_fao/WHO_FAO_TRS_916_2003_part2.pdf",
    title:
      "Diet, nutrition and the prevention of chronic diseases: population nutrient goals and later chapters",
    published_at: "2003-04-23",
    edition: "2003",
    official_record_url: "https://www.fao.org/4/AC911E/AC911E00.htm",
    official_pdf_url:
      "https://www.fao.org/docrep/pdf/005/ac911e/ac911e02.pdf",
    license: "WHO/FAO publication; verify reuse terms on official record",
    official_record_page_count: 93,
    visually_verified_pdf_pages: [3, 36],
  },
];

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

const normalize = (text: string) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const splitPage = (text: string) => {
  if (text.length <= MAX_CHARS) return [{ start: 0, end: text.length, text }];
  const parts: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHARS, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf("\n\n", end),
        text.lastIndexOf(". ", end),
      );
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
  const absolutePath = path.join(ROOT, source.local_path);
  const bytes = await readFile(absolutePath);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${source.local_path} is not a PDF`);
  }

  const sourceChecksum = sha256(bytes);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    for (const page of result.pages) {
      const pageText = normalize(page.text);
      if (!pageText) continue;
      for (const [passageIndex, passage] of splitPage(pageText).entries()) {
        const idHash = sha256(
          `${source.document_id}|${page.num}|${passageIndex}|${passage.text}`,
        ).slice(0, 10);
        chunks.push({
          chunk_id: `${source.document_id}-page-${page.num}-pass-${passageIndex}-${idHash}`,
          document_id: source.document_id,
          edition: source.edition,
          published_at: source.published_at,
          source_url: source.official_record_url,
          source_download_url: source.official_pdf_url,
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
          annotation_status: "unreviewed_source_chunk",
        });
      }
    }
    documents.push({
      ...source,
      retrieved_at: RETRIEVED_AT,
      sha256: sourceChecksum,
      byte_length: bytes.length,
      pdf_page_count: result.total,
      pdf_header_verified: true,
      text_extraction_verified: true,
      status: "draft_r2_11_development_source",
    });
  } finally {
    await parser.destroy();
  }
}

const chunkLines = `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`;
await writeFile(path.join(OUTPUT_DIR, "chunks.jsonl"), chunkLines, "utf8");

const rejectedDownloadBytes = await readFile(
  path.join(SOURCE_DIR, "paho_complementary_feeding_2003.download-error.html"),
);
const manifest = {
  schema_version: "v5-r2.11-source-manifest-1",
  status: "draft_source_corpus_not_gold",
  created_at: "2026-07-24T00:00:00.000+08:00",
  retrieved_at: RETRIEVED_AT,
  development_only: true,
  held_out_test_eligible: false,
  extraction: {
    package: "pdf-parse",
    version: "2.4.5",
    max_chars: MAX_CHARS,
    overlap_chars: OVERLAP_CHARS,
  },
  documents,
  rejected_downloads: [
    {
      requested_document_id: "paho-complementary-feeding-2003",
      attempted_urls: [
        "https://iris.paho.org/bitstream/handle/10665.2/752/OP_194.pdf",
        "https://www3.paho.org/hq/dmdocuments/2012/GuidingPrinciples.pdf",
        "https://www.paho.org/sites/default/files/CA_guiding_principles_eng.pdf",
      ],
      local_path: path
        .relative(
          ROOT,
          path.join(
            SOURCE_DIR,
            "paho_complementary_feeding_2003.download-error.html",
          ),
        )
        .replaceAll("\\", "/"),
      byte_length: rejectedDownloadBytes.length,
      sha256: sha256(rejectedDownloadBytes),
      reason:
        "PAHO endpoints returned HTML 403/502 responses to the command-line client; no failed response is eligible as a PDF source.",
    },
  ],
  document_count: documents.length,
  chunk_count: chunks.length,
  chunks_sha256: sha256(chunkLines),
};

await writeFile(
  path.join(OUTPUT_DIR, "source_manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      document_count: documents.length,
      chunk_count: chunks.length,
      chunks_sha256: manifest.chunks_sha256,
    },
    null,
    2,
  ),
);
