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

async function addRelationProperty(dbId: string, propertyName: string, targetDbId: string, syncedName?: string) {
  console.log(`Adding relation "${propertyName}" to database ${dbId}...`);
  const properties: any = {};
  if (syncedName) {
    properties[propertyName] = {
      relation: {
        database_id: targetDbId,
        type: 'dual_property',
        dual_property: {
          synced_property_name: syncedName,
        },
      },
    };
  } else {
    properties[propertyName] = {
      relation: {
        database_id: targetDbId,
        type: 'single_property',
        single_property: {},
      },
    };
  }

  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties
    })
  });

  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }

  console.log(`Added relation "${propertyName}" successfully!`);
}

async function run() {
  if (!fs.existsSync(mappingsFilePath)) {
    console.error(`Mappings file not found at ${mappingsFilePath}`);
    process.exit(1);
  }

  const dbIds = JSON.parse(fs.readFileSync(mappingsFilePath, 'utf8'));

  if (dbIds.objectives || dbIds.missions) {
    console.log('Objectives or Missions already provisioned in notion_databases.json.');
    console.log(`Objectives DB: ${dbIds.objectives}`);
    console.log(`Missions DB: ${dbIds.missions}`);
    return;
  }

  try {
    // 1. Create Objectives DB
    dbIds.objectives = await createDatabase('🎯 Objetivos (KitchenOS)', {
      Objetivo: { title: {} },
      Descrição: { rich_text: {} },
      Status: {
        select: {
          options: [
            { name: 'Active', color: 'blue' },
            { name: 'Completed', color: 'green' },
            { name: 'Paused', color: 'orange' },
          ],
        },
      },
      'Meta Total': { number: { format: 'number' } },
      'Concluídas': { number: { format: 'number' } },
    });

    // 2. Create Missions DB
    dbIds.missions = await createDatabase('🏆 Missões Culinárias (KitchenOS)', {
      Missão: { title: {} },
      Descrição: { rich_text: {} },
      Status: {
        select: {
          options: [
            { name: 'Active', color: 'blue' },
            { name: 'Completed', color: 'green' },
          ],
        },
      },
      'Concluído Em': { date: {} },
    });

    // Update the mappings file
    fs.writeFileSync(mappingsFilePath, JSON.stringify(dbIds, null, 2));
    console.log(`Updated mappings in ${mappingsFilePath}`);

    // --- ADD RELATIONSHIPS ---
    console.log('\n--- Interconnecting Databases ---');

    // Missions -> Objectives
    await addRelationProperty(dbIds.missions, 'Objetivo Associado', dbIds.objectives, 'Missões');

    // Missions -> Techniques
    if (dbIds.techniques) {
      await addRelationProperty(dbIds.missions, 'Técnica Culinária', dbIds.techniques);
    } else {
      console.warn('Warning: techniques database ID not found in mappings.');
    }

    console.log('\n🎉 Successfully provisioned Objectives and Missions databases in Notion!');
  } catch (error) {
    console.error('Error provisioning databases:', error);
    process.exit(1);
  }
}

run();
