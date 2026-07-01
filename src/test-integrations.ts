import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { getCurrentWeather } from './services/weather.js';
import { calculateRecipeVersionNutrition, updateRecipeVersionNutrition } from './services/nutrition.js';
import { syncMealPlansToGoogleCalendar } from './services/google-calendar.js';
import { getExpirationAlerts } from './services/inventory.js';
import { getCookingStats, getIngredientSubstitutes, exportRecipeToMarkdown } from './services/recipe.js';
import { formatShoppingListText } from './services/telegram.js';

async function runTests() {
  console.log('--- STARTING EXTENDED INTEGRATIONS VALIDATION ---');

  // 1. Weather Test
  console.log('\n[1/6] Testing Weather Service...');
  const weather = await getCurrentWeather();
  console.log(`✔ Weather result: ${weather.temperature}°C, ${weather.description}`);
  console.log(`  Is Cold: ${weather.isCold}, Is Hot: ${weather.isHot}, Is Rainy: ${weather.isRainy}`);

  // 2. Nutrition Test
  console.log('\n[2/6] Testing Nutrition Service...');
  const versions = await db.select().from(schema.recipeVersions);
  console.log(`Found ${versions.length} recipe versions in SQLite.`);

  if (versions.length > 0) {
    const targetVersion = versions[0];
    console.log(`Calculating nutrition for: "${targetVersion.name}" (ID: ${targetVersion.id}, Portions: ${targetVersion.yieldPortions})...`);
    
    const nutrition = await calculateRecipeVersionNutrition(targetVersion.id);
    console.log(`✔ Calculated per portion:`);
    console.log(`  Calories: ${nutrition.calories} kcal`);
    console.log(`  Protein: ${nutrition.proteinGrams}g`);
    console.log(`  Carbs: ${nutrition.carbsGrams}g`);
    console.log(`  Fat: ${nutrition.fatGrams}g`);

    // Try updating it in DB
    await updateRecipeVersionNutrition(targetVersion.id);
    console.log('✔ Successfully saved nutrition data in SQLite.');

    // 3. Export Markdown Test
    console.log('\n[3/6] Testing Recipe Exporter to Markdown...');
    const md = await exportRecipeToMarkdown(targetVersion.id);
    console.log('✔ Markdown Generated (First 150 chars):');
    console.log(md.substring(0, 150) + '...');
  } else {
    console.log('⚠ No recipe versions found to test nutrition/markdown.');
  }

  // 4. Expiration Alerts Test
  console.log('\n[4/6] Testing Expiration Alerts...');
  // Let's temporarily insert an item expiring soon to check the query, or just run it
  const alerts = await getExpirationAlerts(7); // look ahead 7 days
  console.log(`✔ Expiration Alerts (7 days): Found ${alerts.length} items expiring.`);
  for (const alert of alerts) {
    console.log(`  • ${alert.ingredientName} (${alert.amount}${alert.unit}) expires on ${alert.expirationDate}`);
  }

  // 5. Ingredient Substitutes Test
  console.log('\n[5/6] Testing Ingredient Substitutes Recommender...');
  const testIngredients = ['manteiga', 'creme de leite', 'vinho tinto seco', 'non-existent-ingredient'];
  for (const ing of testIngredients) {
    const res = await getIngredientSubstitutes(ing);
    if (res.substitutes.length > 0) {
      console.log(`✔ Substitutes for "${ing}": ${res.substitutes.join(', ')}`);
    } else {
      console.log(`⚠ Substitutes for "${ing}": ${res.message}`);
    }
  }

  // 6. Cooking Stats Test
  console.log('\n[6/6] Testing Cooking Stats & Dashboard...');
  const stats = await getCookingStats();
  console.log('✔ Stats generated:');
  console.log(JSON.stringify(stats, null, 2));

  // WhatsApp Link test
  console.log('\nTesting WhatsApp Exporter Link...');
  const testShoppingList = [
    { name: 'Feijão preto', category: 'Grãos', amountNeeded: 500, unit: 'g' },
    { name: 'Peito de frango', category: 'Proteínas', amountNeeded: 300, unit: 'g' }
  ];
  const listText = formatShoppingListText(testShoppingList);
  const encodedText = encodeURIComponent(listText);
  const whatsappWebLink = `https://web.whatsapp.com/send?text=${encodedText}`;
  console.log('✔ Generated WhatsApp Web Link:');
  console.log(whatsappWebLink.substring(0, 80) + '...');

  console.log('\n--- EXTENDED INTEGRATIONS VALIDATION COMPLETED ---');
}

runTests().catch(console.error);
