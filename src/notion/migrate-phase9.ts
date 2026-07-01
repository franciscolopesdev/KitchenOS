import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { notion } from './client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!parentPageId || parentPageId === 'your_notion_parent_page_id_here') {
  console.error('Error: NOTION_PARENT_PAGE_ID is not configured in .env file.');
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
const mappingsFilePath = path.join(__dirname, '../../notion_databases.json');

async function createDatabase(name: string, properties: any) {
  console.log(`Creating database "${name}"...`);
  try {
    const response = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
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
  } catch (error: any) {
    console.error(`Error creating database "${name}":`, error.message);
    throw error;
  }
}

async function addRelationProperty(dbId: string, propertyName: string, targetDbId: string, syncedName?: string) {
  console.log(`Adding relation "${propertyName}" to database ${dbId}...`);
  try {
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
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
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
  } catch (error: any) {
    console.error(`Error adding relation "${propertyName}":`, error.message);
    throw error;
  }
}

async function patchDatabaseProperties(dbId: string, properties: any) {
  console.log(`Patching properties on database ${dbId}...`);
  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties
    })
  });

  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to patch database: ${data.message || JSON.stringify(data)}`);
  }
  console.log(`✔ patched properties successfully.`);
}

async function runMigration() {
  console.log('--- STARTING NOTION SCHEMA MIGRATION FOR PHASE 9 ---');

  if (!fs.existsSync(mappingsFilePath)) {
    console.error('Error: notion_databases.json mappings file not found. Run setup first.');
    process.exit(1);
  }

  const dbIds = JSON.parse(fs.readFileSync(mappingsFilePath, 'utf8'));

  // 1. Patch recipes database to add "História" and "Objetivo"
  if (dbIds.recipes) {
    try {
      console.log('Updating recipes database schema...');
      await patchDatabaseProperties(dbIds.recipes, {
        História: { rich_text: {} },
        Objetivo: { rich_text: {} },
      });
    } catch (e: any) {
      console.error('Error updating recipes database:', e.message);
    }
  }

  // 2. Patch techniques database to add "Nível de Domínio"
  if (dbIds.techniques) {
    try {
      console.log('Updating techniques database schema...');
      await patchDatabaseProperties(dbIds.techniques, {
        'Nível de Domínio': { number: { format: 'number' } },
      });
    } catch (e: any) {
      console.error('Error updating techniques database:', e.message);
    }
  }

  // 3. Create cookingSessions database
  if (!dbIds.cookingSessions) {
    dbIds.cookingSessions = await createDatabase('📅 Sessões de Cozinha (KitchenOS)', {
      Sessão: { title: {} },
      Data: { date: {} },
      Início: { rich_text: {} },
      Fim: { rich_text: {} },
      'Duração (Min)': { number: { format: 'number' } },
      Local: { rich_text: {} },
      Humor: {
        select: {
          options: [
            { name: '😃 Contente', color: 'green' },
            { name: '😐 Neutro', color: 'default' },
            { name: '🥵 Estressado/Cansado', color: 'red' },
            { name: '😴 Com Sono', color: 'blue' },
            { name: '🥰 Inspirado', color: 'pink' },
          ],
        },
      },
      Chef: { rich_text: {} },
      Participantes: { rich_text: {} },
      'Avaliação Geral': { number: { format: 'number' } },
      'O que aprendi': { rich_text: {} },
      'Erros cometidos': { rich_text: {} },
      Acertos: { rich_text: {} },
      'Nunca mais devo': { rich_text: {} },
      'Funcionou porque': { rich_text: {} },
      'Próxima tentativa': { rich_text: {} },
      'Observações Gerais': { rich_text: {} },
    });
  }

  // 4. Create ratings database
  if (!dbIds.ratings) {
    dbIds.ratings = await createDatabase('⭐ Avaliações Culinárias (KitchenOS)', {
      Avaliador: { title: {} },
      Nota: { number: { format: 'number' } },
      Comentário: { rich_text: {} },
      'Comeria de novo': { checkbox: {} },
      'Mudanças Sugeridas': { rich_text: {} },
    });
  }

  // 5. Create photos database (or map existing)
  // Wait, if there's no photos database registered in notion_databases.json, create it.
  if (!dbIds.photos) {
    dbIds.photos = await createDatabase('🖼️ Álbum de Fotos (KitchenOS)', {
      Foto: { title: {} },
      'URL da Imagem': { url: {} },
      Data: { date: {} },
      Notas: { rich_text: {} },
    });
  }

  // Write updated mappings
  fs.writeFileSync(mappingsFilePath, JSON.stringify(dbIds, null, 2));
  console.log('Saved updated database mappings.');

  // 6. Create Relations
  console.log('\n--- Creating Relationships ---');
  if (dbIds.cookingSessions && dbIds.recipeVersions) {
    await addRelationProperty(dbIds.cookingSessions, 'Receitas Preparadas', dbIds.recipeVersions, 'Sessões de Cozinha');
  }
  if (dbIds.ratings && dbIds.cookingSessions) {
    await addRelationProperty(dbIds.ratings, 'Sessão de Cozinha', dbIds.cookingSessions, 'Avaliações');
  }
  if (dbIds.ratings && dbIds.recipeVersions) {
    await addRelationProperty(dbIds.ratings, 'Versão da Receita', dbIds.recipeVersions);
  }
  if (dbIds.photos && dbIds.cookingSessions) {
    await addRelationProperty(dbIds.photos, 'Sessão de Cozinha', dbIds.cookingSessions, 'Fotos');
  }
  if (dbIds.photos && dbIds.recipeVersions) {
    await addRelationProperty(dbIds.photos, 'Versão da Receita', dbIds.recipeVersions, 'Fotos');
  }

  console.log('\n--- Notion Schema Migration Completed! ---');
}

runMigration().catch(console.error);
