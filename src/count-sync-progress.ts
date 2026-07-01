import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { isNull } from 'drizzle-orm';

async function count() {
  try {
    const totalRecipes = await db.select().from(schema.recipes);
    const unsyncedRecipes = totalRecipes.filter(r => r.notionPageId === null);
    const syncedRecipes = totalRecipes.filter(r => r.notionPageId !== null);

    const totalIngredients = await db.select().from(schema.ingredients);
    const unsyncedIngredients = totalIngredients.filter(i => i.notionPageId === null);

    const totalVersions = await db.select().from(schema.recipeVersions);
    const unsyncedVersions = totalVersions.filter(v => v.notionPageId === null);

    console.log('--- SYNC PROGRESS REPORT ---');
    console.log(`Recipes: ${syncedRecipes.length}/${totalRecipes.length} synced (${unsyncedRecipes.length} remaining)`);
    console.log(`Ingredients: ${totalIngredients.length - unsyncedIngredients.length}/${totalIngredients.length} synced (${unsyncedIngredients.length} remaining)`);
    console.log(`Recipe Versions: ${totalVersions.length - unsyncedVersions.length}/${totalVersions.length} synced (${unsyncedVersions.length} remaining)`);
    console.log('----------------------------');
  } catch (error) {
    console.error('Error counting sync progress:', error);
  }
}

count().catch(console.error);
