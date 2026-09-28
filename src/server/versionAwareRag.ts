/**
 * Version-aware guideline retrieval for the chat agent.
 *
 * TypeScript port of the V7 proposed method (system E) from
 * experiments/version_aware_rag/scripts/v6/v6r_retrieval_core.py:
 *   1. Relation-enriched BM25 candidate pool (reserves complete lineage pairs).
 *   2. Explicit-history router.
 *   3. History query  -> BM25 + pair boost for the selected lineage pair.
 *      Other queries  -> BM25 + recency preference.
 *
 * The frozen V7 parameters are constants on purpose: changing them means the
 * runtime no longer matches the evaluated method. The parity test replays the
 * sealed V7 run to guard this.
 */
import fs from 'node:fs';

export type GuidelineChunk = {
  chunk_id: string;
  document_id: string;
  source_file: string;
  family: string;
  document_role: string;
  published_year: number;
  pdf_page_number: number;
  text: string;
};

type RelationEndpoint = {
  source_ref?: {
    document_id?: string | null;
    recommendation_id?: string | number | null;
    pdf_page_number?: number | null;
  };
  chunk_id: string;
  chunk_ids?: string[];
};

export type GuidelineRelation = {
  candidate_id: string;
  lineage_id?: string;
  family?: string;
  relation_type?: string;
  relation_facets?: string[];
  older?: RelationEndpoint | null;
  current?: RelationEndpoint | null;
  relation_evidence?: { basis?: string };
  pairing_eligible?: boolean;
};

export type Candidate = {
  chunk_id: string;
  raw_bm25: number;
  chunk: GuidelineChunk;
  relation_retrieval_score?: number;
  relation_retrieval_id?: string | null;
};

export type SelectedPair = {
  candidate_id: string;
  chunk_ids: string[];
  raw_bm25_sum: number;
};

export type RankedCandidate = {
  chunk_id: string;
  candidate_rank: number;
  raw_bm25: number;
  base_norm: number;
  recency_norm: number;
  recency_component: number;
  pair_boost: number;
  router_explicit_history: boolean;
  final_score: number;
  final_rank: number;
  chunk: GuidelineChunk;
};

export const V7_FROZEN_POLICY = {
  candidatePoolSize: 20,
  reservePairs: 2,
  pairBoost: 0.5,
  recencyLambda: 0.75,
  corpusMinYear: 2005,
  corpusMaxYear: 2026,
  bm25K1: 1.2,
  bm25B: 0.75,
} as const;

const TOKEN_RE = /[a-z0-9]+/g;
const STOPWORDS = new Set(
  'what are the and for daily serving goals consuming recommendation intake limit limitations rule should with this that from about how many of is a in or to current historical historically was were which does do did it its'.split(' '),
);
const RELATION_STOPWORDS = new Set([
  ...STOPWORDS,
  ...'who earlier operative guidance document documents position positions previously stated state states compare compared changed change retained version specific differences reported report audit describe former formerly moving move governed relative across requirement requirements during says said update updates explicitly remarks rationale be their'.split(' '),
]);
const HISTORY_PATTERNS = [
  /\b2003\b/i,
  /\bhistorical(?:ly)?\b/i,
  /\bprevious(?:ly)?\b/i,
  /\bearlier\b/i,
  /\bformer(?:ly)?\b/i,
  /\bhow did\b.{0,100}\bchange\b/i,
  /\bfrom\b.{0,100}\bto (?:the )?current\b/i,
];

// Python sorts strings by code point; localeCompare would not match.
const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byScoreThenId = (a: { raw_bm25: number; chunk_id: string }, b: { raw_bm25: number; chunk_id: string }) =>
  b.raw_bm25 - a.raw_bm25 || compareIds(a.chunk_id, b.chunk_id);

export const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(TOKEN_RE) || []).filter((t) => t.length > 2 && !STOPWORDS.has(t));

export const relationTokenize = (text: string): string[] => {
  const ascii = text.normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
  const raw = (ascii.toLowerCase().match(TOKEN_RE) || [])
    .filter((t) => !RELATION_STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .map((t) => (t === 'no' || t === 'without' ? 'neg' : t));
  const bigrams = raw.slice(1).map((t, i) => `${raw[i]}_${t}`);
  return [...raw, ...bigrams];
};

export const explicitHistoryRouter = (query: string): boolean =>
  HISTORY_PATTERNS.some((pattern) => pattern.test(query));

type IndexedDoc = { chunk_id: string; text: string; published_year: number };

class BM25Index<T extends IndexedDoc> {
  private readonly tf = new Map<string, Map<string, number>>();
  private readonly length = new Map<string, number>();
  private readonly idf = new Map<string, number>();
  private readonly avgdl: number;

  constructor(
    private readonly docs: T[],
    private readonly tokenizerFn: (text: string) => string[] = tokenize,
    private readonly k1 = V7_FROZEN_POLICY.bm25K1,
    private readonly b = V7_FROZEN_POLICY.bm25B,
  ) {
    const df = new Map<string, number>();
    let totalLength = 0;
    for (const doc of docs) {
      const tokens = tokenizerFn(doc.text);
      const counts = new Map<string, number>();
      for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
      this.tf.set(doc.chunk_id, counts);
      this.length.set(doc.chunk_id, tokens.length);
      totalLength += tokens.length;
      for (const token of counts.keys()) df.set(token, (df.get(token) || 0) + 1);
    }
    this.avgdl = docs.length ? totalLength / docs.length : 0;
    const n = docs.length;
    for (const [term, count] of df) this.idf.set(term, Math.log((n - count + 0.5) / (count + 0.5) + 1));
  }

  candidates(query: string, topK: number): Array<{ chunk_id: string; raw_bm25: number; chunk: T }> {
    const terms = this.tokenizerFn(query);
    const out = this.docs.map((doc) => {
      const counts = this.tf.get(doc.chunk_id)!;
      const docLength = this.length.get(doc.chunk_id)!;
      let score = 0;
      for (const term of terms) {
        const tf = counts.get(term) || 0;
        if (!tf) continue;
        const den = tf + this.k1 * (1 - this.b + (this.b * docLength) / this.avgdl);
        score += ((this.idf.get(term) || 0) * tf * (this.k1 + 1)) / den;
      }
      return { chunk_id: doc.chunk_id, raw_bm25: score, chunk: doc };
    });
    return out.sort(byScoreThenId).slice(0, topK);
  }
}

const endpointChunkIds = (endpoint: RelationEndpoint): string[] => endpoint.chunk_ids ?? [endpoint.chunk_id];

/** Shared candidate generator that reserves complete graph-linked pairs. */
export class RelationEnrichedCandidateGenerator {
  private readonly passageIndex: BM25Index<GuidelineChunk>;
  private readonly relationIndex: BM25Index<IndexedDoc> | null;
  private readonly relations = new Map<string, GuidelineRelation>();
  private readonly descriptorTokens = new Map<string, Set<string>>();
  private readonly chunkCount: number;

  constructor(
    chunks: GuidelineChunk[],
    relations: GuidelineRelation[],
    private readonly reservePairs: number = V7_FROZEN_POLICY.reservePairs,
  ) {
    this.passageIndex = new BM25Index(chunks);
    this.chunkCount = chunks.length;
    const pseudo: IndexedDoc[] = [];
    for (const relation of relations) {
      if (!relation.pairing_eligible || !relation.older || !relation.current) continue;
      const rid = relation.candidate_id;
      this.relations.set(rid, relation);
      const identity = [
        rid,
        relation.lineage_id ?? '',
        relation.family ?? '',
        relation.relation_type ?? '',
        (relation.relation_facets ?? []).join(' '),
      ].join(' ');
      const basis = relation.relation_evidence?.basis ?? '';
      const pieces = [identity, identity, identity, identity, basis, basis, basis];
      for (const endpoint of [relation.older, relation.current]) {
        const source = endpoint.source_ref ?? {};
        pieces.push(`${source.document_id || ''} ${source.recommendation_id || ''}`);
      }
      pseudo.push({ chunk_id: rid, text: pieces.join('\n'), published_year: 0 });
      this.descriptorTokens.set(rid, new Set(relationTokenize(`${identity} ${basis}`)));
    }
    this.relationIndex = pseudo.length ? new BM25Index(pseudo, relationTokenize) : null;
  }

  candidates(query: string, topK: number = V7_FROZEN_POLICY.candidatePoolSize): Candidate[] {
    const full = this.passageIndex.candidates(query, this.chunkCount);
    const byId = new Map(full.map((item) => [item.chunk_id, item]));
    const queryTokens = new Set(relationTokenize(query));

    const relationHits = (this.relationIndex?.candidates(query, this.relations.size) ?? [])
      .map((hit) => {
        const descriptor = this.descriptorTokens.get(hit.chunk_id)!;
        let multiplier = 1;
        // Only penalize the explicit `not` lineage when the query lacks `not`.
        if (descriptor.has('not') && !queryTokens.has('not')) multiplier *= 0.65;
        else if (descriptor.has('not') && queryTokens.has('not')) multiplier *= 1.15;
        if (queryTokens.has('neg') && descriptor.has('neg')) multiplier *= 1.15;
        return { ...hit, raw_bm25: hit.raw_bm25 * multiplier };
      })
      .sort(byScoreThenId)
      .slice(0, this.reservePairs);

    const reserved = new Map<string, Candidate>();
    for (const hit of relationHits) {
      if (hit.raw_bm25 <= 0) continue;
      const relation = this.relations.get(hit.chunk_id)!;
      for (const endpoint of [relation.older!, relation.current!]) {
        const members = endpointChunkIds(endpoint)
          .map((cid) => byId.get(cid))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .sort(byScoreThenId);
        const chosen = members[0];
        if (!chosen) continue;
        const enriched: Candidate = {
          ...chosen,
          relation_retrieval_score: hit.raw_bm25,
          relation_retrieval_id: relation.candidate_id,
        };
        const prior = reserved.get(chosen.chunk_id);
        if (!prior || enriched.relation_retrieval_score! > prior.relation_retrieval_score!) {
          reserved.set(chosen.chunk_id, enriched);
        }
      }
    }

    const pool: Candidate[] = [...reserved.values()];
    for (const item of full) {
      if (pool.length >= topK) break;
      if (!reserved.has(item.chunk_id)) {
        pool.push({ ...item, relation_retrieval_score: 0, relation_retrieval_id: null });
      }
    }
    return pool.slice(0, topK);
  }
}

/** Select the strongest complete relation in the pool, without using gold labels. */
export const selectBestRelationPair = (
  candidates: Candidate[],
  relations: GuidelineRelation[],
): SelectedPair | null => {
  const pool = new Map(candidates.map((item) => [item.chunk_id, item]));
  const choices: Array<{ associated: number; signal: number; id: string; sides: Candidate[] }> = [];
  for (const relation of relations) {
    if (!relation.pairing_eligible || !relation.older || !relation.current) continue;
    const sides: Candidate[] = [];
    for (const endpoint of [relation.older, relation.current]) {
      const hits = endpointChunkIds(endpoint)
        .map((cid) => pool.get(cid))
        .filter((item): item is Candidate =>
          Boolean(item) && Math.max(item!.raw_bm25, item!.relation_retrieval_score ?? 0) > 0)
        .sort(byScoreThenId);
      if (!hits[0]) break;
      sides.push(hits[0]);
    }
    if (sides.length !== 2) continue;
    const associated = sides.every((item) => item.relation_retrieval_id === relation.candidate_id);
    // A relation retrieved by the relation index keeps its identity; passage
    // scores from a neighbouring recommendation must not hijack its endpoints.
    const signal = associated
      ? sides.reduce((sum, item) => sum + (item.relation_retrieval_score ?? 0), 0)
      : sides.reduce((sum, item) => sum + item.raw_bm25, 0);
    choices.push({ associated: associated ? 1 : 0, signal, id: relation.candidate_id, sides });
  }
  if (!choices.length) return null;
  choices.sort((a, b) => b.associated - a.associated || b.signal - a.signal || compareIds(a.id, b.id));
  const best = choices[0]!;
  return {
    candidate_id: best.id,
    chunk_ids: best.sides.map((item) => item.chunk_id),
    raw_bm25_sum: best.sides.reduce((sum, item) => sum + item.raw_bm25, 0),
  };
};

/** Rank the shared pool with the proposed system E. */
export const rankConditionalVersionAware = (
  query: string,
  candidates: Candidate[],
  relations: GuidelineRelation[],
): { ranked: RankedCandidate[]; selectedPair: SelectedPair | null; routerExplicitHistory: boolean } => {
  const triggered = explicitHistoryRouter(query);
  if (!candidates.length) return { ranked: [], selectedPair: null, routerExplicitHistory: triggered };
  const { pairBoost, recencyLambda, corpusMinYear, corpusMaxYear } = V7_FROZEN_POLICY;
  const scores = candidates.map((item) => item.raw_bm25);
  const minBase = Math.min(...scores);
  const baseRange = Math.max(...scores) - minBase;
  const yearRange = corpusMaxYear - corpusMinYear;
  const selectedPair = selectBestRelationPair(candidates, relations);
  const pairIds = new Set(selectedPair?.chunk_ids ?? []);

  const rows = candidates.map((item, index) => {
    const baseNorm = baseRange ? (item.raw_bm25 - minBase) / baseRange : 0;
    const recencyNorm = yearRange ? (item.chunk.published_year - corpusMinYear) / yearRange : 0;
    const pairComponent = pairIds.has(item.chunk_id) ? pairBoost : 0;
    return {
      chunk_id: item.chunk_id,
      candidate_rank: index + 1,
      raw_bm25: item.raw_bm25,
      base_norm: baseNorm,
      recency_norm: recencyNorm,
      recency_component: recencyLambda * recencyNorm,
      pair_boost: pairComponent,
      router_explicit_history: triggered,
      final_score: triggered ? baseNorm + pairComponent : baseNorm + recencyLambda * recencyNorm,
      final_rank: 0,
      chunk: item.chunk,
    };
  });
  rows.sort((a, b) => b.final_score - a.final_score || compareIds(a.chunk_id, b.chunk_id));
  rows.forEach((row, index) => {
    row.final_rank = index + 1;
  });
  return { ranked: rows, selectedPair, routerExplicitHistory: triggered };
};

const readJsonl = <T>(filePath: string): T[] =>
  fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);

export type VersionAwareRetriever = {
  chunks: Map<string, GuidelineChunk>;
  relations: GuidelineRelation[];
  generator: RelationEnrichedCandidateGenerator;
};

export const buildVersionAwareRetriever = (
  chunks: GuidelineChunk[],
  relations: GuidelineRelation[],
): VersionAwareRetriever => ({
  chunks: new Map(chunks.map((chunk) => [chunk.chunk_id, chunk])),
  relations,
  generator: new RelationEnrichedCandidateGenerator(chunks, relations),
});

const retrieverCache = new Map<string, VersionAwareRetriever>();

export const loadVersionAwareRetriever = (chunksFile: string, relationsFile: string): VersionAwareRetriever => {
  const key = `${chunksFile}\n${relationsFile}`;
  const cached = retrieverCache.get(key);
  if (cached) return cached;
  const retriever = buildVersionAwareRetriever(readJsonl(chunksFile), readJsonl(relationsFile));
  retrieverCache.set(key, retriever);
  return retriever;
};

type RelationLink = {
  relation_id: string;
  relation_type: string | null;
  basis: string | null;
  other_chunk_id: string;
  other_document_id: string | null;
  other_published_year: number | null;
};

export type VersionAwareHit = {
  rank: number;
  chunk_id: string;
  document_id: string;
  source_file: string;
  family: string;
  document_role: string;
  published_year: number;
  pdf_page_number: number;
  score: number;
  snippet: string;
  in_selected_history_pair: boolean;
  appended_pair_mate: boolean;
  newer_version?: RelationLink;
  older_version?: RelationLink;
};

export type VersionAwareSearchResult = {
  query: string;
  method: string;
  router_explicit_history: boolean;
  selected_history_pair: SelectedPair | null;
  total_hits: number;
  hits: VersionAwareHit[];
};

const toLink = (
  relation: GuidelineRelation,
  other: RelationEndpoint,
  chunks: Map<string, GuidelineChunk>,
): RelationLink => {
  const otherChunk = chunks.get(other.chunk_id);
  return {
    relation_id: relation.candidate_id,
    relation_type: relation.relation_type ?? null,
    basis: relation.relation_evidence?.basis ?? null,
    other_chunk_id: other.chunk_id,
    other_document_id: other.source_ref?.document_id ?? otherChunk?.document_id ?? null,
    other_published_year: otherChunk?.published_year ?? null,
  };
};

/** Run system E and attach cross-version metadata so the model can flag outdated evidence. */
export const searchVersionedGuidelines = (
  retriever: VersionAwareRetriever,
  query: string,
  topK: number,
  snippetChars = 600,
): VersionAwareSearchResult => {
  const candidates = retriever.generator.candidates(query, V7_FROZEN_POLICY.candidatePoolSize);
  const { ranked, selectedPair, routerExplicitHistory } = rankConditionalVersionAware(
    query,
    candidates,
    retriever.relations,
  );
  const pairIds = new Set(routerExplicitHistory ? selectedPair?.chunk_ids ?? [] : []);

  const rows = ranked.filter((row) => row.raw_bm25 > 0 || pairIds.has(row.chunk_id)).slice(0, topK);
  // Runtime-only step (not part of evaluated system E): a history answer needs
  // both editions, so a pair endpoint ranked below top_k is appended, flagged.
  const appended = new Set<string>();
  for (const chunkId of pairIds) {
    if (rows.some((row) => row.chunk_id === chunkId)) continue;
    const row = ranked.find((item) => item.chunk_id === chunkId);
    if (row) {
      rows.push(row);
      appended.add(chunkId);
    }
  }

  const hits = rows
    .map((row): VersionAwareHit => {
      const hit: VersionAwareHit = {
        rank: row.final_rank,
        chunk_id: row.chunk_id,
        document_id: row.chunk.document_id,
        source_file: row.chunk.source_file,
        family: row.chunk.family,
        document_role: row.chunk.document_role,
        published_year: row.chunk.published_year,
        pdf_page_number: row.chunk.pdf_page_number,
        score: Number(row.final_score.toFixed(4)),
        snippet: row.chunk.text.replace(/\s+/g, ' ').trim().slice(0, snippetChars),
        in_selected_history_pair: pairIds.has(row.chunk_id),
        appended_pair_mate: appended.has(row.chunk_id),
      };
      for (const relation of retriever.relations) {
        if (!relation.older || !relation.current) continue;
        if (!hit.newer_version && endpointChunkIds(relation.older).includes(row.chunk_id)) {
          hit.newer_version = toLink(relation, relation.current, retriever.chunks);
        }
        if (!hit.older_version && endpointChunkIds(relation.current).includes(row.chunk_id)) {
          hit.older_version = toLink(relation, relation.older, retriever.chunks);
        }
      }
      return hit;
    });

  return {
    query,
    method: 'v7_conditional_version_aware_system_e',
    router_explicit_history: routerExplicitHistory,
    selected_history_pair: routerExplicitHistory ? selectedPair : null,
    total_hits: hits.length,
    hits,
  };
};
