import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { notion } from './client.js';
import { isNotNull, eq } from 'drizzle-orm';
import { getRecipeEmoji, getIngredientEmoji, getTechniqueEmoji } from './sync.js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateExistingVisuals() {
  console.log('\n======================================================');
  console.log('🎨 RETROACTIVE VISUAL UPDATE: APPLYING ICONS & COVERS');
  console.log('======================================================\n');

  // 1. Update existing Recipes (Icon & Cover)
  console.log('Checking recipes that need visual updates...');
  const syncedRecipes = await db.select().from(schema.recipes).where(isNotNull(schema.recipes.notionPageId));
  console.log(`Found ${syncedRecipes.length} synced recipes in SQLite.`);

  let recipeCount = 0;
  for (const recipe of syncedRecipes) {
    if (!recipe.notionPageId) continue;
    try {
      recipeCount++;
      const emoji = getRecipeEmoji(recipe.name);
      const cleanName = recipe.name.replace(/\(Importada\)/g, '').trim();
      const coverUrl = `https://loremflickr.com/800/600/food,${encodeURIComponent(cleanName)}`;

      console.log(`[Recipe #${recipeCount}/${syncedRecipes.length}] Updating "${recipe.name}" (Page: ${recipe.notionPageId})`);
      
      await sleep(350);
      await notion.pages.update({
        page_id: recipe.notionPageId,
        icon: {
          type: 'emoji',
          emoji: emoji,
        },
        cover: {
          type: 'external',
          external: {
            url: coverUrl,
          },
        },
      });
    } catch (e: any) {
      console.error(`❌ Failed to update recipe "${recipe.name}":`, e.message);
    }
  }

  // 2. Update existing Ingredients (Icon)
  console.log('\nChecking ingredients that need visual updates...');
  const syncedIngredients = await db.select().from(schema.ingredients).where(isNotNull(schema.ingredients.notionPageId));
  console.log(`Found ${syncedIngredients.length} synced ingredients in SQLite.`);

  let ingredientCount = 0;
  for (const ing of syncedIngredients) {
    if (!ing.notionPageId) continue;
    try {
      ingredientCount++;
      const emoji = getIngredientEmoji(ing.category, ing.name);

      console.log(`[Ingredient #${ingredientCount}/${syncedIngredients.length}] Updating "${ing.name}" (Page: ${ing.notionPageId})`);
      
      await sleep(350);
      await notion.pages.update({
        page_id: ing.notionPageId,
        icon: {
          type: 'emoji',
          emoji: emoji,
        },
      });
    } catch (e: any) {
      console.error(`❌ Failed to update ingredient "${ing.name}":`, e.message);
    }
  }

  // 3. Update existing Cuisines (Icon)
  console.log('\nChecking cuisines that need visual updates...');
  const syncedCuisines = await db.select().from(schema.cuisines).where(isNotNull(schema.cuisines.notionPageId));
  for (const cuisine of syncedCuisines) {
    if (!cuisine.notionPageId) continue;
    try {
      console.log(`Updating cuisine "${cuisine.name}"...`);
      await sleep(350);
      await notion.pages.update({
        page_id: cuisine.notionPageId,
        icon: {
          type: 'emoji',
          emoji: '📒',
        },
      });
    } catch (e: any) {
      console.error(`❌ Failed to update cuisine "${cuisine.name}":`, e.message);
    }
  }

  // 4. Update existing Techniques (Icon)
  console.log('\nChecking techniques that need visual updates...');
  const syncedTechniques = await db.select().from(schema.techniques).where(isNotNull(schema.techniques.notionPageId));
  for (const tech of syncedTechniques) {
    if (!tech.notionPageId) continue;
    try {
      const emoji = getTechniqueEmoji(tech.name);
      console.log(`Updating technique "${tech.name}"...`);
      await sleep(350);
      await notion.pages.update({
        page_id: tech.notionPageId,
        icon: {
          type: 'emoji',
          emoji: emoji,
        },
      });
    } catch (e: any) {
      console.error(`❌ Failed to update technique "${tech.name}":`, e.message);
    }
  }

  console.log('\n🎨 ALL EXISTING VISUAL UPDATES COMPLETED SUCCESSFULLY!');
}

updateExistingVisuals().catch(console.error);
