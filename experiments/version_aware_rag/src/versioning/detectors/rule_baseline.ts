import { RelationDetector } from './types';
import { CorpusChunk } from '../../corpus/types';
import { RelationType } from '../types';

export class RuleBaselineDetector implements RelationDetector {
  public async classify(input: {
    oldChunk: CorpusChunk;
    newChunk: CorpusChunk;
  }): Promise<{
    relationType: RelationType;
    confidence: number;
    rationale: string;
    modelInfo: Record<string, string | number>;
  }> {
    const oldText = input.oldChunk.text.toLowerCase();
    const newText = input.newChunk.text.toLowerCase();

    const getWords = (t: string) => new Set(t.split(/\W+/).filter(w => w.length > 2));
    const oldWords = getWords(oldText);
    const newWords = getWords(newText);
    const union = new Set([...oldWords, ...newWords]);
    let inter = 0;
    for (const w of oldWords) {
      if (newWords.has(w)) inter++;
    }
    const jaccard = union.size > 0 ? inter / union.size : 0;

    if (jaccard > 0.9) {
      return {
        relationType: 'duplicate',
        confidence: 0.95,
        rationale: `Highly similar word overlap (Jaccard=${jaccard.toFixed(2)}).`,
        modelInfo: { detector: 'rule_baseline' }
      };
    }

    const activeKeywords = ['active', 'athletes', 'sweat', 'highly active', 'exercise'];
    const oldHasActive = activeKeywords.some(k => oldText.includes(k));
    const newHasActive = activeKeywords.some(k => newText.includes(k));
    if (newHasActive !== oldHasActive) {
      return {
        relationType: 'conditional_difference',
        confidence: 0.85,
        rationale: 'Guideline introduces conditional population tags not present in the other version.',
        modelInfo: { detector: 'rule_baseline' }
      };
    }

    const numRegex = /\b(\d+(?:\.\d+)?)\s*(%|g|mg|grams|milligrams|servings|serving|cups|cup|drinks|drink)\b/g;
    const oldNumbers = Array.from(oldText.matchAll(numRegex)).map(m => `${m[1]}${m[2]}`);
    const newNumbers = Array.from(newText.matchAll(numRegex)).map(m => `${m[1]}${m[2]}`);

    const sharedTopics = (input.oldChunk.topic_ids || []).filter(t => (input.newChunk.topic_ids || []).includes(t));
    if (sharedTopics.length > 0) {
      const diffNumbers = oldNumbers.some(n => !newNumbers.includes(n)) || newNumbers.some(n => !oldNumbers.includes(n));
      if (diffNumbers) {
        return {
          relationType: 'superseded',
          confidence: 0.8,
          rationale: `Numerical claims modified in shared topic context: [${oldNumbers.join(', ')}] -> [${newNumbers.join(', ')}].`,
          modelInfo: { detector: 'rule_baseline' }
        };
      }
    }

    return {
      relationType: 'complementary',
      confidence: 0.7,
      rationale: 'No strong conflict or duplication detected; guidelines assumed compatible.',
      modelInfo: { detector: 'rule_baseline' }
    };
  }
}
