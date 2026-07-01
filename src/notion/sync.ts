import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { notion } from './client.js';
import { eq, isNull } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mappingsFilePath = path.join(__dirname, '../../notion_databases.json');

// Helper to check if Notion mappings exist
function getDbIds() {
  if (!fs.existsSync(mappingsFilePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(mappingsFilePath, 'utf8'));
  } catch {
    return null;
  }
}

export function getIngredientEmoji(category: string, name: string): string {
  const cat = category.toLowerCase();
  const n = name.toLowerCase();
  if (cat.includes('proteína') || cat.includes('carne') || cat.includes('peixe') || cat.includes('frango')) {
    if (n.includes('peixe') || n.includes('fish') || n.includes('salmão') || n.includes('atum')) return '🐟';
    if (n.includes('frango') || n.includes('chicken') || n.includes('ave') || n.includes('pato')) return '🍗';
    return '🥩';
  }
  if (cat.includes('vegetal') || cat.includes('verdura') || cat.includes('legume') || cat.includes('fruta')) {
    if (n.includes('tomate')) return '🍅';
    if (n.includes('cenoura')) return '🥕';
    if (n.includes('maçã')) return '🍎';
    if (n.includes('limão') || n.includes('lemon')) return '🍋';
    if (n.includes('alho') || n.includes('onion') || n.includes('cebola')) return '🧅';
    return '🥦';
  }
  if (cat.includes('laticínio') || cat.includes('queijo') || cat.includes('leite')) {
    if (n.includes('leite') || n.includes('milk')) return '🥛';
    if (n.includes('manteiga') || n.includes('butter')) return '🧈';
    return '🧀';
  }
  if (cat.includes('tempero') || cat.includes('erva') || cat.includes('sal')) {
    if (n.includes('pimenta') || n.includes('chili') || n.includes('pepper')) return '🌶️';
    if (n.includes('sal') || n.includes('salt')) return '🧂';
    return '🌿';
  }
  if (cat.includes('grão') || cat.includes('cereal') || cat.includes('massa') || cat.includes('farinha')) {
    if (n.includes('pão') || n.includes('bread')) return '🍞';
    if (n.includes('arroz') || n.includes('rice')) return '🍚';
    return '🌾';
  }
  return '🥫';
}

export function getTechniqueEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('cortar') || n.includes('picar') || n.includes('fatiar') || n.includes('desossar') || n.includes('chop') || n.includes('slice')) return '🔪';
  if (n.includes('assar') || n.includes('forno') || n.includes('bake')) return '🍳';
  return '🔥';
}

export function getRecipeEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bolo') || n.includes('cake') || n.includes('tart') || n.includes('pie') || n.includes('torta') || n.includes('doce')) return '🍰';
  if (n.includes('sopa') || n.includes('soup') || n.includes('caldo') || n.includes('stew')) return '🍲';
  if (n.includes('carne') || n.includes('beef') || n.includes('steak') || n.includes('kebab') || n.includes('lamb') || n.includes('goat')) return '🍖';
  if (n.includes('frango') || n.includes('chicken') || n.includes('patte')) return '🍗';
  if (n.includes('peixe') || n.includes('fish') || n.includes('salmon')) return '🐟';
  if (n.includes('salada') || n.includes('salad') || n.includes('vegetal') || n.includes('vegan') || n.includes('lasagna')) return '🥗';
  if (n.includes('massa') || n.includes('pasta') || n.includes('spaghetti') || n.includes('macaroni')) return '🍝';
  if (n.includes('pão') || n.includes('bread') || n.includes('bun')) return '🍞';
  return '🍳';
}

// Helper to write text blocks to Notion
function textProperty(content: string) {
  return {
    rich_text: [
      {
        text: {
          content: content.substring(0, 2000), // Notion max length limit per block
        },
      },
    ],
  };
}

// Helper for title
function titleProperty(content: string) {
  return {
    title: [
      {
        text: {
          content: content.substring(0, 100),
        },
      },
    ],
  };
}

// Helper for select
function selectProperty(name: string) {
  return {
    select: {
      name,
    },
  };
}

// Helper for date
function dateProperty(isoString: string) {
  // Extract YYYY-MM-DD
  const dateOnly = isoString.split(' ')[0].split('T')[0];
  return {
    date: {
      start: dateOnly,
    },
  };
}

// Helper for relation
function relationProperty(notionPageId: string) {
  return {
    relation: [
      {
        id: notionPageId,
      },
    ],
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncNotionToSqlite(limit = 20) {
  const dbIds = getDbIds();
  if (!dbIds) {
    console.warn('Skipping Notion Sync: notion_databases.json not found. Run "npm run notion:setup" first.');
    return { status: 'skipped', reason: 'notion_databases.json not found' };
  }

  const syncLog: string[] = [];
  console.log(`Starting SQLite -> Notion incremental sync (limit per table: ${limit})...`);

  try {
    // 1. Sync Cuisines
    if (dbIds.cuisines) {
      const pending = await db.select().from(schema.cuisines).where(isNull(schema.cuisines.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.cuisines },
            icon: {
              type: 'emoji',
              emoji: '📒',
            },
            properties: {
              Name: titleProperty(item.name),
            },
          });
          await db.update(schema.cuisines).set({ notionPageId: page.id }).where(eq(schema.cuisines.id, item.id));
          const msg = `Cuisine synced: ${item.name}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing cuisine ${item.name}:`, e.message);
        }
      }
    }

    // 2. Sync Ingredients
    if (dbIds.ingredients) {
      const pending = await db.select().from(schema.ingredients).where(isNull(schema.ingredients.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          await sleep(350);
          const profile = item.flavorProfile ? JSON.parse(item.flavorProfile) : {};
          const profileTags = Object.keys(profile).filter((k) => profile[k] && profile[k] > 0);

          const page = await notion.pages.create({
            parent: { database_id: dbIds.ingredients },
            icon: {
              type: 'emoji',
              emoji: getIngredientEmoji(item.category, item.name),
            },
            properties: {
              Ingrediente: titleProperty(item.name),
              Categoria: selectProperty(item.category),
              'Unidade Padrão': selectProperty(item.defaultUnit),
              'Evitar Gengibre': { checkbox: item.avoidsGinger },
              'Perfil de Sabor': {
                multi_select: profileTags.map((name) => ({ name })),
              },
              ...(item.pricePerUnit !== null ? { 'Preço por Unidade': { number: item.pricePerUnit } } : {}),
              'Unidade Financeira': textProperty(item.priceUnit),
            },
          });
          await db.update(schema.ingredients).set({ notionPageId: page.id }).where(eq(schema.ingredients.id, item.id));
          const msg = `Ingredient synced: ${item.name}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing ingredient ${item.name}:`, e.message);
        }
      }
    }

    // 3. Sync Techniques
    if (dbIds.techniques) {
      const pending = await db.select().from(schema.techniques).where(isNull(schema.techniques.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.techniques },
            icon: {
              type: 'emoji',
              emoji: getTechniqueEmoji(item.name),
            },
            properties: {
              Técnica: titleProperty(item.name),
              Descrição: textProperty(item.description ?? ''),
              Dificuldade: selectProperty(item.difficulty),
              'Impacto no Sabor': textProperty(item.flavorImpact ?? ''),
              'Nível de Domínio': { number: item.masteryLevel },
            },
          });
          await db.update(schema.techniques).set({ notionPageId: page.id }).where(eq(schema.techniques.id, item.id));
          const msg = `Technique synced: ${item.name}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing technique ${item.name}:`, e.message);
        }
      }
    }

    // 4. Sync Recipes
    if (dbIds.recipes) {
      const pending = await db.select().from(schema.recipes).where(isNull(schema.recipes.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          await sleep(350);
          let cuisineRelation: any = {};
          if (item.cuisineId) {
            const cuisine = await db.query.cuisines.findFirst({ where: eq(schema.cuisines.id, item.cuisineId) });
            if (cuisine?.notionPageId) {
              cuisineRelation = { Nacionalidade: relationProperty(cuisine.notionPageId) };
            }
          }

          const cleanName = item.name.replace(/\(Importada\)/g, '').trim();
          const page = await notion.pages.create({
            parent: { database_id: dbIds.recipes },
            icon: {
              type: 'emoji',
              emoji: getRecipeEmoji(item.name),
            },
            cover: {
              type: 'external',
              external: {
                url: `https://loremflickr.com/800/600/food,${encodeURIComponent(cleanName)}`,
              },
            },
            properties: {
              Nome: titleProperty(item.name),
              Descrição: textProperty(item.description ?? ''),
              Favorito: { checkbox: item.isFavorite },
              História: textProperty(item.history ?? ''),
              Objetivo: textProperty(item.objective ?? ''),
              'Equipamento Preferido': textProperty(item.preferredEquipment ?? ''),
              'Motivo da Preferência': textProperty(item.preferenceReason ?? ''),
              ...cuisineRelation,
            },
          });
          await db.update(schema.recipes).set({ notionPageId: page.id }).where(eq(schema.recipes.id, item.id));
          const msg = `Recipe synced: ${item.name}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing recipe ${item.name}:`, e.message);
        }
      }
    }

    // 5. Sync Recipe Versions
    if (dbIds.recipeVersions) {
      const pending = await db.select().from(schema.recipeVersions).where(isNull(schema.recipeVersions.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const recipe = await db.query.recipes.findFirst({ where: eq(schema.recipes.id, item.recipeId) });
          if (!recipe?.notionPageId) continue; // wait for parent

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.recipeVersions },
            icon: {
              type: 'emoji',
              emoji: '⚙️',
            },
            properties: {
              Versão: titleProperty(`${recipe.name} v${item.versionNumber}`),
              'Receita Pai': relationProperty(recipe.notionPageId),
              Modificações: textProperty(item.description ?? ''),
              Porções: { number: item.yieldPortions },
              Congelável: { checkbox: item.isFreezerFriendly },
              'Tempo Estimado (Min)': { number: item.estimatedTimeMinutes ?? 0 },
              Dificuldade: selectProperty(item.difficulty),
              ...(item.calories !== null ? { 'Calorias (kcal)': { number: item.calories } } : {}),
              ...(item.proteinGrams !== null ? { 'Proteínas (g)': { number: item.proteinGrams } } : {}),
              ...(item.carbsGrams !== null ? { 'Carboidratos (g)': { number: item.carbsGrams } } : {}),
              ...(item.fatGrams !== null ? { 'Gorduras (g)': { number: item.fatGrams } } : {}),
            },
          });
          await db.update(schema.recipeVersions).set({ notionPageId: page.id }).where(eq(schema.recipeVersions.id, item.id));
          const msg = `Recipe version synced: ${recipe.name} v${item.versionNumber}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing version ${item.name}:`, e.message);
        }
      }
    }

    // 6. Sync Recipe Ingredients
    if (dbIds.recipeIngredients) {
      const pending = await db.select().from(schema.recipeIngredients).where(isNull(schema.recipeIngredients.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
          const ingredient = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, item.ingredientId) });
          if (!version?.notionPageId || !ingredient?.notionPageId) continue; // wait for parents

          const recipe = await db.query.recipes.findFirst({ where: eq(schema.recipes.id, version.recipeId) });
          const recipeName = recipe ? recipe.name : 'Receita';

          const itemName = `${item.amount}${item.unit} de ${ingredient.name} em ${recipeName} v${version.versionNumber}`;

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.recipeIngredients },
            icon: {
              type: 'emoji',
              emoji: '🌾',
            },
            properties: {
              'Nome do Item': titleProperty(itemName),
              'Versão da Receita': relationProperty(version.notionPageId),
              'Ingrediente Base': relationProperty(ingredient.notionPageId),
              Quantidade: { number: item.amount },
              Unidade: selectProperty(item.unit),
              Notas: textProperty(item.notes ?? ''),
              Opcional: { checkbox: item.isOptional },
            },
          });
          await db.update(schema.recipeIngredients).set({ notionPageId: page.id }).where(eq(schema.recipeIngredients.id, item.id));
          const msg = `Recipe ingredient synced: ${itemName}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing recipe ingredient:`, e.message);
        }
      }
    }

    // 7. Sync Recipe Techniques
    if (dbIds.recipeTechniques) {
      const pending = await db.select().from(schema.recipeTechniques).where(isNull(schema.recipeTechniques.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
          const technique = await db.query.techniques.findFirst({ where: eq(schema.techniques.id, item.techniqueId) });
          if (!version?.notionPageId || !technique?.notionPageId) continue; // wait for parents

          const recipe = await db.query.recipes.findFirst({ where: eq(schema.recipes.id, version.recipeId) });
          const recipeName = recipe ? recipe.name : 'Receita';

          const itemName = `${item.stepOrder}. ${technique.name} em ${recipeName} v${version.versionNumber}`;

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.recipeTechniques },
            icon: {
              type: 'emoji',
              emoji: '🍳',
            },
            properties: {
              'Nome do Item': titleProperty(itemName),
              'Versão da Receita': relationProperty(version.notionPageId),
              'Técnica Base': relationProperty(technique.notionPageId),
              Ordem: { number: item.stepOrder },
              Notas: textProperty(item.notes ?? ''),
            },
          });
          await db.update(schema.recipeTechniques).set({ notionPageId: page.id }).where(eq(schema.recipeTechniques.id, item.id));
          const msg = `Recipe technique synced: ${itemName}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing recipe technique:`, e.message);
        }
      }
    }

    // 8. Sync Experiments
    if (dbIds.experiments) {
      const pending = await db.select().from(schema.experiments).where(isNull(schema.experiments.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
          if (!version?.notionPageId) continue; // wait for parent

          const recipe = await db.query.recipes.findFirst({ where: eq(schema.recipes.id, version.recipeId) });
          const recipeName = recipe ? recipe.name : 'Receita';

          const stars = '⭐'.repeat(item.rating);

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.experiments },
            icon: {
              type: 'emoji',
              emoji: '🧪',
            },
            properties: {
              'Nome do Experimento': titleProperty(`${recipeName} v${version.versionNumber} - ${item.cookedAt.split(' ')[0]}`),
              'Versão Testada': relationProperty(version.notionPageId),
              Data: dateProperty(item.cookedAt),
              'Porções Preparadas': { number: item.servingsCooked },
              'Peso da Proteína (g)': { number: item.proteinWeightGrams },
              Avaliação: selectProperty(stars),
              'O que deu certo': textProperty(item.outcomeNotes),
              'O que mudar na próxima versão': textProperty(item.deltaNotes ?? ''),
            },
          });
          await db.update(schema.experiments).set({ notionPageId: page.id }).where(eq(schema.experiments.id, item.id));
          const msg = `Experiment synced for: ${recipeName} v${version.versionNumber}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing experiment:`, e.message);
        }
      }
    }

    // 9. Sync Inventory
    if (dbIds.inventories) {
      const pending = await db.select().from(schema.inventories).where(isNull(schema.inventories.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const ingredient = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, item.ingredientId) });
          if (!ingredient?.notionPageId) continue; // wait for ingredient

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.inventories },
            icon: {
              type: 'emoji',
              emoji: '📦',
            },
            properties: {
              Item: titleProperty(ingredient.name),
              'Ingrediente Base': relationProperty(ingredient.notionPageId),
              Quantidade: { number: item.amount },
              Unidade: selectProperty(item.unit),
              Localização: selectProperty(item.location),
              ...(item.expirationDate ? { 'Data de Validade': dateProperty(item.expirationDate) } : {}),
            },
          });
          await db.update(schema.inventories).set({ notionPageId: page.id }).where(eq(schema.inventories.id, item.id));
          const msg = `Inventory synced: ${ingredient.name}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing inventory item:`, e.message);
        }
      }
    }

    // 10. Sync Shopping List
    if (dbIds.shoppingLists) {
      const pending = await db.select().from(schema.shoppingLists).where(isNull(schema.shoppingLists.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const ingredient = await db.query.ingredients.findFirst({ where: eq(schema.ingredients.id, item.ingredientId) });
          if (!ingredient?.notionPageId) continue;

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.shoppingLists },
            icon: {
              type: 'emoji',
              emoji: '🛒',
            },
            properties: {
              Item: titleProperty(ingredient.name),
              'Ingrediente Base': relationProperty(ingredient.notionPageId),
              'Quantidade Necessária': { number: item.amountNeeded },
              Unidade: selectProperty(item.unit),
              Comprado: { checkbox: item.isPurchased },
            },
          });
          await db.update(schema.shoppingLists).set({ notionPageId: page.id }).where(eq(schema.shoppingLists.id, item.id));
          const msg = `Shopping item synced: ${ingredient.name}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing shopping item:`, e.message);
        }
      }
    }

    // 11. Sync Meal Plans
    if (dbIds.mealPlans) {
      const pending = await db.select().from(schema.mealPlans).where(isNull(schema.mealPlans.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
          if (!version?.notionPageId) continue;

          const recipe = await db.query.recipes.findFirst({ where: eq(schema.recipes.id, version.recipeId) });
          const recipeName = recipe ? recipe.name : 'Receita';

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.mealPlans },
            icon: {
              type: 'emoji',
              emoji: '📅',
            },
            properties: {
              Refeição: titleProperty(`${item.mealType} - ${recipeName}`),
              Data: dateProperty(item.date),
              Tipo: selectProperty(item.mealType === 'Lunch' ? 'Almoço' : item.mealType === 'Dinner' ? 'Jantar' : 'Marmita'),
              Servings: { number: item.servings },
              Cozinhado: { checkbox: item.isCooked },
              'Versão da Receita': relationProperty(version.notionPageId),
            },
          });
          await db.update(schema.mealPlans).set({ notionPageId: page.id }).where(eq(schema.mealPlans.id, item.id));
          const msg = `Meal plan synced: ${item.mealType} - ${recipeName}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing meal plan:`, e.message);
        }
      }
    }

    // 12. Sync Cooking Sessions
    if (dbIds.cookingSessions) {
      const pending = await db.select().from(schema.cookingSessions).where(isNull(schema.cookingSessions.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.cookingSessions },
            icon: {
              type: 'emoji',
              emoji: '📅',
            },
            properties: {
              Sessão: titleProperty(item.generalNotes ? `Sessão: ${item.generalNotes.substring(0, 50)}` : `Sessão #${item.id} - ${item.date}`),
              Data: dateProperty(item.date),
              Início: textProperty(item.startTime ?? ''),
              Fim: textProperty(item.endTime ?? ''),
              ...(item.durationMinutes !== null ? { 'Duração (Min)': { number: item.durationMinutes } } : {}),
              Local: textProperty(item.location ?? ''),
              'Equipamento Utilizado': textProperty(item.equipmentUsed ?? ''),
              ...(item.mood ? { Humor: selectProperty(item.mood) } : {}),
              Chef: textProperty(item.chef ?? ''),
              Participantes: textProperty(item.participants ?? ''),
              ...(item.overallRating !== null ? { 'Avaliação Geral': { number: item.overallRating } } : {}),
              'O que aprendi': textProperty(item.learnings ?? ''),
              'Erros cometidos': textProperty(item.errors ?? ''),
              Acertos: textProperty(item.successes ?? ''),
              'Nunca mais devo': textProperty(item.neverAgain ?? ''),
              'Funcionou porque': textProperty(item.whyWorked ?? ''),
              'Próxima tentativa': textProperty(item.nextAttemptSuggestions ?? ''),
              'Observações Gerais': textProperty(item.generalNotes ?? ''),
            },
          });
          await db.update(schema.cookingSessions).set({ notionPageId: page.id }).where(eq(schema.cookingSessions.id, item.id));
          const msg = `Cooking session synced: ${item.id}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing cooking session #${item.id}:`, e.message);
        }
      }
    }

    // 13. Sync Cooking Session Recipes pivot relations
    if (dbIds.cookingSessions && dbIds.recipeVersions) {
      const pending = await db.select().from(schema.cookingSessionRecipes).where(isNull(schema.cookingSessionRecipes.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const session = await db.query.cookingSessions.findFirst({ where: eq(schema.cookingSessions.id, item.cookingSessionId) });
          const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
          if (!session?.notionPageId || !version?.notionPageId) continue; // wait for parent pages

          await sleep(350);
          // Link them by updating relation field in the cookingSession page
          await notion.pages.update({
            page_id: session.notionPageId,
            properties: {
              'Receitas Preparadas': {
                relation: [
                  { id: version.notionPageId }
                ]
              }
            }
          });

          await db.update(schema.cookingSessionRecipes).set({ notionPageId: `rel_${item.id}` }).where(eq(schema.cookingSessionRecipes.id, item.id));
          const msg = `Link synced between Session ${item.cookingSessionId} and Recipe Version ${item.recipeVersionId}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing session-recipe link:`, e.message);
        }
      }
    }

    // 14. Sync Ratings
    if (dbIds.ratings) {
      const pending = await db.select().from(schema.ratings).where(isNull(schema.ratings.notionPageId)).limit(limit);
      for (const item of pending) {
        try {
          const session = await db.query.cookingSessions.findFirst({ where: eq(schema.cookingSessions.id, item.cookingSessionId) });
          const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
          if (!session?.notionPageId || !version?.notionPageId) continue;

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.ratings },
            icon: {
              type: 'emoji',
              emoji: '⭐',
            },
            properties: {
              Avaliador: titleProperty(`${item.reviewerName} - ${item.rating}/5`),
              Nota: { number: item.rating },
              Comentário: textProperty(item.comment ?? ''),
              'Comeria de novo': { checkbox: item.wouldEatAgain },
              'Mudanças Sugeridas': textProperty(item.suggestedChanges ?? ''),
              'Sessão de Cozinha': relationProperty(session.notionPageId),
              'Versão da Receita': relationProperty(version.notionPageId),
            },
          });
          await db.update(schema.ratings).set({ notionPageId: page.id }).where(eq(schema.ratings.id, item.id));
          const msg = `Review synced from ${item.reviewerName} for session ${item.cookingSessionId}`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing review:`, e.message);
        }
      }
    }

    // 15. Sync Photos
    if (dbIds.photos) {
      const pending = await db.select().from(schema.photos).where(isNull(schema.photos.notionUrl)).limit(limit);
      for (const item of pending) {
        try {
          let parentRelation: any = {};
          if (item.cookingSessionId) {
            const session = await db.query.cookingSessions.findFirst({ where: eq(schema.cookingSessions.id, item.cookingSessionId) });
            if (session?.notionPageId) {
              parentRelation['Sessão de Cozinha'] = relationProperty(session.notionPageId);
            }
          }
          if (item.recipeVersionId) {
            const version = await db.query.recipeVersions.findFirst({ where: eq(schema.recipeVersions.id, item.recipeVersionId) });
            if (version?.notionPageId) {
              parentRelation['Versão da Receita'] = relationProperty(version.notionPageId);
            }
          }

          await sleep(350);
          const page = await notion.pages.create({
            parent: { database_id: dbIds.photos },
            icon: {
              type: 'emoji',
              emoji: '🖼️',
            },
            properties: {
              Foto: titleProperty(item.caption ?? `Foto #${item.id}`),
              'URL da Imagem': { url: item.localPath ?? 'https://loremflickr.com/800/600/food' },
              Data: dateProperty(item.createdAt),
              Notas: textProperty(item.notes ?? ''),
              ...parentRelation,
            },
          });

          await db.update(schema.photos).set({ notionUrl: (page as any).url }).where(eq(schema.photos.id, item.id));
          const msg = `Photo #${item.id} synced to Notion database.`;
          console.log(`[Notion Sync] ${msg}`);
          syncLog.push(msg);
        } catch (e: any) {
          console.error(`Error syncing photo:`, e.message);
        }
      }
    }

    // 16. Sync/Update Objectives
    if (dbIds.objectives) {
      const allObjs = await db.select().from(schema.objectives);
      for (const item of allObjs) {
        try {
          await sleep(350);
          const props: any = {
            Objetivo: titleProperty(item.name),
            Descrição: textProperty(item.description ?? ''),
            Status: selectProperty(item.status),
            'Meta Total': { number: item.targetCount },
            'Concluídas': { number: item.currentCount },
          };

          if (item.notionPageId) {
            // Update existing page
            await notion.pages.update({
              page_id: item.notionPageId,
              properties: props,
            });
            console.log(`[Notion Sync] Objective "${item.name}" updated in Notion.`);
          } else {
            // Create new page
            const page = await notion.pages.create({
              parent: { database_id: dbIds.objectives },
              icon: {
                type: 'emoji',
                emoji: '🎯',
              },
              properties: props,
            });
            await db.update(schema.objectives).set({ notionPageId: page.id }).where(eq(schema.objectives.id, item.id));
            const msg = `Objective "${item.name}" created in Notion.`;
            console.log(`[Notion Sync] ${msg}`);
            syncLog.push(msg);
          }
        } catch (e: any) {
          console.error(`Error syncing objective "${item.name}":`, e.message);
        }
      }
    }

    // 17. Sync/Update Missions
    if (dbIds.missions) {
      const allMissions = await db.select().from(schema.missions);
      for (const item of allMissions) {
        try {
          // Resolve objective relation
          let parentRelation: any = {};
          const obj = await db.query.objectives.findFirst({ where: eq(schema.objectives.id, item.objectiveId) });
          if (obj?.notionPageId) {
            parentRelation['Objetivo Associado'] = relationProperty(obj.notionPageId);
          }

          // Resolve technique relation
          const tech = await db.query.techniques.findFirst({ where: eq(schema.techniques.id, item.techniqueId) });
          if (tech?.notionPageId) {
            parentRelation['Técnica Culinária'] = relationProperty(tech.notionPageId);
          }

          await sleep(350);
          const pageProperties: any = {
            Missão: titleProperty(item.name),
            Descrição: textProperty(item.description ?? ''),
            Status: selectProperty(item.status),
            ...parentRelation,
          };

          if (item.completedAt) {
            pageProperties['Concluído Em'] = dateProperty(item.completedAt);
          }

          if (item.notionPageId) {
            // Update existing page
            await notion.pages.update({
              page_id: item.notionPageId,
              properties: pageProperties,
            });
            console.log(`[Notion Sync] Mission "${item.name}" updated in Notion.`);
          } else {
            // Create new page
            const page = await notion.pages.create({
              parent: { database_id: dbIds.missions },
              icon: {
                type: 'emoji',
                emoji: '🏆',
              },
              properties: pageProperties,
            });
            await db.update(schema.missions).set({ notionPageId: page.id }).where(eq(schema.missions.id, item.id));
            const msg = `Mission "${item.name}" created in Notion.`;
            console.log(`[Notion Sync] ${msg}`);
            syncLog.push(msg);
          }
        } catch (e: any) {
          console.error(`Error syncing mission "${item.name}":`, e.message);
        }
      }
    }

    // 18. Sync/Update Health Goals
    if (dbIds.healthGoals) {
      const allGoals = await db.select().from(schema.healthGoals);
      for (const item of allGoals) {
        try {
          await sleep(350);
          const props: any = {
            Meta: titleProperty(`Meta ${item.goalType} - ${item.createdAt.split(' ')[0]}`),
            Tipo: selectProperty(item.goalType),
            'Peso Alvo (kg)': { number: item.targetWeightKg },
            'Calorias Alvo (kcal)': { number: item.targetCalories },
            'Proteínas Alvo (g)': { number: item.targetProtein },
            'Carboidratos Alvo (g)': { number: item.targetCarbs },
            'Gorduras Alvo (g)': { number: item.targetFat },
            'Água Alvo (ml)': { number: item.targetWaterMl },
            Status: selectProperty(item.status),
          };

          if (item.notionPageId) {
            await notion.pages.update({
              page_id: item.notionPageId,
              properties: props,
            });
            console.log(`[Notion Sync] Health Goal #${item.id} updated in Notion.`);
          } else {
            const page = await notion.pages.create({
              parent: { database_id: dbIds.healthGoals },
              icon: {
                type: 'emoji',
                emoji: '🎯',
              },
              properties: props,
            });
            await db.update(schema.healthGoals).set({ notionPageId: page.id }).where(eq(schema.healthGoals.id, item.id));
            const msg = `Health Goal #${item.id} (${item.goalType}) created in Notion.`;
            console.log(`[Notion Sync] ${msg}`);
            syncLog.push(msg);
          }
        } catch (e: any) {
          console.error(`Error syncing health goal #${item.id}:`, e.message);
        }
      }
    }

    // 19. Sync/Update Daily Nutrition Logs
    if (dbIds.nutritionLogs) {
      const allLogs = await db.select().from(schema.nutritionLogs);
      for (const item of allLogs) {
        try {
          await sleep(350);
          const props: any = {
            Data: titleProperty(item.date),
            'Calorias Consumidas (kcal)': { number: item.calories },
            'Proteínas Consumidas (g)': { number: item.protein },
            'Carboidratos Consumidos (g)': { number: item.carbs },
            'Gorduras Consumidas (g)': { number: item.fat },
            'Água Ingerida (ml)': { number: item.waterIntakeMl },
          };

          if (item.weightKg !== null) {
            props['Peso Corporal (kg)'] = { number: item.weightKg };
          }

          if (item.notionPageId) {
            await notion.pages.update({
              page_id: item.notionPageId,
              properties: props,
            });
            console.log(`[Notion Sync] Nutrition log for date ${item.date} updated in Notion.`);
          } else {
            const page = await notion.pages.create({
              parent: { database_id: dbIds.nutritionLogs },
              icon: {
                type: 'emoji',
                emoji: '🩺',
              },
              properties: props,
            });
            await db.update(schema.nutritionLogs).set({ notionPageId: page.id }).where(eq(schema.nutritionLogs.id, item.id));
            const msg = `Nutrition log for date ${item.date} created in Notion.`;
            console.log(`[Notion Sync] ${msg}`);
            syncLog.push(msg);
          }
        } catch (e: any) {
          console.error(`Error syncing nutrition log for ${item.date}:`, e.message);
        }
      }
    }

    // 20. Sync/Update Equipments
    if (dbIds.equipments) {
      const allEquipments = await db.select().from(schema.userEquipments);
      for (const item of allEquipments) {
        try {
          await sleep(350);
          const props: any = {
            Nome: titleProperty(item.name),
            Disponível: { checkbox: !!item.isAvailable },
          };

          if (item.notionPageId) {
            await notion.pages.update({
              page_id: item.notionPageId,
              properties: props,
            });
            console.log(`[Notion Sync] Equipment "${item.name}" updated in Notion.`);
          } else {
            const page = await notion.pages.create({
              parent: { database_id: dbIds.equipments },
              icon: {
                type: 'emoji',
                emoji: '🔧',
              },
              properties: props,
            });
            await db.update(schema.userEquipments).set({ notionPageId: page.id }).where(eq(schema.userEquipments.id, item.id));
            const msg = `Equipment "${item.name}" created in Notion.`;
            console.log(`[Notion Sync] ${msg}`);
            syncLog.push(msg);
          }
        } catch (e: any) {
          console.error(`Error syncing equipment "${item.name}":`, e.message);
        }
      }
    }

    // 21. Sync/Update Adaptations
    if (dbIds.adaptations) {
      const allAdaptations = await db.select().from(schema.recipeAdaptations);
      for (const item of allAdaptations) {
        try {
          await sleep(350);
          
          // Get recipe version notionPageId
          const version = await db.query.recipeVersions.findFirst({
            where: eq(schema.recipeVersions.id, item.recipeVersionId)
          });
          const recipePageId = version?.notionPageId;

          // Get session notionPageId
          let sessionPageId = null;
          if (item.cookingSessionId) {
            const session = await db.query.cookingSessions.findFirst({
              where: eq(schema.cookingSessions.id, item.cookingSessionId)
            });
            sessionPageId = session?.notionPageId;
          }

          // Format steps list as text
          let stepsText = '';
          try {
            const stepsList = JSON.parse(item.adaptationsApplied);
            stepsText = stepsList.map((s: any) => `Etapa ${s.stepOrder}:\nOriginal: ${s.originalText}\nAdaptado: ${s.adaptedText}\nMotivo: ${s.reason}`).join('\n\n');
          } catch {
            stepsText = item.adaptationsApplied;
          }

          const props: any = {
            Identificador: titleProperty(`Adaptação #${item.id} - ${item.targetEquipment}`),
            'Equipamento Original': textProperty(item.sourceEquipment),
            'Equipamento Alvo': textProperty(item.targetEquipment),
            'Adaptações Aplicadas': textProperty(stepsText),
            Confiança: { number: item.confidence / 100 },
          };

          if (item.feedbackRating) {
            props.Feedback = selectProperty(item.feedbackRating);
          }

          if (recipePageId) {
            props['Versão da Receita'] = relationProperty(recipePageId);
          }
          if (sessionPageId) {
            props['Sessão de Cozinha'] = relationProperty(sessionPageId);
          }

          if (item.notionPageId) {
            await notion.pages.update({
              page_id: item.notionPageId,
              properties: props,
            });
            console.log(`[Notion Sync] Adaptation #${item.id} updated in Notion.`);
          } else {
            const page = await notion.pages.create({
              parent: { database_id: dbIds.adaptations },
              icon: {
                type: 'emoji',
                emoji: '🔄',
              },
              properties: props,
            });
            await db.update(schema.recipeAdaptations).set({ notionPageId: page.id }).where(eq(schema.recipeAdaptations.id, item.id));
            const msg = `Adaptation #${item.id} created in Notion.`;
            console.log(`[Notion Sync] ${msg}`);
            syncLog.push(msg);
          }
        } catch (e: any) {
          console.error(`Error syncing adaptation #${item.id}:`, e.message);
        }
      }
    }

    console.log('SQLite -> Notion incremental sync completed!');
    return { status: 'success', synced: syncLog };
  } catch (error: any) {
    console.error('Fatal error during synchronization:', error);
    throw error;
  }
}

// Standalone execution trigger
if (process.argv[1] && (process.argv[1].endsWith('sync.ts') || process.argv[1].endsWith('sync.js'))) {
  console.log('Executing standalone sync...');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? parseInt(limitArg.split('=')[1]) : 20;
  syncNotionToSqlite(parsedLimit).then(res => {
    console.log('Sync result:', res);
  }).catch(err => {
    console.error('Standalone sync failed:', err);
  });
}
