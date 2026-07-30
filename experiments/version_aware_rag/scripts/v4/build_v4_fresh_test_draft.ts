import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const INVENTORY = path.join(EXP, 'data/annotations_v4/candidate_relation_pairs_v4.jsonl');
const CORPUS = path.join(EXP, 'data/corpus_v4_fresh_frozen/chunks.jsonl');
const FREEZE_DIR = path.join(EXP, 'data/configs/v4_fresh_test_frozen');
const OUT = path.join(EXP, 'data/annotations_v4/fresh_test_draft');
const REPORT = path.join(EXP, 'results/v4/fresh_test_construction');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const conditionalQuestions: Record<string, string> = {
  'cand-pair-v4-new-041': 'How does the 2025–2030 full-fat dairy guidance for children aged 5–10 differ from or qualify the dairy pattern described in the 2020 guideline?',
  'cand-pair-v4-new-042': 'How do the 2020 added-sugar baseline and the 2025–2030 grain- and dairy-snack limits need to be combined when evaluating an FDA Healthy claim?',
  'cand-pair-v4-new-043': 'How does the 2025–2030 advice for groups that should avoid alcohol qualify the earlier 2020 moderation framework?',
  'cand-pair-v4-new-044': 'How should the 2020 general sodium guidance be combined with the 2025–2030 age-specific sodium limits for children aged 1–3, 4–8, and 9–13?',
  'cand-pair-v4-new-045': 'How does the 2025–2030 timing and method for introducing peanut-containing foods to infants with severe eczema or egg allergy qualify the broader 2020 infant-feeding guidance?',
  'cand-pair-v4-new-046': 'Using the 2020 life-stage nutrition context and the 2025–2030 update, why do adolescent girls have heightened iron and calcium requirements?',
  'cand-pair-v4-new-047': 'How do the 2020 pregnancy nutrition baseline and the 2025–2030 update combine to identify priority nutrients for pregnant women?',
  'cand-pair-v4-new-048': 'How do the 2020 lactation nutrition baseline and the 2025–2030 update combine to identify nutrient-dense foods supporting milk production?',
  'cand-pair-v4-new-049': 'How does the 2025–2030 advice for older adults with lower caloric needs qualify the broader life-stage nutrition guidance retained from 2020?',
  'cand-pair-v4-new-050': 'How does the 2025–2030 dietary option for people with type 2 diabetes or obesity qualify the broader healthy-diet framework retained from 2020?',
  'cand-pair-v4-new-051': 'How do the retained general seafood recommendations and the 2025–2030 low-mercury omega-3 guidance combine for pregnant women?',
  'cand-pair-v4-new-052': 'How does the 2025–2030 exception for highly active people qualify the retained general 2,300 mg daily sodium cap?',
  'cand-pair-v4-new-053': 'How do the retained healthy-eating pattern and the 2025–2030 targeted supplementation advice combine for pure vegans versus general vegetarians?',
  'cand-pair-v4-new-056': 'How does the 2025–2030 alcohol-avoidance guidance for people taking specific medications extend the retained avoidance guidance for pregnancy?',
  'cand-pair-v4-new-058': 'How do the retained daily added-sugar baseline and the 2025–2030 per-snack limit combine for dairy snacks such as yogurt?',
  'cand-pair-v4-new-059': 'How do the retained daily added-sugar baseline and the 2025–2030 per-snack limit combine for grain snacks such as crackers?',
  'cand-pair-v4-new-060': 'How do the retained healthy vegetarian pattern and the 2025–2030 micronutrient-monitoring advice combine for vegetarian or vegan diets?',
};
const selectedPairIds: Record<string, string[]> = {
  current_only: Array.from({ length: 10 }, (_, index) => `cand-pair-v4-new-${String(index + 1).padStart(3, '0')}`),
  conditional_merge: ['cand-pair-v4-new-041', 'cand-pair-v4-new-042', 'cand-pair-v4-new-043', 'cand-pair-v4-new-044', 'cand-pair-v4-new-051', 'cand-pair-v4-new-052', 'cand-pair-v4-new-053', 'cand-pair-v4-new-058', 'cand-pair-v4-new-059', 'cand-pair-v4-new-060'],
  compatible_history: ['cand-pair-v4-new-021', 'cand-pair-v4-new-022', 'cand-pair-v4-new-023', 'cand-pair-v4-new-024', 'cand-pair-v4-new-032', 'cand-pair-v4-new-033', 'cand-pair-v4-new-035', 'cand-pair-v4-new-036', 'cand-pair-v4-new-038', 'cand-pair-v4-new-040'],
  hard_negative: ['cand-pair-v4-new-061', 'cand-pair-v4-new-062', 'cand-pair-v4-new-063', 'cand-pair-v4-new-064', 'cand-pair-v4-new-065', 'cand-pair-v4-new-066', 'cand-pair-v4-new-068', 'cand-pair-v4-new-069', 'cand-pair-v4-new-075', 'cand-pair-v4-new-078'],
};

const [inventoryText, corpusText, packageText, guardText] = await Promise.all([
  readFile(INVENTORY, 'utf8'), readFile(CORPUS, 'utf8'),
  readFile(path.join(FREEZE_DIR, 'FROZEN_FRESH_TEST_PACKAGE.json'), 'utf8'),
  readFile(path.join(FREEZE_DIR, 'FRESH_TEST_GUARD.json'), 'utf8'),
]);
const frozen = JSON.parse(packageText), guard = JSON.parse(guardText);
if (sha256(packageText) !== guard.frozen_package_sha256 || !['fresh_source_corpus_and_design_amendment_frozen', 'fresh_test_semantic_revision_unlocked'].includes(guard.status)) throw new Error('Fresh-test freeze guard failed.');
if (sha256(inventoryText) !== frozen.input_checksums.candidate_inventory.sha256) throw new Error('Candidate inventory changed after freeze.');
if (sha256(corpusText) !== guard.source_corpus_chunks_sha256) throw new Error('Frozen fresh source corpus changed.');
if (![0, 1].includes(guard.test_inventory_read_count) || guard.final_test_created) throw new Error('Fresh-test inventory state is invalid.');
const chunks = new Map(parseJsonl(corpusText).map((row) => [row.chunk_id, row]));
const candidates = parseJsonl(inventoryText).filter((row) => row.origin === 'v4_new').sort((a, b) => a.candidate_pair_id.localeCompare(b.candidate_pair_id));
const strata = ['current_only', 'conditional_merge', 'compatible_history', 'hard_negative'];
const selected: any[] = [];
const selectedTextSignatures = new Set<string>();
const skippedDuplicatePairs: string[] = [];
for (const stratum of strata) {
  const used = new Set<string>();
  for (const pair of candidates) {
    if (!selectedPairIds[stratum].includes(pair.candidate_pair_id)) continue;
    const intent = pair.supported_query_intents.find((item: any) => item.stratum === stratum && item.is_test_eligible);
    if (!intent || used.has(intent.leakage_group_id) || used.size >= 10) continue;
    const requiresBoth = stratum === 'conditional_merge' || stratum === 'compatible_history';
    const evidenceIds = requiresBoth ? [`v4fresh-${pair.candidate_pair_id}-new`, `v4fresh-${pair.candidate_pair_id}-old`] : [`v4fresh-${pair.candidate_pair_id}-new`];
    const textSignature = sha256(evidenceIds.map((id) => chunks.get(id).text.replace(/\s+/g, ' ').trim()).sort().join('\0'));
    if (selectedTextSignatures.has(textSignature)) { skippedDuplicatePairs.push(`${stratum}:${pair.candidate_pair_id}`); continue; }
    used.add(intent.leakage_group_id);
    selectedTextSignatures.add(textSignature);
    selected.push({ pair, intent });
  }
  if (used.size !== 10) throw new Error(`${stratum}: expected ten unique leakage groups, found ${used.size}; skipped ${skippedDuplicatePairs.join(', ')}.`);
}
const records = selected.map(({ pair, intent }, index) => {
  const oldChunkId = `v4fresh-${pair.candidate_pair_id}-old`, newChunkId = `v4fresh-${pair.candidate_pair_id}-new`;
  const oldChunk = chunks.get(oldChunkId), newChunk = chunks.get(newChunkId);
  if (!oldChunk || !newChunk) throw new Error(`${pair.candidate_pair_id}: missing evidence chunk.`);
  const requiresBoth = intent.stratum === 'conditional_merge' || intent.stratum === 'compatible_history';
  const question = intent.stratum === 'conditional_merge' ? conditionalQuestions[pair.candidate_pair_id] : intent.question_intent;
  return {
    query_id: `v4fresh-${String(index + 1).padStart(3, '0')}`,
    split: 'fresh_test', stratum: intent.stratum, candidate_pair_id: pair.candidate_pair_id,
    lineage_group_id: intent.leakage_group_id, query_text: question,
    target_population: pair.target_population, conditions: pair.conditions,
    judgment: {
      required_chunk_ids: requiresBoth ? [newChunkId, oldChunkId] : [newChunkId],
      compatible_chunk_ids: requiresBoth ? [oldChunkId] : [],
      preferred_chunk_ids: [newChunkId],
      deprecated_chunk_ids: pair.candidate_policy_label === 'deprecated' ? [oldChunkId] : [],
      forbidden_chunk_ids: intent.stratum === 'hard_negative' ? [oldChunkId] : [],
      citation_safe_chunk_ids: requiresBoth ? [newChunkId, oldChunkId] : [newChunkId],
    },
    required_current_chunk_ids: [newChunkId],
    required_retained_chunk_ids: requiresBoth ? [oldChunkId] : [],
    oracle_relation: { relation_type: pair.candidate_relation_type, current_chunk_id: newChunkId, retained_chunk_id: oldChunkId },
    draft_rationale: intent.rationale,
    source_inventory_sha256: sha256(inventoryText), freeze_package_sha256: guard.frozen_package_sha256,
    review_status: 'needs_project_owner_review', retrieval_executed: false,
  };
});
const signatures = new Set(records.map((row) => JSON.stringify([...row.judgment.required_chunk_ids].sort())));
const groups = new Set(records.map((row) => row.lineage_group_id));
const normalizedTextSignatures = new Set(records.map((row) => sha256(row.judgment.required_chunk_ids.map((id: string) => chunks.get(id).text.replace(/\s+/g, ' ').trim()).sort().join('\0'))));
if (records.length !== 40 || signatures.size !== 40 || groups.size !== 40 || normalizedTextSignatures.size !== 40) {
  const seen = new Map<string, string>(), duplicates: string[] = [];
  for (const row of records) {
    const signature = sha256(row.judgment.required_chunk_ids.map((id: string) => chunks.get(id).text.replace(/\s+/g, ' ').trim()).sort().join('\0'));
    if (seen.has(signature)) duplicates.push(`${row.candidate_pair_id} duplicates ${seen.get(signature)}`); else seen.set(signature, row.candidate_pair_id);
  }
  throw new Error(`Fresh test uniqueness failed: ${records.length}/${signatures.size}/${groups.size}/${normalizedTextSignatures.size}; ${duplicates.join('; ')}`);
}
const ledgerText = records.map((row) => JSON.stringify(row)).join('\n') + '\n';
const sections = records.map((row) => {
  const current = chunks.get(row.required_current_chunk_ids[0]), retained = row.required_retained_chunk_ids[0] ? chunks.get(row.required_retained_chunk_ids[0]) : null;
  return `## ${row.query_id} — ${row.stratum}\n\n**Question:** ${row.query_text}\n\n- Lineage: \`${row.lineage_group_id}\`\n- Required current: \`${row.required_current_chunk_ids.join(', ') || 'none'}\`\n- Required retained: \`${row.required_retained_chunk_ids.join(', ') || 'none'}\`\n- Deprecated: \`${row.judgment.deprecated_chunk_ids.join(', ') || 'none'}\`\n- Forbidden: \`${row.judgment.forbidden_chunk_ids.join(', ') || 'none'}\`\n\n**Current excerpt**\n\n> ${current.text.replace(/\s+/g, ' ').slice(0, 1200)}\n\n${retained ? `**Retained excerpt**\n\n> ${retained.text.replace(/\s+/g, ' ').slice(0, 1200)}\n` : ''}`;
}).join('\n\n');
const manifest = { status: 'fresh_test_draft_needs_project_owner_review', record_count: records.length, strata: Object.fromEntries(strata.map((stratum) => [stratum, records.filter((row) => row.stratum === stratum).length])), unique_lineage_groups: groups.size, unique_required_signatures: signatures.size, unique_normalized_required_text_signatures: normalizedTextSignatures.size, source_inventory_sha256: sha256(inventoryText), frozen_source_corpus_sha256: sha256(corpusText), frozen_package_sha256: guard.frozen_package_sha256, source_corpus_addendum_sha256: guard.source_corpus_addendum_sha256, draft_ledger_sha256: sha256(ledgerText), retrieval_execution_count: 0 };
await mkdir(OUT, { recursive: true }); await mkdir(REPORT, { recursive: true });
await writeFile(path.join(OUT, 'fresh_test_ledger.jsonl'), ledgerText, 'utf8');
await writeFile(path.join(OUT, 'fresh_test_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(REPORT, 'FRESH_TEST_REVIEW_PACKET.md'), `# V4 Fresh-Test Review Packet\n\nForty records selected after the frozen package. No retrieval has been executed. Review query wording and every required/deprecated/forbidden judgment.\n\n${sections}\n`, 'utf8');
await writeFile(path.join(FREEZE_DIR, 'FRESH_TEST_GUARD.json'), `${JSON.stringify({ ...guard, status: 'fresh_test_draft_created_review_required', test_inventory_read_count: 1, final_test_created: false, draft_ledger_sha256: sha256(ledgerText) }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
