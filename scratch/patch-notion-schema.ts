import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mappingsFilePath = path.join(__dirname, '../notion_databases.json');

if (!process.env.NOTION_TOKEN) {
  console.error('Error: NOTION_TOKEN is not set in environment.');
  process.exit(1);
}

async function patchDatabase(dbId: string, properties: any) {
  console.log(`Patching database ${dbId}...`);
  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });

  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }
  console.log(`Successfully patched database ${dbId}`);
}

async function main() {
  if (!fs.existsSync(mappingsFilePath)) {
    console.error('No notion_databases.json mappings found. Run setup first.');
    process.exit(1);
  }

  const dbIds = JSON.parse(fs.readFileSync(mappingsFilePath, 'utf8'));

  if (dbIds.recipes) {
    try {
      await patchDatabase(dbIds.recipes, {
        'Equipamento Preferido': { rich_text: {} },
        'Motivo da Preferência': { rich_text: {} }
      });
    } catch (e: any) {
      console.error('Failed to patch Recipes DB:', e.message);
    }
  }

  if (dbIds.cookingSessions) {
    try {
      await patchDatabase(dbIds.cookingSessions, {
        'Equipamento Utilizado': { rich_text: {} }
      });
    } catch (e: any) {
      console.error('Failed to patch Cooking Sessions DB:', e.message);
    }
  }

  console.log('Notion schema patching completed!');
}

main().catch(console.error);
