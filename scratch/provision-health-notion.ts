import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
const notionToken = process.env.NOTION_TOKEN;

if (!parentPageId || !notionToken) {
  console.error('Error: NOTION_PARENT_PAGE_ID or NOTION_TOKEN is not configured.');
  process.exit(1);
}

function cleanPageId(id: string) {
  const clean = id.replace(/-/g, '').trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    const lastPart = parts[parts.length - 1];
    const match = lastPart.match(/[a-f0-9]{32}/i);
    return match ? match[0] : lastPart;
  }
  const match = clean.match(/[a-f0-9]{32}/i);
  return match ? match[0] : clean;
}

const cleanedParentPageId = cleanPageId(parentPageId);
const mappingsFilePath = path.join(__dirname, '../notion_databases.json');

async function createDatabase(name: string, properties: any) {
  console.log(`Creating database "${name}"...`);
  const response = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: {
        type: 'page_id',
        page_id: cleanedParentPageId,
      },
      title: [
        {
          type: 'text',
          text: {
            content: name,
          },
        },
      ],
      properties,
    })
  });

  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }

  console.log(`Created database "${name}" with ID: ${data.id}`);
  return data.id;
}

async function run() {
  if (!fs.existsSync(mappingsFilePath)) {
    console.error(`Mappings file not found at ${mappingsFilePath}`);
    process.exit(1);
  }

  const dbIds = JSON.parse(fs.readFileSync(mappingsFilePath, 'utf8'));

  if (dbIds.healthGoals || dbIds.nutritionLogs) {
    console.log('HealthGoals or NutritionLogs already provisioned in notion_databases.json.');
    console.log(`Health Goals DB: ${dbIds.healthGoals}`);
    console.log(`Nutrition Logs DB: ${dbIds.nutritionLogs}`);
    return;
  }

  try {
    // 1. Create Health Goals DB
    dbIds.healthGoals = await createDatabase('🎯 Metas de Saúde (KitchenOS)', {
      Meta: { title: {} },
      Tipo: {
        select: {
          options: [
            { name: 'WeightLoss', color: 'blue' },
            { name: 'WeightGain', color: 'green' },
            { name: 'Maintenance', color: 'orange' },
            { name: 'Hypertrophy', color: 'purple' },
          ],
        },
      },
      'Peso Alvo (kg)': { number: { format: 'number' } },
      'Calorias Alvo (kcal)': { number: { format: 'number' } },
      'Proteínas Alvo (g)': { number: { format: 'number' } },
      'Carboidratos Alvo (g)': { number: { format: 'number' } },
      'Gorduras Alvo (g)': { number: { format: 'number' } },
      'Água Alvo (ml)': { number: { format: 'number' } },
      Status: {
        select: {
          options: [
            { name: 'Active', color: 'blue' },
            { name: 'Achieved', color: 'green' },
            { name: 'Paused', color: 'orange' },
          ],
        },
      },
    });

    // 2. Create Nutrition Logs DB
    dbIds.nutritionLogs = await createDatabase('🩺 Diário de Saúde (KitchenOS)', {
      Data: { title: {} },
      'Calorias Consumidas (kcal)': { number: { format: 'number' } },
      'Proteínas Consumidas (g)': { number: { format: 'number' } },
      'Carboidratos Consumidos (g)': { number: { format: 'number' } },
      'Gorduras Consumidas (g)': { number: { format: 'number' } },
      'Água Ingerida (ml)': { number: { format: 'number' } },
      'Peso Corporal (kg)': { number: { format: 'number' } },
    });

    // Update the mappings file
    fs.writeFileSync(mappingsFilePath, JSON.stringify(dbIds, null, 2));
    console.log(`Updated mappings in ${mappingsFilePath}`);

    console.log('\n🎉 Successfully provisioned Health and Nutrition databases in Notion!');
  } catch (error) {
    console.error('Error provisioning health databases:', error);
    process.exit(1);
  }
}

run();
