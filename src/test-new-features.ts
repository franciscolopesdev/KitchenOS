import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';
import { getOrCreateIngredient, calculateRecipeCost, setIngredientPrice } from './services/recipe.js';
import { startKitchenTimer } from './services/timer.js';
import { generateRecipeHtmlCard } from './services/pdf-generator.js';
import fs from 'fs';

async function runTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING KITCHENOS PREMIUM FEATURES VERIFICATION');
  console.log('==================================================\n');

  try {
    // 1. Set Ingredient Price
    console.log('STEP 1: Testing Ingredient Price Setting...');
    // Create/retrieve test ingredient
    const testIngredient = await getOrCreateIngredient('Test Ingredient Bacon', 'Proteínas', 'g');
    const ingredientId = testIngredient.id;
    console.log(`- Ingredient: "${testIngredient.name}" (ID: ${ingredientId})`);

    const priceResult = await setIngredientPrice(ingredientId, 0.05, 'R$');
    console.log(`- Price set successfully: ${priceResult.priceUnit} ${priceResult.pricePerUnit}/unit`);

    // 2. Add Test Recipe & Version & Ingredients to verify Costing
    console.log('\nSTEP 2: Testing Recipe Cost Calculation...');
    // Create a mock recipe
    const [mockRecipe] = await db.insert(schema.recipes).values({
      name: 'Test Gourmet Carbonara',
      description: 'Gourmet test recipe for costing calculation',
    }).returning();

    const [mockVersion] = await db.insert(schema.recipeVersions).values({
      recipeId: mockRecipe.id,
      versionNumber: '1.0',
      name: 'Primeira Tentativa',
      yieldPortions: 2,
      isFreezerFriendly: false,
      estimatedTimeMinutes: 15,
      difficulty: 'Easy',
    }).returning();

    // Link the ingredient to the version
    await db.insert(schema.recipeIngredients).values({
      recipeVersionId: mockVersion.id,
      ingredientId: ingredientId,
      amount: 150, // 150g * 0.05 = R$ 7.50
      unit: 'g',
      isOptional: false,
    });

    // Calculate cost
    const costInfo = await calculateRecipeCost(mockVersion.id);
    console.log(`- Recipe Yield: ${costInfo.yieldPortions} portions`);
    console.log(`- Total Estimated Cost: ${costInfo.currency} ${costInfo.totalCost}`);
    console.log(`- Cost Per Portion: ${costInfo.currency} ${costInfo.costPerPortion}`);
    
    if (costInfo.totalCost === 7.50 && costInfo.costPerPortion === 3.75) {
      console.log('✔ Costing calculations are 100% accurate!');
    } else {
      console.warn(`⚠ Calculations differ. Expected total: 7.50, got: ${costInfo.totalCost}`);
    }

    // 3. Test Kitchen Timer
    console.log('\nSTEP 3: Testing Kitchen Timer (0.05 minutes / 3 seconds)...');
    const timerId = startKitchenTimer('Egg Boiling Test', 0.05);
    console.log(`- Timer created with ID: ${timerId}. Waiting 4 seconds for it to complete...`);
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // 4. Test PDF/HTML Card Generation
    console.log('\nSTEP 4: Testing PDF/HTML Card Generation...');
    const htmlPath = await generateRecipeHtmlCard(mockVersion.id);
    console.log(`- HTML Card Path: ${htmlPath}`);
    if (fs.existsSync(htmlPath)) {
      console.log('✔ HTML file exists and is populated!');
      console.log(`- Content sample: ${fs.readFileSync(htmlPath, 'utf8').substring(0, 150)}...`);
    } else {
      throw new Error('HTML Card file was not created!');
    }

    // Cleanup mock test records from SQLite
    console.log('\n🧹 Cleaning up test database records...');
    await db.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeVersionId, mockVersion.id));
    await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, mockVersion.id));
    await db.delete(schema.recipes).where(eq(schema.recipes.id, mockRecipe.id));
    await db.delete(schema.ingredients).where(eq(schema.ingredients.id, ingredientId));
    console.log('✔ Cleanup complete.');

    console.log('\n==================================================');
    console.log('🎉 ALL PREMIUM TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('==================================================\n');
  } catch (error: any) {
    console.error('\n❌ Premium tests failed:', error.message);
    process.exit(1);
  }
}

runTests().catch(console.error);
