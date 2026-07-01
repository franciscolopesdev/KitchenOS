import { notion } from './client.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!parentPageId || parentPageId === 'your_notion_parent_page_id_here') {
  console.error('Error: NOTION_PARENT_PAGE_ID is not configured in .env file.');
  process.exit(1);
}

// Clean parent page ID (extract from URL if user pasted the full URL)
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
console.log(`Using Parent Page ID: ${cleanedParentPageId}`);

interface DatabaseMappings {
  cuisines?: string;
  recipes?: string;
  recipeVersions?: string;
  ingredients?: string;
  recipeIngredients?: string;
  techniques?: string;
  recipeTechniques?: string;
  experiments?: string;
  inventories?: string;
  shoppingLists?: string;
  mealPlans?: string;
  cookingSessions?: string;
  cookingSessionRecipes?: string;
  ratings?: string;
  photos?: string;
  objectives?: string;
  missions?: string;
  healthGoals?: string;
  nutritionLogs?: string;
  equipments?: string;
  adaptations?: string;
}

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

async function run() {
  const dbIds: Record<string, string> = {};

  try {
    // 1. Cuisines DB
    dbIds.cuisines = await createDatabase('📒 Gastronomias (KitchenOS)', {
      Name: { title: {} },
    });

    // 2. Recipes DB
    dbIds.recipes = await createDatabase('📖 Receitas (KitchenOS)', {
      Nome: { title: {} },
      Descrição: { rich_text: {} },
      Favorito: { checkbox: {} },
      História: { rich_text: {} },
      Objetivo: { rich_text: {} },
      'Equipamento Preferido': { rich_text: {} },
      'Motivo da Preferência': { rich_text: {} },
      Tags: {
        multi_select: {
          options: [
            { name: 'Marmitável', color: 'green' },
            { name: 'Rápido', color: 'blue' },
            { name: 'Comfort Food', color: 'orange' },
            { name: 'Fim de Semana', color: 'purple' },
            { name: 'Congelável', color: 'red' },
          ],
        },
      },
    });

    // 3. Recipe Versions DB
    dbIds.recipeVersions = await createDatabase('⚙️ Versões de Receitas (KitchenOS)', {
      Versão: { title: {} },
      Modificações: { rich_text: {} },
      Porções: { number: { format: 'number' } },
      Congelável: { checkbox: {} },
      'Tempo Estimado (Min)': { number: { format: 'number' } },
      Dificuldade: {
        select: {
          options: [
            { name: 'Fácil', color: 'green' },
            { name: 'Médio', color: 'orange' },
            { name: 'Difícil', color: 'red' },
          ],
        },
      },
      'Calorias (kcal)': { number: { format: 'number' } },
      'Proteínas (g)': { number: { format: 'number' } },
      'Carboidratos (g)': { number: { format: 'number' } },
      'Gorduras (g)': { number: { format: 'number' } },
    });

    // 4. Ingredients DB
    dbIds.ingredients = await createDatabase('🥦 Ingredientes (KitchenOS)', {
      Ingrediente: { title: {} },
      Categoria: {
        select: {
          options: [
            { name: 'Proteínas', color: 'red' },
            { name: 'Vegetais', color: 'green' },
            { name: 'Laticínios', color: 'orange' },
            { name: 'Temperos', color: 'yellow' },
            { name: 'Grãos', color: 'blue' },
            { name: 'Outros', color: 'default' },
          ],
        },
      },
      'Unidade Padrão': {
        select: {
          options: [
            { name: 'g', color: 'blue' },
            { name: 'ml', color: 'blue' },
            { name: 'unidade', color: 'green' },
            { name: 'colher de sopa', color: 'orange' },
            { name: 'colher de chá', color: 'yellow' },
          ],
        },
      },
      'Evitar Gengibre': { checkbox: {} },
      'Perfil de Sabor': {
        multi_select: {
          options: [
            { name: 'Doce', color: 'pink' },
            { name: 'Salgado', color: 'blue' },
            { name: 'Ácido', color: 'yellow' },
            { name: 'Amargo', color: 'default' },
            { name: 'Umami', color: 'red' },
            { name: 'Picante', color: 'orange' },
            { name: 'Gordura', color: 'purple' },
          ],
        },
      },
      'Preço por Unidade': { number: { format: 'number' } },
      'Unidade Financeira': { rich_text: {} },
    });

    // 5. Recipe Ingredients DB
    dbIds.recipeIngredients = await createDatabase('🌾 Ingredientes da Receita (KitchenOS)', {
      'Nome do Item': { title: {} },
      Quantidade: { number: { format: 'number' } },
      Unidade: {
        select: {
          options: [
            { name: 'g', color: 'blue' },
            { name: 'ml', color: 'blue' },
            { name: 'unidade', color: 'green' },
            { name: 'colher de sopa', color: 'orange' },
            { name: 'colher de chá', color: 'yellow' },
          ],
        },
      },
      Notas: { rich_text: {} },
      Opcional: { checkbox: {} },
    });

    // 6. Techniques DB
    dbIds.techniques = await createDatabase('🔥 Técnicas (KitchenOS)', {
      Técnica: { title: {} },
      Descrição: { rich_text: {} },
      Dificuldade: {
        select: {
          options: [
            { name: 'Fácil', color: 'green' },
            { name: 'Médio', color: 'orange' },
            { name: 'Difícil', color: 'red' },
          ],
        },
      },
      'Impacto no Sabor': { rich_text: {} },
      'Nível de Domínio': { number: { format: 'number' } },
    });

    // 7. Recipe Techniques DB
    dbIds.recipeTechniques = await createDatabase('🍳 Técnicas da Receita (KitchenOS)', {
      'Nome do Item': { title: {} },
      Ordem: { number: { format: 'number' } },
      Notas: { rich_text: {} },
    });

    // 8. Experiments DB
    dbIds.experiments = await createDatabase('🧪 Experimentos (KitchenOS)', {
      'Nome do Experimento': { title: {} },
      Data: { date: {} },
      'Porções Preparadas': { number: { format: 'number' } },
      'Peso da Proteína (g)': { number: { format: 'number' } },
      Avaliação: {
        select: {
          options: [
            { name: '⭐', color: 'red' },
            { name: '⭐⭐', color: 'orange' },
            { name: '⭐⭐⭐', color: 'yellow' },
            { name: '⭐⭐⭐⭐', color: 'blue' },
            { name: '⭐⭐⭐⭐⭐', color: 'green' },
          ],
        },
      },
      'O que deu certo': { rich_text: {} },
      'O que mudar na próxima versão': { rich_text: {} },
    });

    // 9. Estoque e Freezer DB
    dbIds.inventories = await createDatabase('📦 Estoque e Freezer (KitchenOS)', {
      Item: { title: {} },
      Quantidade: { number: { format: 'number' } },
      Unidade: {
        select: {
          options: [
            { name: 'g', color: 'blue' },
            { name: 'ml', color: 'blue' },
            { name: 'unidade', color: 'green' },
            { name: 'colher de sopa', color: 'orange' },
            { name: 'colher de chá', color: 'yellow' },
          ],
        },
      },
      Localização: {
        select: {
          options: [
            { name: 'Dispensa', color: 'orange' },
            { name: 'Geladeira', color: 'blue' },
            { name: 'Freezer', color: 'purple' },
          ],
        },
      },
      'Data de Validade': { date: {} },
    });

    // 10. Lista de Compras DB
    dbIds.shoppingLists = await createDatabase('🛒 Lista de Compras (KitchenOS)', {
      Item: { title: {} },
      'Quantidade Necessária': { number: { format: 'number' } },
      Unidade: {
        select: {
          options: [
            { name: 'g', color: 'blue' },
            { name: 'ml', color: 'blue' },
            { name: 'unidade', color: 'green' },
            { name: 'colher de sopa', color: 'orange' },
            { name: 'colher de chá', color: 'yellow' },
          ],
        },
      },
      Comprado: { checkbox: {} },
    });

    // 11. Planejamento Semanal DB
    dbIds.mealPlans = await createDatabase('🗓️ Planejamento Semanal (KitchenOS)', {
      Refeição: { title: {} },
      Data: { date: {} },
      Tipo: {
        select: {
          options: [
            { name: 'Almoço', color: 'blue' },
            { name: 'Jantar', color: 'purple' },
            { name: 'Marmita', color: 'green' },
          ],
        },
      },
      Servings: { number: { format: 'number' } },
      Cozinhado: { checkbox: {} },
    });

    // 12. Sessões de Cozinha DB
    dbIds.cookingSessions = await createDatabase('📅 Sessões de Cozinha (KitchenOS)', {
      Sessão: { title: {} },
      Data: { date: {} },
      Início: { rich_text: {} },
      Fim: { rich_text: {} },
      'Duração (Min)': { number: { format: 'number' } },
      Local: { rich_text: {} },
      'Equipamento Utilizado': { rich_text: {} },
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

    // 13. Avaliações Coletivas DB
    dbIds.ratings = await createDatabase('⭐ Avaliações Culinárias (KitchenOS)', {
      Avaliador: { title: {} },
      Nota: { number: { format: 'number' } },
      Comentário: { rich_text: {} },
      'Comeria de novo': { checkbox: {} },
      'Mudanças Sugeridas': { rich_text: {} },
    });

    // 14. Álbum de Fotos DB
    dbIds.photos = await createDatabase('🖼️ Álbum de Fotos (KitchenOS)', {
      Foto: { title: {} },
      'URL da Imagem': { url: {} },
      Data: { date: {} },
      Notas: { rich_text: {} },
    });

    // 15. Objetivos DB
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

    // 16. Missões DB
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

    // 17. Metas de Saúde DB
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

    // 18. Diário de Saúde DB
    dbIds.nutritionLogs = await createDatabase('🩺 Diário de Saúde (KitchenOS)', {
      Data: { title: {} },
      'Calorias Consumidas (kcal)': { number: { format: 'number' } },
      'Proteínas Consumidas (g)': { number: { format: 'number' } },
      'Carboidratos Consumidos (g)': { number: { format: 'number' } },
      'Gorduras Consumidas (g)': { number: { format: 'number' } },
      'Água Ingerida (ml)': { number: { format: 'number' } },
      'Peso Corporal (kg)': { number: { format: 'number' } },
    });

    // 19. Utensílios & Equipamentos DB
    dbIds.equipments = await createDatabase('🔧 Utensílios & Equipamentos (KitchenOS)', {
      Nome: { title: {} },
      Disponível: { checkbox: {} },
    });

    // 20. Adaptações Culinárias DB
    dbIds.adaptations = await createDatabase('🔄 Adaptações Culinárias (KitchenOS)', {
      Identificador: { title: {} },
      'Equipamento Original': { rich_text: {} },
      'Equipamento Alvo': { rich_text: {} },
      'Adaptações Aplicadas': { rich_text: {} },
      Confiança: { number: { format: 'percent' } },
      Feedback: {
        select: {
          options: [
            { name: 'Excelente', color: 'green' },
            { name: 'Boa', color: 'blue' },
            { name: 'Regular', color: 'orange' },
            { name: 'Ruim', color: 'red' },
          ]
        }
      }
    });

    // Write preliminary mappings file
    fs.writeFileSync(mappingsFilePath, JSON.stringify(dbIds, null, 2));
    console.log(`Saved preliminary mappings to ${mappingsFilePath}`);

    // --- ADD RELATION PROPERTIES (UPDATING SCHEMAS) ---
    console.log('\n--- Creating Relationships ---');

    // Recipes DB -> Cuisine
    await addRelationProperty(dbIds.recipes, 'Gastronomia', dbIds.cuisines, 'Receitas');

    // Recipe Versions DB -> Recipes DB
    await addRelationProperty(dbIds.recipeVersions, 'Receita Pai', dbIds.recipes, 'Versões');

    // Recipe Ingredients DB -> Recipe Versions DB
    await addRelationProperty(dbIds.recipeIngredients, 'Versão da Receita', dbIds.recipeVersions, 'Ingredientes');

    // Recipe Ingredients DB -> Ingredients DB
    await addRelationProperty(dbIds.recipeIngredients, 'Ingrediente Base', dbIds.ingredients);

    // Recipe Techniques DB -> Recipe Versions DB
    await addRelationProperty(dbIds.recipeTechniques, 'Versão da Receita', dbIds.recipeVersions, 'Técnicas');

    // Recipe Techniques DB -> Techniques DB
    await addRelationProperty(dbIds.recipeTechniques, 'Técnica Base', dbIds.techniques);

    // Experiments DB -> Recipe Versions DB
    await addRelationProperty(dbIds.experiments, 'Versão Testada', dbIds.recipeVersions, 'Experimentos');

    // Inventory DB -> Ingredients DB
    await addRelationProperty(dbIds.inventories, 'Ingrediente Base', dbIds.ingredients);

    // Shopping List DB -> Ingredients DB
    await addRelationProperty(dbIds.shoppingLists, 'Ingrediente Base', dbIds.ingredients);

    // Meal Plans DB -> Recipe Versions DB
    await addRelationProperty(dbIds.mealPlans, 'Versão da Receita', dbIds.recipeVersions);

    // --- Phase 9 Relations ---
    // Sessões de Cozinha -> Recipe Versions DB (M:N)
    await addRelationProperty(dbIds.cookingSessions, 'Receitas Preparadas', dbIds.recipeVersions, 'Sessões de Cozinha');

    // Avaliações Culinárias -> Sessões de Cozinha
    await addRelationProperty(dbIds.ratings, 'Sessão de Cozinha', dbIds.cookingSessions, 'Avaliações');

    // Avaliações Culinárias -> Recipe Versions DB
    await addRelationProperty(dbIds.ratings, 'Versão da Receita', dbIds.recipeVersions);

    // Álbum de Fotos -> Sessões de Cozinha
    await addRelationProperty(dbIds.photos, 'Sessão de Cozinha', dbIds.cookingSessions, 'Fotos');

    // Álbum de Fotos -> Recipe Versions DB
    await addRelationProperty(dbIds.photos, 'Versão da Receita', dbIds.recipeVersions, 'Fotos');

    // --- Phase 17 Relations ---
    // Missões Culinárias -> Objetivos (synced properties)
    await addRelationProperty(dbIds.missions, 'Objetivo Associado', dbIds.objectives, 'Missões');

    // Missões Culinárias -> Técnicas Base
    await addRelationProperty(dbIds.missions, 'Técnica Culinária', dbIds.techniques);

    // --- Phase 19 Relations ---
    // Adaptações Culinárias -> Sessões de Cozinha
    if (dbIds.cookingSessions) {
      await addRelationProperty(dbIds.adaptations, 'Sessão de Cozinha', dbIds.cookingSessions, 'Adaptações');
    }

    // Adaptações Culinárias -> Versão da Receita
    if (dbIds.recipeVersions) {
      await addRelationProperty(dbIds.adaptations, 'Versão da Receita', dbIds.recipeVersions);
    }

    console.log('\n--- Notion Setup Completed Successfully! ---');
    console.log('All databases created and interconnected.');
  } catch (error) {
    console.error('Fatal error during setup:', error);
    process.exit(1);
  }
}

run();
