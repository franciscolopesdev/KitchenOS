import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, like, and, or, sql } from 'drizzle-orm';
import { updateRecipeVersionNutrition } from './nutrition.js';

export interface IngredientInput {
  ingredientId: number;
  amount: number;
  unit: string;
  notes?: string;
  isOptional?: boolean;
}

export interface TechniqueInput {
  techniqueId: number;
  stepOrder: number;
  notes?: string;
}

/**
 * Get or create a cuisine by name
 */
export async function getOrCreateCuisine(name: string) {
  const normalized = name.trim();
  const existing = await db.query.cuisines.findFirst({
    where: eq(schema.cuisines.name, normalized),
  });

  if (existing) return existing;

  const [inserted] = await db.insert(schema.cuisines).values({ name: normalized }).returning();
  return inserted;
}

/**
 * Get or create a tag by name
 */
export async function getOrCreateTag(name: string) {
  const normalized = name.trim();
  const existing = await db.query.tags.findFirst({
    where: eq(schema.tags.name, normalized),
  });

  if (existing) return existing;

  const [inserted] = await db.insert(schema.tags).values({ name: normalized }).returning();
  return inserted;
}

/**
 * Get or create an ingredient
 */
export async function getOrCreateIngredient(
  name: string,
  category: string,
  defaultUnit = 'g',
  avoidsGinger = false,
  flavorProfile?: string
) {
  const normalized = name.trim();
  const existing = await db.query.ingredients.findFirst({
    where: eq(schema.ingredients.name, normalized),
  });

  if (existing) return existing;

  // Enforce ginger restriction rule
  const isGinger = normalized.toLowerCase().includes('gengibre') || normalized.toLowerCase().includes('ginger');
  const actualAvoidsGinger = avoidsGinger || isGinger;

  const [inserted] = await db
    .insert(schema.ingredients)
    .values({
      name: normalized,
      category,
      defaultUnit,
      avoidsGinger: actualAvoidsGinger,
      flavorProfile,
    })
    .returning();
  return inserted;
}

/**
 * Get or create a technique
 */
export async function getOrCreateTechnique(
  name: string,
  description?: string,
  difficulty = 'Easy',
  flavorImpact?: string
) {
  const normalized = name.trim();
  const existing = await db.query.techniques.findFirst({
    where: eq(schema.techniques.name, normalized),
  });

  if (existing) return existing;

  const [inserted] = await db
    .insert(schema.techniques)
    .values({
      name: normalized,
      description,
      difficulty,
      flavorImpact,
    })
    .returning();
  return inserted;
}

/**
 * Create a recipe metadata record
 */
export async function createRecipe(name: string, description?: string, cuisineName?: string, tagNames: string[] = []) {
  let cuisineId: number | undefined;
  if (cuisineName) {
    const cuisine = await getOrCreateCuisine(cuisineName);
    cuisineId = cuisine.id;
  }

  // Insert Recipe
  const [recipe] = await db
    .insert(schema.recipes)
    .values({
      name: name.trim(),
      description,
      cuisineId,
    })
    .returning();

  // Map Tags
  for (const tagName of tagNames) {
    const tag = await getOrCreateTag(tagName);
    await db.insert(schema.recipeTags).values({
      recipeId: recipe.id,
      tagId: tag.id,
    });
  }

  return recipe;
}

/**
 * Create a new recipe version (snapshot)
 */
export async function createRecipeVersion(
  recipeId: number,
  versionNumber: string,
  name: string,
  description?: string,
  yieldPortions = 2,
  isFreezerFriendly = true,
  estimatedTimeMinutes?: number,
  difficulty = 'Easy',
  ingredientsList: IngredientInput[] = [],
  techniquesList: TechniqueInput[] = []
) {
  // 1. Check for ginger allergy rule
  for (const ing of ingredientsList) {
    const ingredient = await db.query.ingredients.findFirst({
      where: eq(schema.ingredients.id, ing.ingredientId),
    });
    if (ingredient?.avoidsGinger) {
      throw new Error(`Restrição Alimentar Detectada: Ingrediente '${ingredient.name}' contém restrição a Gengibre e não pode ser utilizado!`);
    }
  }

  // 2. Insert recipe version
  const [version] = await db
    .insert(schema.recipeVersions)
    .values({
      recipeId,
      versionNumber,
      name: name.trim(),
      description,
      yieldPortions,
      isFreezerFriendly,
      estimatedTimeMinutes,
      difficulty,
    })
    .returning();

  // 3. Insert version ingredients
  if (ingredientsList.length > 0) {
    await db.insert(schema.recipeIngredients).values(
      ingredientsList.map((i) => ({
        recipeVersionId: version.id,
        ingredientId: i.ingredientId,
        amount: i.amount,
        unit: i.unit,
        notes: i.notes,
        isOptional: i.isOptional ?? false,
      }))
    );
  }

  // 4. Insert version techniques
  if (techniquesList.length > 0) {
    await db.insert(schema.recipeTechniques).values(
      techniquesList.map((t) => ({
        recipeVersionId: version.id,
        techniqueId: t.techniqueId,
        stepOrder: t.stepOrder,
        notes: t.notes,
      }))
    );
  }

  // 5. Update parent recipe currentVersionId
  await db
    .update(schema.recipes)
    .set({ currentVersionId: version.id })
    .where(eq(schema.recipes.id, recipeId));

  // 6. Calculate & update nutrition information
  try {
    await updateRecipeVersionNutrition(version.id);
  } catch (error: any) {
    console.warn(`[Nutrition] Failed to calculate nutrition for version ${version.id}: ${error.message}`);
  }

  return version;
}

/**
 * Log a cooking experiment
 */
export async function logExperiment(
  recipeVersionId: number,
  rating: number,
  outcomeNotes: string,
  servingsCooked = 2,
  proteinWeightGrams = 300,
  deltaNotes?: string,
  nextVersionSuggestions?: string
) {
  const [experiment] = await db
    .insert(schema.experiments)
    .values({
      recipeVersionId,
      servingsCooked,
      proteinWeightGrams,
      rating,
      outcomeNotes,
      deltaNotes,
      nextVersionSuggestions,
    })
    .returning();

  return experiment;
}

/**
 * Retrieve a recipe, current version details, ingredients, and techniques
 */
export async function getRecipeDetails(recipeId: number) {
  const recipe = await db.query.recipes.findFirst({
    where: eq(schema.recipes.id, recipeId),
    with: {
      cuisine: true,
    },
  });

  if (!recipe) return null;

  // Fetch Tags
  const rTags = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
    })
    .from(schema.recipeTags)
    .innerJoin(schema.tags, eq(schema.recipeTags.tagId, schema.tags.id))
    .where(eq(schema.recipeTags.recipeId, recipeId));

  // Fetch all versions
  const versions = await db.query.recipeVersions.findMany({
    where: eq(schema.recipeVersions.recipeId, recipeId),
    orderBy: (versions, { desc }) => [desc(versions.createdAt)],
  });

  // Current version details
  let currentVersion = null;
  let currentIngredients: any[] = [];
  let currentTechniques: any[] = [];

  if (recipe.currentVersionId) {
    currentVersion = await db.query.recipeVersions.findFirst({
      where: eq(schema.recipeVersions.id, recipe.currentVersionId),
    });

    if (currentVersion) {
      // Load ingredients
      currentIngredients = await db
        .select({
          id: schema.ingredients.id,
          name: schema.ingredients.name,
          category: schema.ingredients.category,
          amount: schema.recipeIngredients.amount,
          unit: schema.recipeIngredients.unit,
          notes: schema.recipeIngredients.notes,
          isOptional: schema.recipeIngredients.isOptional,
        })
        .from(schema.recipeIngredients)
        .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
        .where(eq(schema.recipeIngredients.recipeVersionId, currentVersion.id));

      // Load techniques
      currentTechniques = await db
        .select({
          id: schema.techniques.id,
          name: schema.techniques.name,
          description: schema.techniques.description,
          stepOrder: schema.recipeTechniques.stepOrder,
          notes: schema.recipeTechniques.notes,
        })
        .from(schema.recipeTechniques)
        .innerJoin(schema.techniques, eq(schema.recipeTechniques.techniqueId, schema.techniques.id))
        .where(eq(schema.recipeTechniques.recipeVersionId, currentVersion.id))
        .orderBy(schema.recipeTechniques.stepOrder);
    }
  }

  // Load experiments history
  const history = await db
    .select({
      id: schema.experiments.id,
      versionNumber: schema.recipeVersions.versionNumber,
      cookedAt: schema.experiments.cookedAt,
      rating: schema.experiments.rating,
      outcomeNotes: schema.experiments.outcomeNotes,
      deltaNotes: schema.experiments.deltaNotes,
      servings: schema.experiments.servingsCooked,
      proteinWeight: schema.experiments.proteinWeightGrams,
    })
    .from(schema.experiments)
    .innerJoin(schema.recipeVersions, eq(schema.experiments.recipeVersionId, schema.recipeVersions.id))
    .where(eq(schema.recipeVersions.recipeId, recipeId))
    .orderBy(schema.experiments.cookedAt);

  return {
    ...recipe,
    tags: rTags.map(t => t.name),
    versions,
    currentVersion,
    ingredients: currentIngredients,
    techniques: currentTechniques,
    history,
  };
}

/**
 * Scale a recipe version based on target portions or base protein weight
 */
export async function scaleRecipe(
  recipeVersionId: number,
  targetPortions?: number,
  targetProteinGrams?: number
) {
  const version = await db.query.recipeVersions.findFirst({
    where: eq(schema.recipeVersions.id, recipeVersionId),
  });

  if (!version) throw new Error('Recipe version not found.');

  const rIngredients = await db
    .select({
      id: schema.ingredients.id,
      name: schema.ingredients.name,
      category: schema.ingredients.category,
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      notes: schema.recipeIngredients.notes,
      isOptional: schema.recipeIngredients.isOptional,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeVersionId, recipeVersionId));

  // Determine scaling factor
  let factor = 1.0;

  if (targetPortions) {
    factor = targetPortions / version.yieldPortions;
  } else if (targetProteinGrams) {
    // Find the primary protein ingredient
    const proteins = rIngredients.filter((i) => i.category === 'Proteínas');
    if (proteins.length > 0) {
      // Take the first or heaviest protein as base
      const baseProtein = proteins[0];
      factor = targetProteinGrams / baseProtein.amount;
    } else {
      throw new Error('No protein ingredient found to scale against.');
    }
  }

  const scaledIngredients = rIngredients.map((ing) => {
    // We scale quantities, but we do NOT scale optional spices/seasonings if they are qualitative (e.g. pinch, to taste)
    const isQualitative = ['pinch', 'to taste', 'pitada', 'a gosto'].some(u => ing.unit.toLowerCase().includes(u));
    return {
      ...ing,
      originalAmount: ing.amount,
      amount: isQualitative ? ing.amount : parseFloat((ing.amount * factor).toFixed(2)),
    };
  });

  return {
    versionNumber: version.versionNumber,
    originalYield: version.yieldPortions,
    scaledYield: targetPortions ?? Math.round(version.yieldPortions * factor),
    scalingFactor: factor,
    ingredients: scaledIngredients,
  };
}

/**
 * General recipe search
 */
export async function searchRecipes(query: string) {
  const term = `%${query}%`;
  return await db
    .select({
      id: schema.recipes.id,
      name: schema.recipes.name,
      description: schema.recipes.description,
      isFavorite: schema.recipes.isFavorite,
      preferredEquipment: schema.recipes.preferredEquipment,
      preferenceReason: schema.recipes.preferenceReason,
    })
    .from(schema.recipes)
    .where(
      or(
        like(schema.recipes.name, term),
        like(schema.recipes.description, term)
      )
    )
    .limit(20);
}

/**
 * Calculates culinary stats from cooking experiments
 */
export async function getCookingStats() {
  // 1. Total meals cooked from experiments & sessions
  const cookedRes = await db.select({ count: sql<number>`count(*)` }).from(schema.experiments);
  const totalCooked = cookedRes[0]?.count || 0;

  const sessionRes = await db.select({ count: sql<number>`count(*)` }).from(schema.cookingSessions);
  const totalSessions = sessionRes[0]?.count || 0;

  // 2. Average rating
  const ratingRes = await db.select({ avg: sql<number>`avg(rating)` }).from(schema.experiments);
  const avgRating = ratingRes[0]?.avg ? parseFloat(ratingRes[0].avg.toFixed(1)) : 0;

  // 3. Favorite cuisine
  const favCuisines = await db
    .select({
      cuisineName: schema.cuisines.name,
      count: sql<number>`count(*)`,
    })
    .from(schema.experiments)
    .innerJoin(schema.recipeVersions, eq(schema.experiments.recipeVersionId, schema.recipeVersions.id))
    .innerJoin(schema.recipes, eq(schema.recipeVersions.recipeId, schema.recipes.id))
    .innerJoin(schema.cuisines, eq(schema.recipes.cuisineId, schema.cuisines.id))
    .groupBy(schema.cuisines.name)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  const favoriteCuisine = favCuisines[0]?.cuisineName || 'Nenhuma';

  // 4. Total protein in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const proteinRes = await db
    .select({ sum: sql<number>`sum(protein_weight_grams)` })
    .from(schema.experiments)
    .where(sql`cooked_at >= ${sevenDaysAgoStr}`);

  const totalProteinConsumed = proteinRes[0]?.sum ? parseFloat(proteinRes[0].sum.toFixed(1)) : 0;

  // 5. Top 5 ingredients most used in recipes
  const topIngredients = await db
    .select({
      name: schema.ingredients.name,
      count: sql<number>`count(*)`,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .groupBy(schema.ingredients.name)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  // 6. Top 5 neglected/forgotten ingredients (synced but rarely used)
  const neglectedIngredients = await db
    .select({
      name: schema.ingredients.name,
      count: sql<number>`count(*)`
    })
    .from(schema.ingredients)
    .leftJoin(schema.recipeIngredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .groupBy(schema.ingredients.name)
    .orderBy(sql`count(*) asc`)
    .limit(5);

  return {
    totalCooked,
    totalSessions,
    avgRating,
    favoriteCuisine,
    totalProteinConsumedLast7Days: totalProteinConsumed,
    topIngredients,
    neglectedIngredients,
  };
}

// Substitutes dictionary in Portuguese
const substitutionDict: Record<string, string[]> = {
  'manteiga': ['Azeite de Oliva', 'Óleo de Coco', 'Margarina vegetal'],
  'creme de leite': ['Iogurte natural batido', 'Leite de coco cremoso', 'Leite evaporado'],
  'ovo': ['Purê de maçã (60g)', '1 colher de sopa de semente de linhaça triturada + 3 de água (hidratada)', 'Meia banana amassada'],
  'extrato de tomate': ['Tomate pelado picado reduzido', 'Molho de tomate caseiro denso'],
  'suco de limão': ['Vinagre de maçã', 'Suco de lima', 'Vinagre branco'],
  'limão': ['Vinagre de maçã', 'Suco de limão engarrafado'],
  'queijo': ['Muçarela de búfala', 'Queijo prato', 'Queijo tofu grelhado (vegano)'],
  'muçarela': ['Queijo prato', 'Queijo coalho ralado', 'Provolone ralado'],
  'amido de milho': ['Farinha de trigo', 'Polvilho doce', 'Fécula de batata'],
  'molho shoyu': ['Molho inglês (Worcestershire)', 'Aminoácidos de coco (Coconut Aminos)'],
  'vinho tinto seco': ['Suco de uva integral misturado com vinagre de maçã (proporção 3:1)', 'Caldo de carne denso'],
  'vinho branco seco': ['Suco de maçã integral com um toque de vinagre branco', 'Caldo de legumes aromático'],
  'peito de frango': ['Filé de sobrecoxa de frango', 'Lombo suíno cortado em tiras', 'Tofu firme'],
  'bisteca suína': ['Filé de lombo suíno', 'Coxão mole de boi em bifes'],
  'morcela': ['Chouriço tradicional', 'Linguiça calabresa fresca'],
  'chouriço': ['Morcela', 'Linguiça toscana temperada com páprica'],
};

/**
 * Look up common culinary substitutes for a given ingredient
 */
export async function getIngredientSubstitutes(ingredientName: string) {
  const query = ingredientName.toLowerCase().trim();
  
  // Exact match
  if (substitutionDict[query]) {
    return { ingredient: ingredientName, substitutes: substitutionDict[query] };
  }

  // Partial match
  const matchedKey = Object.keys(substitutionDict).find((k) => query.includes(k) || k.includes(query));
  if (matchedKey) {
    return { ingredient: ingredientName, matchedBase: matchedKey, substitutes: substitutionDict[matchedKey] };
  }

  return {
    ingredient: ingredientName,
    substitutes: [],
    message: 'Nenhum substituto clássico mapeado no banco local. Dica geral: Substitua por um ingrediente da mesma categoria (ex: proteína por proteína, vegetal por vegetal de textura similar).',
  };
}

/**
 * Generates a formatted markdown text printout of a recipe version
 */
export async function exportRecipeToMarkdown(recipeVersionId: number): Promise<string> {
  const version = await db.query.recipeVersions.findFirst({
    where: eq(schema.recipeVersions.id, recipeVersionId),
  });

  if (!version) throw new Error('Recipe version not found.');

  const recipe = await db.query.recipes.findFirst({
    where: eq(schema.recipes.id, version.recipeId),
  });

  if (!recipe) throw new Error('Parent recipe not found.');

  const ingredientsList = await db
    .select({
      name: schema.ingredients.name,
      category: schema.ingredients.category,
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      notes: schema.recipeIngredients.notes,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeVersionId, recipeVersionId));

  const techniquesList = await db
    .select({
      name: schema.techniques.name,
      stepOrder: schema.recipeTechniques.stepOrder,
      notes: schema.recipeTechniques.notes,
    })
    .from(schema.recipeTechniques)
    .innerJoin(schema.techniques, eq(schema.recipeTechniques.techniqueId, schema.techniques.id))
    .where(eq(schema.recipeTechniques.recipeVersionId, recipeVersionId))
    .orderBy(schema.recipeTechniques.stepOrder);

  let cuisineName = '';
  if (recipe.cuisineId) {
    const cuisine = await db.query.cuisines.findFirst({
      where: eq(schema.cuisines.id, recipe.cuisineId),
    });
    if (cuisine) {
      cuisineName = cuisine.name;
    }
  }

  let md = `# 🍳 Ficha Técnica: ${recipe.name}\n\n`;
  md += `**Versão:** ${version.versionNumber} - _"${version.name}"_\n`;
  if (cuisineName) md += `**Gastronomia:** ${cuisineName}\n`;
  md += `**Rendimento:** ${version.yieldPortions} porções\n`;
  md += `**Tempo Estimado:** ${version.estimatedTimeMinutes ? `${version.estimatedTimeMinutes} minutos` : 'Não informado'}\n`;
  md += `**Dificuldade:** ${version.difficulty === 'Easy' ? 'Fácil' : version.difficulty === 'Medium' ? 'Média' : 'Difícil'}\n`;
  md += `**Congelável:** ${version.isFreezerFriendly ? 'Sim' : 'Não'}\n`;

  try {
    const costInfo = await calculateRecipeCost(recipeVersionId);
    md += `**Custo Estimado:** ${costInfo.currency} ${costInfo.totalCost.toFixed(2)} (${costInfo.currency} ${costInfo.costPerPortion.toFixed(2)} por porção)\n`;
    if (costInfo.hasMissingPrices) {
      md += `⚠️ _Nota: Alguns ingredientes não possuem preço cadastrado, custo subestimado._\n`;
    }
  } catch (e) {
    md += `**Custo Estimado:** Não disponível\n`;
  }
  md += `\n`;

  md += `## 📊 Informações Nutricionais (Por Porção)\n`;
  if (version.calories !== null) {
    md += `- **Calorias:** ${version.calories} kcal\n`;
    md += `- **Proteínas:** ${version.proteinGrams}g\n`;
    md += `- **Carboidratos:** ${version.carbsGrams}g\n`;
    md += `- **Gorduras:** ${version.fatGrams}g\n\n`;
  } else {
    md += `_Informações nutricionais não estimadas._\n\n`;
  }

  md += `## 🥦 Ingredientes Necessários\n`;
  for (const ing of ingredientsList) {
    const notesStr = ing.notes ? ` (${ing.notes})` : '';
    md += `- [ ] **${ing.amount}${ing.unit}** de **${ing.name}**${notesStr}\n`;
  }
  md += `\n`;

  md += `## 🍳 Passo a Passo (Técnicas)\n`;
  for (const tech of techniquesList) {
    md += `### ${tech.stepOrder}. ${tech.name}\n`;
    md += `${tech.notes || '_Sem observações específicas para este passo._'}\n\n`;
  }

  return md;
}

/**
 * Calculates total and per-portion costs for a recipe version.
 */
export async function calculateRecipeCost(recipeVersionId: number) {
  const version = await db.query.recipeVersions.findFirst({
    where: eq(schema.recipeVersions.id, recipeVersionId),
  });

  if (!version) throw new Error('Recipe version not found.');

  // Join recipeIngredients with ingredients to get price details
  const ingredientsList = await db
    .select({
      name: schema.ingredients.name,
      amountNeeded: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      pricePerUnit: schema.ingredients.pricePerUnit,
      priceUnit: schema.ingredients.priceUnit,
      defaultUnit: schema.ingredients.defaultUnit,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeVersionId, recipeVersionId));

  let totalCost = 0;
  const breakdown: any[] = [];
  let hasMissingPrices = false;
  let currency = 'R$';

  for (const ing of ingredientsList) {
    if (ing.pricePerUnit === null) {
      hasMissingPrices = true;
      breakdown.push({
        name: ing.name,
        amount: ing.amountNeeded,
        unit: ing.unit,
        cost: 0,
        missingPrice: true,
      });
      continue;
    }

    currency = ing.priceUnit || 'R$';
    
    // Convert units if necessary (g/kg, ml/l)
    let convertedAmount = ing.amountNeeded;
    const itemUnit = ing.unit.toLowerCase();
    const defUnit = (ing.defaultUnit || 'g').toLowerCase();

    if (itemUnit === 'kg' && defUnit === 'g') {
      convertedAmount = ing.amountNeeded * 1000;
    } else if (itemUnit === 'g' && defUnit === 'kg') {
      convertedAmount = ing.amountNeeded / 1000;
    } else if (itemUnit === 'l' && defUnit === 'ml') {
      convertedAmount = ing.amountNeeded * 1000;
    } else if (itemUnit === 'ml' && defUnit === 'l') {
      convertedAmount = ing.amountNeeded / 1000;
    }

    const itemCost = convertedAmount * ing.pricePerUnit;
    totalCost += itemCost;

    breakdown.push({
      name: ing.name,
      amount: ing.amountNeeded,
      unit: ing.unit,
      cost: parseFloat(itemCost.toFixed(2)),
      pricePerUnit: ing.pricePerUnit,
      priceUnit: currency,
    });
  }

  const yieldPortions = version.yieldPortions || 2;
  const costPerPortion = totalCost / yieldPortions;

  return {
    recipeVersionId,
    recipeName: version.name,
    yieldPortions,
    totalCost: parseFloat(totalCost.toFixed(2)),
    costPerPortion: parseFloat(costPerPortion.toFixed(2)),
    currency,
    breakdown,
    hasMissingPrices,
  };
}

/**
 * Sets price for an ingredient in SQLite and updates it in Notion if synced.
 */
export async function setIngredientPrice(ingredientId: number, pricePerUnit: number, priceUnit = 'R$') {
  const ingredient = await db.query.ingredients.findFirst({
    where: eq(schema.ingredients.id, ingredientId),
  });

  if (!ingredient) throw new Error('Ingredient not found.');

  await db
    .update(schema.ingredients)
    .set({ pricePerUnit, priceUnit })
    .where(eq(schema.ingredients.id, ingredientId));

  // If synced, also update in Notion
  if (ingredient.notionPageId) {
    try {
      const { notion } = await import('../notion/client.js');
      await notion.pages.update({
        page_id: ingredient.notionPageId,
        properties: {
          'Preço por Unidade': { number: pricePerUnit },
          'Unidade Financeira': {
            rich_text: [
              {
                text: {
                  content: priceUnit,
                },
              },
            ],
          },
        },
      });
      console.log(`[Notion Sync] Updated price for "${ingredient.name}" in Notion.`);
    } catch (e: any) {
      console.warn(`[Notion Sync] Failed to update price in Notion: ${e.message}`);
    }
  }

  return { id: ingredientId, name: ingredient.name, pricePerUnit, priceUnit };
}

/**
 * Compiles a chef timeline capturing years of culinary progression, milestones, learnings, and technical mastery.
 */
export async function getChefTimeline(): Promise<string> {
  // Query all cooking sessions ordered by date
  const sessions = await db.query.cookingSessions.findMany({
    orderBy: (cs, { asc }) => [asc(cs.date)],
  });

  // Query all techniques with mastery > 1
  const techniques = await db.query.techniques.findMany({
    where: sql`mastery_level > 1`,
    orderBy: (t, { desc }) => [desc(t.masteryLevel)],
  });

  let timeline = `# 📜 Linha do Tempo & Biografia Culinária (KitchenOS)\n\n`;
  timeline += `Esta timeline reconstrói sua jornada na cozinha, seus aprendizados, erros consolidados e conquistas técnicas ao longo do tempo.\n\n`;

  // 1. Technical mastery
  timeline += `## 🏆 Domínio Técnico Atual\n`;
  if (techniques.length > 0) {
    for (const tech of techniques) {
      timeline += `- **${tech.name}**: ${tech.masteryLevel}/10 (${tech.difficulty === 'Easy' ? 'Básico' : tech.difficulty === 'Medium' ? 'Intermediário' : 'Avançado'})\n`;
    }
  } else {
    timeline += `_Nenhuma técnica evoluiu acima do nível 1 ainda. Conclua sessões de cozinha com avaliação geral >= 4 para evoluir técnicas!_\n`;
  }
  timeline += `\n`;

  // 2. Timeline of Sessions
  timeline += `## 📅 Histórico de Sessões de Cozinha\n`;
  if (sessions.length > 0) {
    for (const session of sessions) {
      timeline += `### 🍳 Sessão #${session.id} — ${session.date} (${session.startTime || ''} às ${session.endTime || ''})\n`;
      if (session.location) timeline += `- **Local:** ${session.location}\n`;
      if (session.chef) timeline += `- **Chef:** ${session.chef} ${session.participants ? `(com a ajuda de: ${session.participants})` : ''}\n`;
      
      // Query recipes prepared in this session
      const linked = await db
        .select({
          recipeName: schema.recipes.name,
          versionNumber: schema.recipeVersions.versionNumber,
        })
        .from(schema.cookingSessionRecipes)
        .innerJoin(schema.recipeVersions, eq(schema.cookingSessionRecipes.recipeVersionId, schema.recipeVersions.id))
        .innerJoin(schema.recipes, eq(schema.recipeVersions.recipeId, schema.recipes.id))
        .where(eq(schema.cookingSessionRecipes.cookingSessionId, session.id));

      if (linked.length > 0) {
        const recipeList = linked.map((r) => `**${r.recipeName} (v${r.versionNumber})**`).join(', ');
        timeline += `- **Receitas Preparadas:** ${recipeList}\n`;
      }

      if (session.overallRating) timeline += `- **Avaliação Média:** ${'⭐'.repeat(Math.round(session.overallRating))} (${session.overallRating}/5)\n`;
      if (session.mood) timeline += `- **Humor:** ${session.mood}\n`;
      
      // Diary learnings
      if (session.learnings || session.errors || session.neverAgain) {
        timeline += `#### 💡 Diário de Aprendizado:\n`;
        if (session.learnings) timeline += `  * **O que aprendi:** _"${session.learnings}"_\n`;
        if (session.successes) timeline += `  * **Acertos:** _"${session.successes}"_\n`;
        if (session.errors) timeline += `  * **Erros:** _"${session.errors}"_\n`;
        if (session.neverAgain) timeline += `  * **🚨 Nunca mais devo:** _"${session.neverAgain}"_\n`;
        if (session.whyWorked) timeline += `  * **Funcionou porque:** _"${session.whyWorked}"_\n`;
        if (session.nextAttemptSuggestions) timeline += `  * **Na próxima tentativa:** _"${session.nextAttemptSuggestions}"_\n`;
      }
      timeline += `\n`;
    }
  } else {
    timeline += `_Nenhuma sessão de cozinha registrada ainda. Use a ferramenta de Cooking Session para começar a registrar sua história!_\n`;
  }

  return timeline;
}
