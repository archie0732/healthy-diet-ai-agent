import * as fs from 'fs';
import * as path from 'path';
import {
  EvaluationQuery, EvaluationQuerySchema,
  QueryJudgment, QueryJudgmentSchema,
  RelationPair, RelationPairSchema,
  RelationAnnotation, RelationAnnotationSchema
} from './schema';

export interface ValidationError {
  type: string;
  id: string;
  message: string;
}

export function validateAnnotations(
  chunksJsonlPath: string,
  queriesJsonlPath: string,
  judgmentsJsonlPath: string,
  relationPairsJsonlPath: string,
  relationsJsonlPath: string,
  splitsDir?: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Load Corpus Chunks
  if (!fs.existsSync(chunksJsonlPath)) {
    errors.push({ type: 'Corpus', id: 'all', message: `Corpus chunks file not found: ${chunksJsonlPath}` });
    return errors;
  }
  const chunkLines = fs.readFileSync(chunksJsonlPath, 'utf8').split('\n').filter(Boolean);
  const chunkIds = new Set<string>();
  const chunkToLineage = new Map<string, string>();
  
  for (const line of chunkLines) {
    try {
      const chunk = JSON.parse(line);
      chunkIds.add(chunk.chunk_id);
      if (chunk.lineage_id) {
        chunkToLineage.set(chunk.chunk_id, chunk.lineage_id);
      }
    } catch (e) {
      errors.push({ type: 'Corpus', id: 'syntax', message: `Invalid JSON line in corpus chunks: ${line}` });
    }
  }

  // 2. Load and validate queries
  const queries: EvaluationQuery[] = [];
  const queryIds = new Set<string>();
  if (fs.existsSync(queriesJsonlPath)) {
    const lines = fs.readFileSync(queriesJsonlPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const parsed = EvaluationQuerySchema.safeParse(obj);
        if (!parsed.success) {
          errors.push({ type: 'QuerySchema', id: obj.query_id || 'unknown', message: parsed.error.message });
          continue;
        }
        const query = parsed.data;
        if (queryIds.has(query.query_id)) {
          errors.push({ type: 'Query', id: query.query_id, message: `Duplicate query ID: ${query.query_id}` });
        }
        queryIds.add(query.query_id);
        queries.push(query);
      } catch (e) {
        errors.push({ type: 'Query', id: 'syntax', message: `Invalid JSON line in queries: ${line}` });
      }
    }
  } else {
    errors.push({ type: 'QueriesFile', id: 'all', message: `Queries file not found: ${queriesJsonlPath}` });
  }

  // 3. Load and validate judgments
  const judgments: QueryJudgment[] = [];
  const judgmentQueryIds = new Set<string>();
  if (fs.existsSync(judgmentsJsonlPath)) {
    const lines = fs.readFileSync(judgmentsJsonlPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const parsed = QueryJudgmentSchema.safeParse(obj);
        if (!parsed.success) {
          errors.push({ type: 'JudgmentSchema', id: obj.query_id || 'unknown', message: parsed.error.message });
          continue;
        }
        const j = parsed.data;
        if (judgmentQueryIds.has(j.query_id)) {
          errors.push({ type: 'Judgment', id: j.query_id, message: `Duplicate judgment for query ID: ${j.query_id}` });
        }
        judgmentQueryIds.add(j.query_id);
        judgments.push(j);

        // Constraint check: required doesn't overlap with deprecated/forbidden
        const reqSet = new Set(j.required_chunk_ids);
        const depSet = new Set(j.deprecated_chunk_ids);
        const forbSet = new Set(j.forbidden_chunk_ids);
        const compSet = new Set(j.compatible_chunk_ids);
        const prefSet = new Set(j.preferred_chunk_ids);
        const safeSet = new Set(j.citation_safe_chunk_ids);

        // Check ID existence
        const allIds = [...reqSet, ...depSet, ...forbSet, ...compSet, ...prefSet, ...safeSet];
        for (const cid of allIds) {
          if (!chunkIds.has(cid)) {
            errors.push({ type: 'Judgment', id: j.query_id, message: `Chunk ID "${cid}" does not exist in corpus.` });
          }
        }

        // Check required overlaps with deprecated or forbidden
        for (const cid of j.required_chunk_ids) {
          if (depSet.has(cid)) {
            errors.push({ type: 'Judgment', id: j.query_id, message: `Chunk "${cid}" is marked as both required and deprecated.` });
          }
          if (forbSet.has(cid)) {
            errors.push({ type: 'Judgment', id: j.query_id, message: `Chunk "${cid}" is marked as both required and forbidden.` });
          }
        }

        // Preferred must be subset of required or compatible
        for (const cid of j.preferred_chunk_ids) {
          if (!reqSet.has(cid) && !compSet.has(cid)) {
            errors.push({ type: 'Judgment', id: j.query_id, message: `Preferred chunk "${cid}" must be in required or compatible sets.` });
          }
        }
      } catch (e) {
        errors.push({ type: 'Judgment', id: 'syntax', message: `Invalid JSON line in judgments: ${line}` });
      }
    }
  }

  // Cross-validation of queries and judgments
  const queryMap = new Map<string, EvaluationQuery>();
  for (const q of queries) {
    queryMap.set(q.query_id, q);
  }

  for (const j of judgments) {
    const q = queryMap.get(j.query_id);
    if (!q) {
      errors.push({ type: 'CrossCheck', id: j.query_id, message: `Judgment exists for query "${j.query_id}", but query does not exist.` });
      continue;
    }

    // Stratum-specific validation
    if (q.stratum === 'conditional_merge') {
      // Must have at least two required chunks or a custom rationale
      if (j.required_chunk_ids.length < 2 && (!j.rationale || j.rationale.length < 10)) {
        errors.push({ type: 'StratumCheck', id: j.query_id, message: `Conditional merge query must have at least 2 required chunks or detailed rationale.` });
      }
    }

    if (q.stratum === 'current_only') {
      // Current-only must not have any deprecated chunk marked as citation-safe
      for (const cid of j.deprecated_chunk_ids) {
        if (j.citation_safe_chunk_ids.includes(cid)) {
          errors.push({ type: 'StratumCheck', id: j.query_id, message: `Current-only query cannot have deprecated chunk "${cid}" marked as citation-safe.` });
        }
      }
    }
  }

  // 4. Load and validate relation pairs
  const pairIds = new Set<string>();
  const pairs: RelationPair[] = [];
  if (fs.existsSync(relationPairsJsonlPath)) {
    const lines = fs.readFileSync(relationPairsJsonlPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const parsed = RelationPairSchema.safeParse(obj);
        if (!parsed.success) {
          errors.push({ type: 'PairSchema', id: obj.pair_id || 'unknown', message: parsed.error.message });
          continue;
        }
        const pair = parsed.data;
        if (pairIds.has(pair.pair_id)) {
          errors.push({ type: 'RelationPair', id: pair.pair_id, message: `Duplicate pair ID: ${pair.pair_id}` });
        }
        pairIds.add(pair.pair_id);
        pairs.push(pair);

        // Check chunks exist
        if (!chunkIds.has(pair.old_chunk_id)) {
          errors.push({ type: 'RelationPair', id: pair.pair_id, message: `Old chunk ID "${pair.old_chunk_id}" does not exist in corpus.` });
        }
        if (!chunkIds.has(pair.new_chunk_id)) {
          errors.push({ type: 'RelationPair', id: pair.pair_id, message: `New chunk ID "${pair.new_chunk_id}" does not exist in corpus.` });
        }
      } catch (e) {
        errors.push({ type: 'RelationPair', id: 'syntax', message: `Invalid JSON line in relation pairs: ${line}` });
      }
    }
  }

  // 5. Load splits and verify isolation
  if (splitsDir && fs.existsSync(splitsDir)) {
    try {
      const devPath = path.join(splitsDir, 'development.json');
      const valPath = path.join(splitsDir, 'validation.json');
      const testPath = path.join(splitsDir, 'test.json');

      if (fs.existsSync(devPath) && fs.existsSync(valPath) && fs.existsSync(testPath)) {
        const dev = JSON.parse(fs.readFileSync(devPath, 'utf-8'));
        const val = JSON.parse(fs.readFileSync(valPath, 'utf-8'));
        const test = JSON.parse(fs.readFileSync(testPath, 'utf-8'));

        const devQueries = new Set<string>(dev.queries || []);
        const valQueries = new Set<string>(val.queries || []);
        const testQueries = new Set<string>(test.queries || []);

        // Intersection checks
        for (const q of devQueries) {
          if (valQueries.has(q)) errors.push({ type: 'SplitLeakage', id: q, message: `Query exists in both development and validation.` });
          if (testQueries.has(q)) errors.push({ type: 'SplitLeakage', id: q, message: `Query exists in both development and test.` });
        }
        for (const q of valQueries) {
          if (testQueries.has(q)) errors.push({ type: 'SplitLeakage', id: q, message: `Query exists in both validation and test.` });
        }

        // Lineage leakage checking:
        // We find all chunk lineages in dev, val, test, and ensure they do not overlap
        const devLineages = new Set<string>();
        const valLineages = new Set<string>();
        const testLineages = new Set<string>();

        // We map each query to its lineages from the chunks in its judgments
        const queryToLineages = new Map<string, Set<string>>();
        for (const j of judgments) {
          const lset = new Set<string>();
          const allChunks = [...j.required_chunk_ids, ...j.compatible_chunk_ids, ...j.deprecated_chunk_ids];
          for (const cid of allChunks) {
            const lin = chunkToLineage.get(cid);
            if (lin) {
              lset.add(lin);
            }
          }
          queryToLineages.set(j.query_id, lset);
        }

        for (const q of devQueries) {
          queryToLineages.get(q)?.forEach(l => devLineages.add(l));
        }
        for (const q of valQueries) {
          queryToLineages.get(q)?.forEach(l => valLineages.add(l));
        }
        for (const q of testQueries) {
          queryToLineages.get(q)?.forEach(l => testLineages.add(l));
        }

        // Check lineage intersections
        for (const lin of devLineages) {
          if (testLineages.has(lin)) {
            errors.push({ type: 'LineageLeakage', id: lin, message: `Lineage "${lin}" is shared between development and test splits. This violates split isolation.` });
          }
        }
        for (const lin of valLineages) {
          if (testLineages.has(lin)) {
            errors.push({ type: 'LineageLeakage', id: lin, message: `Lineage "${lin}" is shared between validation and test splits.` });
          }
        }
      }
    } catch (e: any) {
      errors.push({ type: 'SplitValidation', id: 'all', message: `Failed to parse or validate splits: ${e.message}` });
    }
  }

  // 6. Dataset volume and stratum distribution checks
  if (queries.length < 40) {
    errors.push({ type: 'DatasetVolume', id: 'queries', message: `Total queries count ${queries.length} is below the minimum required limit of 40.` });
  }

  const stratumCounts: Record<string, number> = {
    current_only: 0,
    compatible_history: 0,
    conditional_merge: 0,
    newer_irrelevant: 0
  };
  for (const q of queries) {
    if (q.stratum in stratumCounts) {
      stratumCounts[q.stratum]++;
    }
  }
  for (const [stratum, count] of Object.entries(stratumCounts)) {
    if (count < 8) {
      errors.push({
        type: 'StratumCount',
        id: stratum,
        message: `Stratum "${stratum}" only has ${count} queries, which is below the minimum required limit of 8.`
      });
    }
  }

  // 7. Load and validate relation annotations
  const relations: RelationAnnotation[] = [];
  if (fs.existsSync(relationsJsonlPath)) {
    const lines = fs.readFileSync(relationsJsonlPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const parsed = RelationAnnotationSchema.safeParse(obj);
        if (!parsed.success) {
          errors.push({ type: 'RelationSchema', id: obj.pair_id || 'unknown', message: parsed.error.message });
          continue;
        }
        const rel = parsed.data;
        if (!pairIds.has(rel.pair_id)) {
          errors.push({ type: 'Relation', id: rel.pair_id, message: `Relation annotation maps to non-existent pair ID: ${rel.pair_id}` });
        }
        relations.push(rel);
      } catch (e) {
        errors.push({ type: 'Relation', id: 'syntax', message: `Invalid JSON line in relations: ${line}` });
      }
    }
  }

  if (pairs.length < 50) {
    errors.push({ type: 'DatasetVolume', id: 'relation_pairs', message: `Total relation pairs count ${pairs.length} is below the minimum required limit of 50.` });
  }

  const typeCounts: Record<string, number> = {
    duplicate: 0,
    superseded: 0,
    conflicting: 0,
    conditional_difference: 0,
    complementary: 0
  };
  for (const rel of relations) {
    if (rel.relation_type in typeCounts) {
      typeCounts[rel.relation_type]++;
    }
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count < 3) {
      errors.push({
        type: 'RelationTypeCount',
        id: type,
        message: `Relation type "${type}" only has ${count} instances, which is below the minimum required limit of 3.`
      });
    }
  }

  return errors;
}
