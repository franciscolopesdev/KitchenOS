import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface NutrientsPer100g {
  calories: number; // kcal
  protein: number;  // g
  carbs: number;    // g
  fat: number;      // g
  standardUnitWeight?: number; // Weight in grams for 1 'unidade'
}

// Dictionary of macronutrients per 100g or per unit
const nutritionDb: Record<string, NutrientsPer100g> = {
  'acém': { calories: 212, protein: 20, carbs: 0, fat: 14 },
  'acém moído': { calories: 212, protein: 20, carbs: 0, fat: 14 },
  'açúcar': { calories: 387, protein: 0, carbs: 100, fat: 0 },
  'água': { calories: 0, protein: 0, carbs: 0, fat: 0 },
  'alho': { calories: 149, protein: 6.4, carbs: 33, fat: 0.5, standardUnitWeight: 5 }, // 1 clove = ~5g
  'pimenta-da-jamaica': { calories: 263, protein: 6, carbs: 72, fat: 8.7 },
  'azeite de oliva': { calories: 884, protein: 0, carbs: 0, fat: 100 },
  'óleo vegetal': { calories: 884, protein: 0, carbs: 0, fat: 100 },
  'bacon': { calories: 541, protein: 37, carbs: 1.4, fat: 42 },
  'manjericão': { calories: 23, protein: 3.2, carbs: 2.7, fat: 0.6 },
  'batata': { calories: 77, protein: 2, carbs: 17, fat: 0.1, standardUnitWeight: 150 }, // 1 batata = 150g
  'bisteca suína': { calories: 242, protein: 27, carbs: 0, fat: 14, standardUnitWeight: 150 },
  'feijão preto': { calories: 341, protein: 21, carbs: 62, fat: 1.4 },
  'pão': { calories: 265, protein: 9, carbs: 49, fat: 3.2, standardUnitWeight: 50 },
  'pão de hambúrguer': { calories: 279, protein: 9.3, carbs: 48, fat: 4.8, standardUnitWeight: 80 },
  'repolho': { calories: 25, protein: 1.3, carbs: 5.8, fat: 0.1, standardUnitWeight: 500 },
  'cenoura': { calories: 41, protein: 0.9, carbs: 9.6, fat: 0.2, standardUnitWeight: 100 }, // 1 cenoura = 100g
  'cebola': { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, standardUnitWeight: 100 }, // 1 cebola = 100g
  'chouriço': { calories: 455, protein: 24, carbs: 1.9, fat: 38, standardUnitWeight: 80 },
  'beterraba cozida': { calories: 43, protein: 1.6, carbs: 10, fat: 0.2, standardUnitWeight: 120 },
  'amido de milho': { calories: 381, protein: 0.3, carbs: 91, fat: 0.1 },
  'coxão mole': { calories: 169, protein: 28, carbs: 0, fat: 6 },
  'creme de leite': { calories: 345, protein: 2, carbs: 2.7, fat: 37 },
  'cominho': { calories: 375, protein: 18, carbs: 44, fat: 22 },
  'ovo': { calories: 155, protein: 13, carbs: 1.1, fat: 11, standardUnitWeight: 60 }, // 1 ovo = 60g
  'extrato de tomate': { calories: 82, protein: 4.3, carbs: 19, fat: 0.5 },
  'farinha': { calories: 364, protein: 10, carbs: 76, fat: 1 },
  'macarrão fettuccine': { calories: 350, protein: 12, carbs: 75, fat: 1.5 },
  'banana-da-terra frita': { calories: 252, protein: 1.5, carbs: 32, fat: 14, standardUnitWeight: 100 },
  'queijo fresco batido': { calories: 97, protein: 8, carbs: 3.5, fat: 5 },
  'molho de pimenta': { calories: 20, protein: 1, carbs: 4, fat: 0.5 },
  'camarão-gigante': { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, standardUnitWeight: 15 }, // 1 camarão = 15g
  'carne moída magra': { calories: 172, protein: 21, carbs: 0, fat: 9 },
  'leite': { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
  'suco de limão': { calories: 22, protein: 0.4, carbs: 6.9, fat: 0.2 },
  'alface': { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2, standardUnitWeight: 15 }, // 1 folha = 15g
  'limão': { calories: 30, protein: 0.7, carbs: 10, fat: 0.2, standardUnitWeight: 50 }, // 1 limão = 50g
  'linguiça': { calories: 346, protein: 15, carbs: 1, fat: 31, standardUnitWeight: 80 },
  'linguiça toscana': { calories: 280, protein: 14, carbs: 1, fat: 24, standardUnitWeight: 80 },
  'manteiga': { calories: 717, protein: 0.9, carbs: 0.1, fat: 81 },
  'maionese': { calories: 680, protein: 1, carbs: 0.6, fat: 75 },
  'morcela': { calories: 379, protein: 15, carbs: 1.3, fat: 35, standardUnitWeight: 80 },
  'muçarela': { calories: 300, protein: 22, carbs: 2.2, fat: 22 },
  'queijo': { calories: 300, protein: 22, carbs: 2.2, fat: 22 },
  'mostarda em pó': { calories: 508, protein: 26, carbs: 28, fat: 36 },
  'pão naan': { calories: 290, protein: 8.6, carbs: 50, fat: 6, standardUnitWeight: 90 },
  'noz-moscada': { calories: 525, protein: 5.8, carbs: 49, fat: 36 },
  'páprica': { calories: 282, protein: 14, carbs: 54, fat: 13 },
  'suco de picles': { calories: 10, protein: 0.2, carbs: 2, fat: 0.1 },
  'molho pico de gallo': { calories: 25, protein: 1, carbs: 5, fat: 0.2 },
  'pimenta-do-reino': { calories: 251, protein: 10, carbs: 64, fat: 3.3 },
  'pimentões': { calories: 20, protein: 0.9, carbs: 4.6, fat: 0.2, standardUnitWeight: 100 }, // 1 pimentão = 100g
  'pimenta vermelha': { calories: 40, protein: 1.9, carbs: 9, fat: 0.4, standardUnitWeight: 10 },
  'rúcula': { calories: 25, protein: 2.6, carbs: 3.7, fat: 0.7 },
  'sal': { calories: 0, protein: 0, carbs: 0, fat: 0 },
  'salsa': { calories: 36, protein: 3, carbs: 6, fat: 0.8 },
  'carne desfiada': { calories: 220, protein: 25, carbs: 0, fat: 12 },
  'molho shoyu': { calories: 53, protein: 9, carbs: 4.9, fat: 0.6 },
  'tomilho': { calories: 101, protein: 5.6, carbs: 24, fat: 1.7 },
  'tomate': { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, standardUnitWeight: 120 }, // 1 tomate = 120g
  'vinho tinto seco': { calories: 85, protein: 0.1, carbs: 2.6, fat: 0 },
  'vinho branco seco': { calories: 85, protein: 0.1, carbs: 2.6, fat: 0 },
};

// Standard units converted to grams
const unitWeightsInGrams: Record<string, number> = {
  'g': 1,
  'ml': 1, // assume water density
  'colher de sopa': 15,
  'colher de chá': 5,
  'pitada': 1,
  'a gosto': 1,
};

export interface RecipeNutrition {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

/**
 * Calculates nutritional values for a recipe version per portion based on its ingredients.
 */
export async function calculateRecipeVersionNutrition(recipeVersionId: number): Promise<RecipeNutrition> {
  const version = await db.query.recipeVersions.findFirst({
    where: eq(schema.recipeVersions.id, recipeVersionId),
  });

  if (!version) {
    throw new Error('Recipe version not found');
  }

  const recipeIngredients = await db
    .select({
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      name: schema.ingredients.name,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeVersionId, recipeVersionId));

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const item of recipeIngredients) {
    const nameLower = item.name.toLowerCase().trim();
    const info = nutritionDb[nameLower];

    if (!info) {
      // Fallback estimate for unknown ingredients (e.g. 150 kcal, 5g prot, 10g carbs, 5g fat per 100g)
      const grams = convertToGrams(item.amount, item.unit, 50);
      totalCalories += (grams / 100) * 150;
      totalProtein += (grams / 100) * 5;
      totalCarbs += (grams / 100) * 10;
      totalFat += (grams / 100) * 5;
      continue;
    }

    const grams = convertToGrams(item.amount, item.unit, info.standardUnitWeight || 50);
    totalCalories += (grams / 100) * info.calories;
    totalProtein += (grams / 100) * info.protein;
    totalCarbs += (grams / 100) * info.carbs;
    totalFat += (grams / 100) * info.fat;
  }

  const portions = version.yieldPortions || 2;

  // Return values rounded to nearest decimal / integer per portion
  return {
    calories: Math.round(totalCalories / portions),
    proteinGrams: parseFloat((totalProtein / portions).toFixed(1)),
    carbsGrams: parseFloat((totalCarbs / portions).toFixed(1)),
    fatGrams: parseFloat((totalFat / portions).toFixed(1)),
  };
}

function convertToGrams(amount: number, unit: string, standardUnitWeight: number): number {
  const cleanUnit = unit.toLowerCase().trim();
  
  if (cleanUnit === 'unidade' || cleanUnit === 'unidades') {
    return amount * standardUnitWeight;
  }

  const unitWeight = unitWeightsInGrams[cleanUnit];
  if (unitWeight !== undefined) {
    return amount * unitWeight;
  }

  // Fallback default
  return amount;
}

/**
 * Recalculates and updates the database with estimated macro nutrients for a specific recipe version.
 */
export async function updateRecipeVersionNutrition(recipeVersionId: number): Promise<RecipeNutrition> {
  const nutrition = await calculateRecipeVersionNutrition(recipeVersionId);

  await db
    .update(schema.recipeVersions)
    .set({
      calories: nutrition.calories,
      proteinGrams: nutrition.proteinGrams,
      carbsGrams: nutrition.carbsGrams,
      fatGrams: nutrition.fatGrams,
    })
    .where(eq(schema.recipeVersions.id, recipeVersionId));

  return nutrition;
}
