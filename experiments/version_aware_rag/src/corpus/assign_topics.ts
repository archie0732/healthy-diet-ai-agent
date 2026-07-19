export interface ExtractedMetadata {
  topic_ids: string[];
  lineage_id: string | null;
  population_tags: string[];
  condition_tags: string[];
  numeric_claims: string[];
}

const TOPIC_KEYWORDS: { id: string; keywords: string[] }[] = [
  { id: 'lineage-dairy', keywords: ['dairy', 'milk'] },
  { id: 'lineage-protein', keywords: ['protein', 'meat', 'egg'] },
  { id: 'lineage-sugars', keywords: ['added sugar', 'sugars'] },
  { id: 'lineage-sweeteners', keywords: ['sweetener', 'aspartame'] },
  { id: 'lineage-cholesterol', keywords: ['cholesterol'] },
  { id: 'lineage-alcohol', keywords: ['alcohol', 'drink'] },
  { id: 'lineage-whole-grains', keywords: ['whole grain', 'refined carbohydrate'] },
  { id: 'lineage-sodium', keywords: ['sodium', 'salt'] },
  { id: 'lineage-processed-foods', keywords: ['processed', 'nutrient-dense'] }, // processed, or nutrient-dense etc.
  { id: 'lineage-veg-fruits', keywords: ['vegetable', 'fruit'] }
];

const POPULATION_MAPPINGS: { tag: string; keywords: string[] }[] = [
  { tag: 'infants', keywords: ['infant', 'baby', 'babies'] },
  { tag: 'toddlers', keywords: ['toddler'] },
  { tag: 'children', keywords: ['child', 'children', 'kid', 'kids'] },
  { tag: 'adolescents', keywords: ['adolescent', 'teen', 'teens', 'youth'] },
  { tag: 'pregnant', keywords: ['pregnant', 'pregnancy'] },
  { tag: 'lactating', keywords: ['lactating', 'lactation', 'breastfeeding'] },
  { tag: 'older adults', keywords: ['older adult', 'elderly', 'senior'] },
  { tag: 'adults', keywords: ['adult', 'adults'] }
];

const CONDITION_MAPPINGS: { tag: string; keywords: string[] }[] = [
  { tag: 'pregnancy', keywords: ['pregnancy', 'pregnant'] },
  { tag: 'lactation', keywords: ['lactation', 'lactating'] },
  { tag: 'hypertension', keywords: ['hypertension', 'high blood pressure'] },
  { tag: 'cardiovascular disease', keywords: ['cardiovascular', 'heart disease', 'stroke'] },
  { tag: 'diabetes', keywords: ['diabetes', 'diabetic'] },
  { tag: 'chronic disease', keywords: ['chronic disease'] },
  { tag: 'obesity', keywords: ['obesity', 'overweight', 'weight management'] }
];

/**
 * Extracts topics, lineage, population tags, condition tags, and numeric claims from text.
 */
export function assignTopicsAndMetadata(text: string): ExtractedMetadata {
  const lowerText = text.toLowerCase();
  
  // 1. Topic assignment (multi-label)
  const topic_ids: string[] = [];
  for (const item of TOPIC_KEYWORDS) {
    // For lineage-processed-foods, match if it contains "processed" or if it contains both "nutrient-dense" and "calorie limits"
    if (item.id === 'lineage-processed-foods') {
      const hasProcessed = lowerText.includes('processed');
      const hasNutrientDenseAndCalorieLimits = lowerText.includes('nutrient-dense') && lowerText.includes('calorie limits');
      if (hasProcessed || hasNutrientDenseAndCalorieLimits) {
        topic_ids.push(item.id);
      }
    } else {
      const matches = item.keywords.some(kw => lowerText.includes(kw));
      if (matches) {
        topic_ids.push(item.id);
      }
    }
  }

  // 2. Lineage assignment
  // If exactly one topic matches -> high confidence lineage_id
  // If multiple topics or 0 topics match -> low confidence lineage_id (null)
  let lineage_id: string | null = null;
  if (topic_ids.length === 1) {
    lineage_id = topic_ids[0];
  }

  // 3. Population tags
  const population_tags: string[] = [];
  for (const item of POPULATION_MAPPINGS) {
    if (item.keywords.some(kw => lowerText.includes(kw))) {
      population_tags.push(item.tag);
    }
  }
  if (population_tags.length === 0) {
    population_tags.push('general');
  }

  // 4. Condition tags
  const condition_tags: string[] = [];
  for (const item of CONDITION_MAPPINGS) {
    if (item.keywords.some(kw => lowerText.includes(kw))) {
      condition_tags.push(item.tag);
    }
  }

  // 5. Numeric claims extraction (regex for number + unit)
  const numeric_claims: string[] = [];
  const regex = /\b\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\s*(?:g\/kg|mg|mcg|g|cups?|servings?|%|ounces?|drinks?|percent|calories?)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const claim = match[0].trim();
    if (!numeric_claims.includes(claim)) {
      numeric_claims.push(claim);
    }
  }

  return {
    topic_ids,
    lineage_id,
    population_tags,
    condition_tags,
    numeric_claims
  };
}
