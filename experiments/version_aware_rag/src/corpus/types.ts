export interface CorpusChunk {
  chunk_id: string;
  document_id: string;
  edition: "2015-2020" | "2020-2025" | "2025-2030";
  published_at: string;
  source_url: string;
  source_checksum: string;
  page_number: number;
  passage_index: number;
  char_start: number;
  char_end: number;
  text: string;
  topic_ids: string[];
  population_tags: string[];
  condition_tags: string[];
  numeric_claims: string[];
  lineage_id: string | null;
}

export interface DocumentMetadata {
  id: string;
  edition: "2015-2020" | "2020-2025" | "2025-2030";
  published_at: string;
  source_url: string;
  source_checksum: string;
  normalized_path: string;
}
