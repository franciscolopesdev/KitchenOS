import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq, isNull } from 'drizzle-orm';

async function checkEmpty() {
  const recipes = await db.select().from(schema.recipes);
  let emptyVersionsCount = 0;
  let emptyIngredientsCount = 0;
  let emptyTechniquesCount = 0;

  for (const r of recipes) {
    // Check if it has a current version
    if (!r.currentVersionId) {
      emptyVersionsCount++;
      continue;
    }

    // Check ingredients
    const ings = await db
      .select()
      .from(schema.recipeIngredients)
      .where(eq(schema.recipeIngredients.recipeVersionId, r.currentVersionId));
    if (ings.length === 0) {
      emptyIngredientsCount++;
    }

    // Check techniques
    const techs = await db
      .select()
      .from(schema.recipeTechniques)
      .where(eq(schema.recipeTechniques.recipeVersionId, r.currentVersionId));
    if (techs.length === 0) {
      emptyTechniquesCount++;
    }
  }

  console.log(`TOTAL RECIPES IN DATABASE: ${recipes.length}`);
  console.log(`Recipes with no currentVersionId: ${emptyVersionsCount}`);
  console.log(`Recipes with no ingredients in active version: ${emptyIngredientsCount}`);
  console.log(`Recipes with no techniques in active version: ${emptyTechniquesCount}`);
}

checkEmpty().catch(console.error);
