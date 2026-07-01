import { db } from './client.js';
import * as schema from './schema.js';

async function clear() {
  console.log('Clearing all Notion Page IDs in SQLite database...');
  await db.update(schema.cuisines).set({ notionPageId: null });
  await db.update(schema.recipes).set({ notionPageId: null });
  await db.update(schema.recipeVersions).set({ notionPageId: null });
  await db.update(schema.ingredients).set({ notionPageId: null });
  await db.update(schema.recipeIngredients).set({ notionPageId: null });
  await db.update(schema.techniques).set({ notionPageId: null });
  await db.update(schema.recipeTechniques).set({ notionPageId: null });
  await db.update(schema.experiments).set({ notionPageId: null });
  await db.update(schema.inventories).set({ notionPageId: null });
  await db.update(schema.shoppingLists).set({ notionPageId: null });
  await db.update(schema.mealPlans).set({ notionPageId: null });
  console.log('✔ All Notion Page IDs cleared from SQLite.');
}

clear().catch(err => {
  console.error('Failed to clear Notion IDs:', err);
  process.exit(1);
});
