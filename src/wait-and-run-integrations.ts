import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { isNull } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mappingsFilePath = path.join(__dirname, '../notion_databases.json');

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

async function getUnsyncedCounts() {
  const recipes = await db.select().from(schema.recipes).where(isNull(schema.recipes.notionPageId));
  const versions = await db.select().from(schema.recipeVersions).where(isNull(schema.recipeVersions.notionPageId));
  const ingredients = await db.select().from(schema.ingredients).where(isNull(schema.ingredients.notionPageId));
  const recipeIngredients = await db.select().from(schema.recipeIngredients).where(isNull(schema.recipeIngredients.notionPageId));
  const recipeTechniques = await db.select().from(schema.recipeTechniques).where(isNull(schema.recipeTechniques.notionPageId));

  return {
    recipes: recipes.length,
    versions: versions.length,
    ingredients: ingredients.length,
    recipeIngredients: recipeIngredients.length,
    recipeTechniques: recipeTechniques.length,
    total: recipes.length + versions.length + ingredients.length + recipeIngredients.length + recipeTechniques.length
  };
}

async function updateNotionSchema(ingredientsDbId: string) {
  console.log(`\n⚙️ Updating Notion database schema for Ingredients (DB ID: ${ingredientsDbId})...`);
  
  const response = await fetch(`https://api.notion.com/v1/databases/${ingredientsDbId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        'Preço por Unidade': { number: { format: 'number' } },
        'Unidade Financeira': { rich_text: {} }
      }
    })
  });

  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to update Notion schema: ${data.message || JSON.stringify(data)}`);
  }

  console.log('✔ Notion Ingredients database schema updated successfully with "Preço por Unidade" and "Unidade Financeira".');
}

async function run() {
  console.log('\n======================================================');
  console.log('🔄 AUTORUN: MONITORING SYNCHRONIZATION AND INTEGRATING');
  console.log('======================================================\n');

  const dbIds = getDbIds();
  if (!dbIds || !dbIds.ingredients) {
    console.error('Error: notion_databases.json not found or missing ingredients database ID.');
    process.exit(1);
  }

  console.log('Waiting for the active background sync loop to complete...');
  
  let checkCount = 0;
  while (true) {
    const counts = await getUnsyncedCounts();
    console.log(`[Check #${++checkCount}] Remaining items to sync: ${counts.total} (Recipes: ${counts.recipes}, Versions: ${counts.versions}, Ingredients: ${counts.ingredients}, Recipe Ingredients: ${counts.recipeIngredients}, Recipe Techniques: ${counts.recipeTechniques})`);
    
    if (counts.total === 0) {
      console.log('\n🎉 ALL SQLite ITEMS HAVE BEEN SYNCHRONIZED TO NOTION!');
      break;
    }

    // Sleep for 15 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }

  // Sync complete! Let's do the integrations:
  console.log('\n======================================================');
  console.log('🚀 SYNCHRONIZATION COMPLETED! STARTING INTEGRATIONS...');
  console.log('======================================================\n');

  try {
    // 1. Update Notion Database Schema
    await updateNotionSchema(dbIds.ingredients);

    // 2. Run Verification Tests
    console.log('\n🧪 Running Premium Features Verification tests...');
    const { execSync } = await import('child_process');
    const testOutput = execSync('npx tsx src/test-new-features.ts', { encoding: 'utf8' });
    console.log(testOutput);

    console.log('\n======================================================');
    console.log('🎉 INTEGRATIONS AND PREMIUM UTILITIES ARE COMPLETED AND READY!');
    console.log('======================================================\n');
  } catch (error: any) {
    console.error('❌ Integration phase encountered an error:', error.message);
    process.exit(1);
  }
}

run().catch(console.error);
