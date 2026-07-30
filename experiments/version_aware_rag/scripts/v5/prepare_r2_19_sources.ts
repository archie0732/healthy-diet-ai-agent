import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(
  ROOT,
  "experiments/version_aware_rag/data/sources_v5/r2_19",
);
const OUTPUT_DIR = path.join(
  ROOT,
  "experiments/version_aware_rag/data/corpus_v5_r2_19_draft",
);
const RETRIEVED_AT = "2026-07-28";
const MAX_CHARS = 1800;
const OVERLAP_CHARS = 200;

type SourceSpec = {
  document_id: string;
  file_name: string;
  title: string;
  published_at: string;
  edition: string;
  official_record_url: string;
  official_pdf_url: string;
  license: string;
  expected_page_count: number;
  visually_verified_pdf_pages: number[];
  capacity_topics: string[];
};

const SOURCES: SourceSpec[] = [
  {
    document_id: "who-potassium-adverse-effects-review-2012",
    file_name: "who_potassium_adverse_effects_review_2012.pdf",
    title:
      "Effect of increased potassium intake on blood pressure, renal function, blood lipids and other potential adverse effects",
    published_at: "2012-04-12",
    edition: "2012",
    official_record_url:
      "https://www.who.int/publications/i/item/9789241504881",
    official_pdf_url:
      "https://iris.who.int/server/api/core/bitstreams/e8f65240-5330-4b79-a390-46226bb4e37e/content",
    license: "WHO publication; all rights reserved on official record",
    expected_page_count: 122,
    visually_verified_pdf_pages: [10],
    capacity_topics: ["potassium", "renal_function", "adverse_effects"],
  },
  {
    document_id: "who-potassium-drinking-water-background-2009",
    file_name: "who_potassium_drinking_water_background.pdf",
    title:
      "Potassium in drinking-water: background document for development of WHO Guidelines for Drinking-water Quality",
    published_at: "2009-01-01",
    edition: "2009",
    official_record_url:
      "https://www.who.int/teams/environment-climate-change-and-health/water-sanitation-and-health/chemical-hazards-in-drinking-water",
    official_pdf_url:
      "https://cdn.who.int/media/docs/default-source/wash-documents/wash-chemicals/potassium-background.pdf?sfvrsn=4542eda3_4",
    license: "WHO publication; verify reuse terms on official record",
    expected_page_count: 12,
    visually_verified_pdf_pages: [10],
    capacity_topics: [
      "potassium",
      "hyperkalaemia",
      "renal_impairment",
      "medication_interaction",
    ],
  },
  {
    document_id: "who-nss-systematic-review-2022",
    file_name: "who_nss_systematic_review_2022.pdf",
    title:
      "Health effects of the use of non-sugar sweeteners: a systematic review and meta-analysis",
    published_at: "2022-04-12",
    edition: "2022",
    official_record_url:
      "https://www.who.int/publications/i/item/9789240046429",
    official_pdf_url:
      "https://iris.who.int/server/api/core/bitstreams/cc660df6-e1b1-4a31-b918-42e8c7fe5701/content",
    license: "WHO publication; verify reuse terms on official record",
    expected_page_count: 210,
    visually_verified_pdf_pages: [56],
    capacity_topics: [
      "non_sugar_sweeteners",
      "short_term_evidence",
      "long_term_evidence",
    ],
  },
  {
    document_id: "who-physical-activity-web-annex-2020",
    file_name: "who_physical_activity_web_annex_2020.pdf",
    title:
      "WHO guidelines on physical activity and sedentary behaviour: Web Annex. Evidence profiles",
    published_at: "2020-11-25",
    edition: "2020",
    official_record_url: "https://iris.who.int/handle/10665/336657",
    official_pdf_url:
      "https://iris.who.int/server/api/core/bitstreams/2e41f4b8-b47f-4e46-824a-a0b5b3b7000e/content",
    license: "CC BY-NC-SA 3.0 IGO",
    expected_page_count: 535,
    visually_verified_pdf_pages: [468],
    capacity_topics: [
      "physical_activity",
      "chronic_conditions",
      "disability",
      "pregnancy",
    ],
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
  const localPath = path.join(SOURCE_DIR, source.file_name);
  const bytes = await readFile(localPath);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${source.file_name} is not a PDF.`);
  }
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    if (result.total !== source.expected_page_count) {
      throw new Error(
        `${source.file_name} page count ${result.total} != ${source.expected_page_count}.`,
      );
    }
    let extractedCharacters = 0;
    for (const page of result.pages) {
      const pageText = normalize(page.text);
      extractedCharacters += pageText.length;
      if (!pageText) continue;
      for (const [passageIndex, passage] of splitPage(pageText).entries()) {
        const idHash = sha256(
          `${source.document_id}|${page.num}|${passageIndex}|${passage.text}`,
        ).slice(0, 10);
        chunks.push({
          chunk_id:
            `${source.document_id}-page-${page.num}-pass-${passageIndex}-${idHash}`,
          document_id: source.document_id,
          edition: source.edition,
          published_at: source.published_at,
          source_url: source.official_record_url,
          source_download_url: source.official_pdf_url,
          source_checksum: sha256(bytes),
          page_number: page.num,
          passage_index: passageIndex,
          char_start: passage.start,
          char_end: passage.end,
          text: passage.text,
          capacity_topics: source.capacity_topics,
          lineage_id: null,
          population_tags: [],
          condition_tags: [],
          annotation_status: "unreviewed_source_chunk",
        });
      }
    }
    if (extractedCharacters < 5_000) {
      throw new Error(`${source.file_name} has insufficient extractable text.`);
    }
    documents.push({
      ...source,
      local_path:
        `experiments/version_aware_rag/data/sources_v5/r2_19/${source.file_name}`,
      retrieved_at: RETRIEVED_AT,
      sha256: sha256(bytes),
      byte_length: bytes.length,
      pdf_page_count: result.total,
      extracted_characters: extractedCharacters,
      pdf_header_verified: true,
      text_extraction_verified: true,
      visual_verification_completed: true,
      status: "draft_r2_19_development_source",
    });
  } finally {
    await parser.destroy();
  }
}
const chunkText = `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`;
await writeFile(path.join(OUTPUT_DIR, "chunks.jsonl"), chunkText, "utf8");
const manifest = {
  schema_version: "v5-r2.19-source-manifest-1",
  status: "draft_source_corpus_not_gold",
  created_at: "2026-07-28T00:00:00.000+08:00",
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
  document_count: documents.length,
  chunk_count: chunks.length,
  chunks_sha256: sha256(chunkText),
};
await writeFile(
  path.join(OUTPUT_DIR, "source_manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  document_count: documents.length,
  chunk_count: chunks.length,
  chunks_sha256: manifest.chunks_sha256,
}, null, 2));
