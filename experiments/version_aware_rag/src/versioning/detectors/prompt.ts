export const PROMPT_VERSION = "v3.0.0";

export const SYSTEM_PROMPT = `
You are a highly precise version conflict detector. Your task is to determine the relationship between an older guideline text and a newer guideline text from different editions.

The possible relationship types are:
1. "duplicate": The text and instruction are virtually identical.
2. "superseded": The old guideline is directly replaced by a new guideline (e.g., changes in numeric limits like 10% daily to 10g per meal).
3. "conflicting": The guidelines are in direct contradiction with no target group distinction.
4. "conditional_difference": The new guideline introduces an exception/conditions for a sub-population, but the old rule remains valid for others.
5. "complementary": The guidelines support each other, or the new guideline adds compatible details to the old one.

Output MUST be a valid JSON object matching this schema:
{
  "relationType": "duplicate" | "superseded" | "conflicting" | "conditional_difference" | "complementary",
  "confidence": number (between 0.0 and 1.0),
  "rationale": string
}
Do NOT output any markdown blocks or conversational text, only the raw JSON.
`;

export function getZeroShotPrompt(oldText: string, newText: string): string {
  return `
Old Guideline:
"${oldText}"

New Guideline:
"${newText}"

Determine the relationType, confidence, and rationale.
`;
}

// Development split few-shot examples (strictly isolated from test set)
export const DEV_FEW_SHOT_EXAMPLES = [
  {
    oldText: "Limit saturated fat intake to less than 10 percent of calories per day starting at age 2.",
    newText: "Include full-fat dairy with no added sugars. Dairy is an excellent source of protein, healthy fats.",
    result: {
      relationType: "superseded",
      confidence: 0.95,
      rationale: "The 2025-2030 version shifts from fat-free/low-fat dairy to full-fat dairy, which directly supersedes the previous recommendation."
    }
  },
  {
    oldText: "Sodium-Less than 2,300 milligrams per day starting at age 14. Keep intakes lower for children younger than age 14.",
    newText: "The general population, ages 14 and above, should consume less than 2,300 mg per day of sodium. Highly active individuals may benefit from increased sodium intake to offset sweat losses.",
    result: {
      relationType: "conditional_difference",
      confidence: 0.90,
      rationale: "While both versions maintain the general population limit of <2,300 mg/day, the 2025-2030 version adds an exception (conditional difference) for highly active individuals."
    }
  }
];

export function getFewShotPrompt(
  oldText: string,
  newText: string,
  testPairIdsToExclude?: string[],
  currentPairId?: string
): string {
  if (testPairIdsToExclude && currentPairId && testPairIdsToExclude.includes(currentPairId)) {
    throw new Error(`Data contamination error: test pair ID ${currentPairId} cannot be used in few-shot prompt construction.`);
  }

  const examplesStr = DEV_FEW_SHOT_EXAMPLES.map((ex, idx) => `
Example ${idx + 1}:
Old Guideline: "${ex.oldText}"
New Guideline: "${ex.newText}"
Result: ${JSON.stringify(ex.result, null, 2)}
`).join('\n');

  return `
${examplesStr}

Input:
Old Guideline:
"${oldText}"

New Guideline:
"${newText}"

Determine the relationType, confidence, and rationale. Output only valid JSON.
`;
}

