# Version-Aware RAG Gold Evaluation Pairs Set (English)

This document records the 10 gold evaluation pairs compiled from the Dietary Guidelines for Americans (DGA) versions 2015-2020, 2020-2025, and 2025-2030. Each pair is verified against the canonical text in the normalized guidelines.

---

## 1. Dairy Fat Recommendation (`lineage-dairy`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version shifts from fat-free/low-fat dairy to full-fat dairy, which directly supersedes the previous recommendation.
* **Sources**: 2025-2030 Page 3; 2020-2025 Page 7, 8
* **Verbatim Old Text**:
  > Dairy, including fat-free or low-fat milk, yogurt, and cheese, and/or lactose-free versions and fortified soy beverages and yogurt as alternatives as part of a healthy dietary pattern. Saturated fat intake should be limited to less than 10 percent of calories per day starting at age 2, which applies to dairy choices.
* **Verbatim New Text**:
  > When consuming dairy, include full-fat dairy with no added sugars. Dairy is an excellent source of protein, healthy fats, vitamins, and minerals. Dairy serving goals: 3 servings per day as part of a 2,000-calorie dietary pattern, adjusting as needed based on your individual caloric requirements.

---

## 2. Protein Intake Goals (`lineage-protein`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version introduces a specific quantitative protein target of 1.2-1.6 g/kg/day, superseding the qualitative description in the 2020 guidelines.
* **Sources**: 2025-2030 Page 3; 2020-2025 Page 7
* **Verbatim Old Text**:
  > Protein foods, including lean meats, poultry, and eggs; seafood; beans, peas, and lentils; and nuts, seeds, and soy products. Choose a variety of protein foods from both animal and plant sources.
* **Verbatim New Text**:
  > Protein serving goals: 1.2-1.6 grams of protein per kilogram of body weight per day, adjusting as needed based on your individual caloric requirements. Prioritize high-quality, nutrient-dense protein foods as part of a healthy dietary pattern.

---

## 3. Added Sugars Limit (`lineage-sugars`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version changes the quantitative restriction from a daily percentage limit (<10% of calories) to a per-meal limit (max 10g per meal), which is a major update.
* **Sources**: 2025-2030 Page 5; 2020-2025 Page 8
* **Verbatim Old Text**:
  > Added sugars-Less than 10% of calories per day starting at age 2. Avoid foods and beverages with added sugars for those younger than age 2.
* **Verbatim New Text**:
  > While no amount of added sugars or non-nutritive sweeteners is recommended or considered part of a healthy or nutritious diet, one meal should contain no more than 10 grams of added sugars. Avoid sugar-sweetened beverages, such as sodas, fruit drinks, and energy drinks.

---

## 4. Non-Nutritive Sweeteners (`lineage-sweeteners`)
* **Versions**: 2025-2030 (New) vs 2015-2020 (Old)
* **Relation Label**: `conflicting`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2015-2020 version states that sweeteners may reduce short-term calorie intake, whereas the 2025-2030 version actively discourages their consumption and recommends limiting them completely.
* **Sources**: 2025-2030 Page 5; 2015-2020 Page 50
* **Verbatim Old Text**:
  > It should be noted that replacing added sugars with high-intensity sweeteners may reduce calorie intake in the short-term, yet questions remain about their effectiveness as a long-term weight management strategy.
* **Verbatim New Text**:
  > Limit foods and beverages that include artificial flavors, petroleum-based dyes, artificial preservatives, and low-calorie non-nutritive sweeteners. While no amount of added sugars or non-nutritive sweeteners is recommended or considered part of a healthy or nutritious diet.

---

## 5. Dietary Cholesterol Limit (`lineage-cholesterol`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `complementary`
* **Policy Label**: `retain`
* **Stale if Retrieved**: No | **Stale if Cited**: No
* **Rationale**: Both versions agree that there is no quantitative limit on dietary cholesterol, but 2025-2030 adds emphasis on prioritizing whole foods containing healthy fats.
* **Sources**: 2025-2030 Page 4; 2020-2025 Page 8
* **Verbatim Old Text**:
  > The National Academies recommends that trans fat and dietary cholesterol consumption to be as low as possible without compromising the nutritional adequacy of the diet. The Dietary Guidelines does not establish a quantitative limit for dietary cholesterol.
* **Verbatim New Text**:
  > Healthy fats are plentiful in many whole foods, such as meats, poultry, eggs, omega-3-rich seafood, nuts, seeds, full-fat dairy, olives, and avocados. No quantitative limits are placed on dietary cholesterol, placing emphasis on whole foods instead.

---

## 6. Alcohol Consumption Limit (`lineage-alcohol`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version shifts from setting a quantitative recommendation (up to 1 or 2 drinks in moderation) to a general guideline of 'consuming less' for better overall health and emphasizes avoidance.
* **Sources**: 2025-2030 Page 6; 2020-2025 Page 8
* **Verbatim Old Text**:
  > If alcohol is consumed, it should be in moderation (up to 1 drink per day for women and up to 2 drinks per day for men). Some people should completely avoid alcohol, such as pregnant women, those under 21, and individuals taking certain medications.
* **Verbatim New Text**:
  > Consume less alcohol for better overall health. People who should completely avoid alcohol include pregnant women, people who are recovering from alcohol use disorder or are unable to control the amount they drink, and people taking medications.

---

## 7. Whole Grains Recommendation (`lineage-whole-grains`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version introduces a quantitative serving goal (2-4 servings per day) and actively calls to 'significantly reduce' specific refined carbs, superseding the 2020 guideline.
* **Sources**: 2025-2030 Page 4; 2020-2025 Page 7
* **Verbatim Old Text**:
  > At least half of total grain intake should be whole grains. Limit refined grain products, particularly those high in sodium, added sugars, and saturated fats.
* **Verbatim New Text**:
  > Whole grains serving goals: 2-4 servings per day, adjusting as needed based on your individual caloric requirements. Significantly reduce the consumption of highly processed, refined carbohydrates, such as white bread, ready-to-eat or packaged breakfast options, flour tortillas, and crackers.

---

## 8. Sodium Intake Limit (`lineage-sodium`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `conditional_difference`
* **Policy Label**: `retain`
* **Stale if Retrieved**: No | **Stale if Cited**: No
* **Rationale**: While both versions maintain the general population limit of <2,300 mg/day, the 2025-2030 version adds an exception (conditional difference) for highly active individuals who may benefit from more sodium to offset sweat loss.
* **Sources**: 2025-2030 Page 6; 2020-2025 Page 8
* **Verbatim Old Text**:
  > Sodium-Less than 2,300 milligrams per day starting at age 14. Keep intakes lower for children younger than age 14. Limit foods and beverages higher in sodium.
* **Verbatim New Text**:
  > Sodium and electrolytes are essential for hydration. The general population, ages 14 and above, should consume less than 2,300 mg per day of sodium. Highly active individuals may benefit from increased sodium intake to offset sweat losses. Highly processed foods that are high in sodium should be avoided.

---

## 9. Processed Foods Intake (`lineage-processed-foods`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version shifts from merely advising to 'limit' added sugars/saturated fats/sodium to directly advocating for a return to 'whole, nutrient-dense foods' and 'avoiding' highly processed packaged, prepared, or ready-to-eat foods.
* **Sources**: 2025-2030 Page 2, 5; 2020-2025 Page 4, 8
* **Verbatim Old Text**:
  > Focus on meeting food group needs with nutrient-dense foods and beverages, and stay within calorie limits. Limit foods and beverages higher in added sugars, saturated fat, and sodium.
* **Verbatim New Text**:
  > Avoid highly processed packaged, prepared, ready-to-eat, or other foods that are salty or sweet, such as chips, cookies, and candy that have added sugars and sodium (salt). Instead, prioritize nutrient-dense foods and home-prepared meals. When dining out, choose nutrient-dense options. To Make America Healthy Again, American households must prioritize diets built on whole, nutrient-dense foods.

---

## 10. Vegetables and Fruits Consumption (`lineage-veg-fruits`)
* **Versions**: 2025-2030 (New) vs 2020-2025 (Old)
* **Relation Label**: `superseded`
* **Policy Label**: `deprecate`
* **Stale if Retrieved**: Yes | **Stale if Cited**: Yes
* **Rationale**: The 2025-2030 version defines explicit daily serving goals (3 servings of vegetables and 2 servings of fruits) and adds guidance to restrict or dilute 100% juices, replacing the general descriptive advice from 2020-2025.
* **Sources**: 2025-2030 Page 4; 2020-2025 Page 7
* **Verbatim Old Text**:
  > The core elements that make up a healthy dietary pattern include: Vegetables of all types-dark green; red and orange; beans, peas, and lentils; starchy; and other vegetables. Fruits, especially whole fruit.
* **Verbatim New Text**:
  > Vegetables and fruits serving goals for a 2,000-calorie dietary pattern, adjusting as needed based on your individual caloric requirements: Vegetables: 3 servings per day; Fruits: 2 servings per day. Eat whole vegetables and fruits in their original form. 100% fruit or vegetable juice should be consumed in limited portions or diluted with water.
