import assert from 'node:assert';
import * as recipeService from './services/recipe.js';
import * as inventoryService from './services/inventory.js';
import { db } from './db/client.js';
import * as schema from './db/schema.js';

async function runTests() {
  console.log('--- STARTING KITCHENOS INTEGRATION TESTS ---');

  // Clean DB tables first for testing
  await db.delete(schema.recipeTags);
  await db.delete(schema.recipeIngredients);
  await db.delete(schema.recipeTechniques);
  await db.delete(schema.experiments);
  await db.delete(schema.mealPlans);
  await db.delete(schema.inventories);
  await db.delete(schema.shoppingLists);
  await db.delete(schema.recipeVersions);
  await db.delete(schema.recipes);
  await db.delete(schema.ingredients);
  await db.delete(schema.techniques);
  await db.delete(schema.cuisines);
  await db.delete(schema.tags);

  console.log('✔ Cleanup completed.');

  // Test 1: Cuisine & Tag creation
  const cuisine = await recipeService.getOrCreateCuisine('Brasileira');
  assert.strictEqual(cuisine.name, 'Brasileira');
  const cuisine2 = await recipeService.getOrCreateCuisine('Brasileira');
  assert.strictEqual(cuisine.id, cuisine2.id, 'Cuisine should be idempotent');

  const tag = await recipeService.getOrCreateTag('Marmitável');
  assert.strictEqual(tag.name, 'Marmitável');
  console.log('✔ Cuisine & Tag tests passed.');

  // Test 2: Ingredient Creation & Ginger Avoidance detection
  const cebola = await recipeService.getOrCreateIngredient('Cebola', 'Vegetais', 'g');
  assert.strictEqual(cebola.name, 'Cebola');
  assert.strictEqual(cebola.avoidsGinger, false);

  const gengibre = await recipeService.getOrCreateIngredient('Gengibre em pó', 'Temperos', 'g');
  assert.strictEqual(gengibre.name, 'Gengibre em pó');
  assert.strictEqual(gengibre.avoidsGinger, true, 'Ginger should automatically set avoidsGinger=true');
  console.log('✔ Ingredient & Ginger restriction tests passed.');

  // Test 3: Recipe & Version creation
  const recipe = await recipeService.createRecipe('Macarrão de Linguiça', 'Delicioso macarrão cremoso', 'Brasileira', ['Marmitável']);
  assert.strictEqual(recipe.name, 'Macarrão de Linguiça');

  const linguica = await recipeService.getOrCreateIngredient('Linguiça Toscana', 'Proteínas', 'g');
  const macarrao = await recipeService.getOrCreateIngredient('Macarrão Penne', 'Grãos', 'g');
  const alho = await recipeService.getOrCreateIngredient('Alho', 'Temperos', 'g');

  const refogar = await recipeService.getOrCreateTechnique('Refogar', 'Cozinhar em gordura quente', 'Easy');

  // Verify successful version creation
  const v1 = await recipeService.createRecipeVersion(
    recipe.id,
    '1.0',
    'Primeira versão',
    'Macarrão clássico de linguiça',
    2,
    true,
    30,
    'Easy',
    [
      { ingredientId: linguica.id, amount: 300, unit: 'g' },
      { ingredientId: macarrao.id, amount: 200, unit: 'g' },
      { ingredientId: cebola.id, amount: 100, unit: 'g' },
      { ingredientId: alho.id, amount: 15, unit: 'g' },
    ],
    [
      { techniqueId: refogar.id, stepOrder: 1, notes: 'Refogar cebola e alho' }
    ]
  );
  assert.ok(v1.id);
  assert.strictEqual(v1.versionNumber, '1.0');

  // Verify ginger blocking constraint
  try {
    await recipeService.createRecipeVersion(
      recipe.id,
      '1.1',
      'Versão com Gengibre',
      'Tentativa de adicionar gengibre',
      2,
      true,
      30,
      'Easy',
      [
        { ingredientId: linguica.id, amount: 300, unit: 'g' },
        { ingredientId: gengibre.id, amount: 10, unit: 'g' } // Ginger! Should throw
      ]
    );
    assert.fail('Should have thrown an error due to ginger restriction.');
  } catch (error: any) {
    assert.ok(error.message.includes('Restrição Alimentar Detectada'), 'Should contain ginger constraint message');
    console.log('✔ Ginger restriction check successfully blocked the recipe.');
  }

  // Test 4: Recipe scaling
  const scaled = await recipeService.scaleRecipe(v1.id, 4); // Scale for 4 people (yield is 2)
  assert.strictEqual(scaled.scalingFactor, 2.0);
  const scaledLinguica = scaled.ingredients.find(i => i.id === linguica.id);
  assert.strictEqual(scaledLinguica?.amount, 600, 'Linguica should double');
  console.log('✔ Recipe scaling tests passed.');

  // Test 5: Inventory & Shopping list
  // Add some inventory
  await inventoryService.manageInventory(linguica.id, 500, 'g', 'Freezer');
  await inventoryService.manageInventory(cebola.id, 300, 'g', 'Fridge');

  const stock = await inventoryService.getInventoryList();
  assert.strictEqual(stock.length, 2);
  const stockLinguica = stock.find(s => s.ingredientId === linguica.id);
  assert.strictEqual(stockLinguica?.amount, 500);
  assert.strictEqual(stockLinguica?.location, 'Freezer');

  // Deplete stock via cooking
  // Cook 2 portions of v1 (requires 300g linguica, 100g cebola)
  await inventoryService.autoDepleteInventory(v1.id, 2);
  const stockAfterCook = await inventoryService.getInventoryList();
  const stockLinguicaAfter = stockAfterCook.find(s => s.ingredientId === linguica.id);
  assert.strictEqual(stockLinguicaAfter?.amount, 200, 'Should have depleted 300g from 500g');
  console.log('✔ Auto-deplete inventory tests passed.');

  // Shopping List purchase
  const shopItem = await inventoryService.addToShoppingList(macarrao.id, 500, 'g');
  assert.strictEqual(shopItem.amountNeeded, 500);

  const purchaseRes = await inventoryService.purchaseShoppingListItem(shopItem.id);
  assert.strictEqual(purchaseRes.inventoryLocation, 'Pantry', 'Grãos should default to Pantry');

  const postPurchaseStock = await inventoryService.getInventoryList();
  const stockMacarrao = postPurchaseStock.find(s => s.ingredientId === macarrao.id);
  assert.strictEqual(stockMacarrao?.amount, 500);
  assert.strictEqual(stockMacarrao?.location, 'Pantry');
  console.log('✔ Shopping list and auto-routing purchase tests passed.');

  console.log('\n--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
