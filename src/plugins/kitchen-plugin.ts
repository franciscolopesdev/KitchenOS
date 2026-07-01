import { KitchenOSPlugin } from '../core/plugin-registry.js';
import * as inventoryService from '../services/inventory.js';
import * as recipeService from '../services/recipe.js';
import * as cookingSessionService from '../services/cooking-session.js';
import * as timerService from '../services/timer.js';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { contextProvider } from '../core/context-provider.js';
import { registerKitchenRules } from './kitchen-rules.js';
import { eventEngine } from '../core/event-engine.js';

// Helper to scrape YouTube for video tutorials
async function searchYouTubeRecipes(query: string) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });
    if (!response.ok) {
      throw new Error(`YouTube request failed with status ${response.status}`);
    }
    const html = await response.text();
    
    // We search for ytInitialData JSON inside YouTube HTML
    const match = html.match(/var ytInitialData\s*=\s*({.*?});/);
    if (!match) {
      const videoMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
      const ids = Array.from(new Set(videoMatches.map(m => m[1]))).slice(0, 3);
      if (ids.length === 0) {
        return [{ title: `Pesquisa por "${query}" no YouTube`, url }];
      }
      return ids.map(id => ({
        title: `Vídeo tutorial de ${query}`,
        url: `https://www.youtube.com/watch?v=${id}`
      }));
    }

    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    
    const results: any[] = [];
    for (const item of contents) {
      const video = item.videoRenderer;
      if (video && video.videoId) {
        const title = video.title?.runs?.[0]?.text || 'Vídeo Culinário';
        results.push({
          title,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          duration: video.lengthText?.simpleText || 'N/D'
        });
        if (results.length >= 3) break;
      }
    }
    
    if (results.length === 0) {
      return [{ title: `Pesquisa por "${query}" no YouTube`, url }];
    }
    return results;
  } catch (error: any) {
    console.error('YouTube search error:', error.message);
    return [{ title: `Pesquisa por "${query}" no YouTube`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` }];
  }
}

export const kitchenPlugin: KitchenOSPlugin = {
  name: 'kitchen',
  systemInstructions: [
    'Você é o Chef IA Assistente oficial do KitchenOS.',
    'Sua missão é responder ao usuário de forma amigável, clara e prestativa em Português.',
    'Diretrizes:',
    '1. Você tem acesso direto ao estoque de alimentos, planejamentos, timers e receitas dele por meio de ferramentas.',
    '2. Sempre use ferramentas se o usuário solicitar dados que estão no banco (ex: listar estoque, buscar receitas, adicionar compras, timers).',
    '3. Nunca recomende ou use Gengibre em suas receitas (restrição estrita da companheira dele).',
    '4. Suas porções padrão sugeridas devem ser para 2 pessoas (~300g de proteína total).',
    '5. Responda em Markdown estilizado com emojis apropriados.',
    '6. Sempre consulte os objetivos e missões culinárias ativos do usuário usando a ferramenta `get_cooking_objectives` quando ele solicitar sugestões de receitas, ideias de refeições ou planejamento de cardápio, priorizando recomendar preparos que ajudem a concluir missões técnicas pendentes.',
    '7. Ao sugerir ou detalhar receitas, verifique se há um método/equipamento preferido cadastrado no banco de receitas (colunas `preferredEquipment` e `preferenceReason` retornadas em ferramentas de receitas). Se houver, dê preferência a esse método de preparo automaticamente e cite a preferência e o motivo do usuário em sua resposta.'
  ],
  tools: [
    {
      declaration: {
        name: 'get_inventory_list',
        description: 'Retorna a lista de itens no estoque (geladeira, freezer, despensa).',
        parameters: {
          type: 'OBJECT',
          properties: {
            location: {
              type: 'STRING',
              enum: ['Pantry', 'Fridge', 'Freezer'],
              description: 'Localização do estoque para filtrar'
            }
          }
        }
      },
      handler: async (args) => {
        return await inventoryService.getInventoryList(args.location);
      }
    },
    {
      declaration: {
        name: 'get_shopping_list',
        description: 'Retorna a lista de compras ativa.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      handler: async () => {
        return await inventoryService.getShoppingList();
      }
    },
    {
      declaration: {
        name: 'clear_shopping_list',
        description: 'Remove todos os itens ativos (não comprados) da lista de compras.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      handler: async () => {
        return await inventoryService.clearShoppingList();
      }
    },
    {
      declaration: {
        name: 'add_to_shopping_list',
        description: 'Adiciona um ingrediente à lista de compras.',
        parameters: {
          type: 'OBJECT',
          properties: {
            ingredientId: { type: 'NUMBER', description: 'ID do ingrediente' },
            amountNeeded: { type: 'NUMBER', description: 'Quantidade' },
            unit: { type: 'STRING', description: 'Unidade de medida' }
          },
          required: ['ingredientId', 'amountNeeded', 'unit']
        }
      },
      handler: async (args) => {
        return await inventoryService.addToShoppingList(args.ingredientId, args.amountNeeded, args.unit);
      }
    },
    {
      declaration: {
        name: 'purchase_shopping_item',
        description: 'Marca um item da lista de compras como adquirido, movendo para o estoque correto.',
        parameters: {
          type: 'OBJECT',
          properties: {
            itemId: { type: 'NUMBER', description: 'ID do item da lista de compras' }
          },
          required: ['itemId']
        }
      },
      handler: async (args) => {
        return await inventoryService.purchaseShoppingListItem(args.itemId);
      }
    },
    {
      declaration: {
        name: 'search_recipes',
        description: 'Busca receitas por termo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Termo de busca' }
          },
          required: ['query']
        }
      },
      handler: async (args) => {
        return await recipeService.searchRecipes(args.query);
      }
    },
    {
      declaration: {
        name: 'get_recipe_details',
        description: 'Retorna os detalhes completos de uma receita.',
        parameters: {
          type: 'OBJECT',
          properties: {
            recipeId: { type: 'NUMBER', description: 'ID da receita' }
          },
          required: ['recipeId']
        }
      },
      handler: async (args) => {
        return await recipeService.getRecipeDetails(args.recipeId);
      }
    },
    {
      declaration: {
        name: 'start_cooking_session',
        description: 'Inicia uma nova Sessão de Cozinha ativa com receitas vinculadas.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'Data (YYYY-MM-DD)' },
            startTime: { type: 'STRING', description: 'Hora de início (HH:MM)' },
            location: { type: 'STRING', description: 'Local' },
            chef: { type: 'STRING', description: 'Chef principal' },
            participants: { type: 'STRING', description: 'Nomes dos ajudantes' },
            recipeVersionIds: {
              type: 'ARRAY',
              items: { type: 'NUMBER' },
              description: 'IDs das versões das receitas'
            }
          },
          required: ['date', 'startTime', 'recipeVersionIds']
        }
      },
      handler: async (args) => {
        const result = await cookingSessionService.startCookingSession(args as any);
        try {
          contextProvider.updateContext({
            status: 'cooking',
            activeSessionId: result.session.id
          });
        } catch (e: any) {
          console.error('[kitchenPlugin] Failed to update context on start_cooking_session:', e.message);
        }
        return result;
      }
    },
    {
      declaration: {
        name: 'end_cooking_session',
        description: 'Conclui uma sessão de cozinha ativa, fazendo baixa de estoque e registrando o diário.',
        parameters: {
          type: 'OBJECT',
          properties: {
            sessionId: { type: 'NUMBER', description: 'ID da sessão' },
            endTime: { type: 'STRING', description: 'Hora de término (HH:MM)' },
            mood: { type: 'STRING', description: 'Humor' },
            overallRating: { type: 'NUMBER', description: 'Nota geral (1 a 5)' },
            learnings: { type: 'STRING', description: 'O que aprendeu' },
            errors: { type: 'STRING', description: 'Erros cometidos' },
            successes: { type: 'STRING', description: 'O que deu certo' },
            neverAgain: { type: 'STRING', description: 'O que evitar repetir' },
            whyWorked: { type: 'STRING', description: 'Por que funcionou' },
            nextAttemptSuggestions: { type: 'STRING', description: 'Ideias para a próxima vez' },
            generalNotes: { type: 'STRING', description: 'Notas gerais' },
            equipmentUsed: { type: 'STRING', description: 'Equipamento ou utensílio principal utilizado no preparo (ex: Air Fryer, Forno, Frigideira Inox)' },
            servingsCooked: { type: 'NUMBER', description: 'Porções cozinhadas para dedução' }
          },
          required: ['sessionId', 'endTime']
        }
      },
      handler: async (args) => {
        const result = await cookingSessionService.endCookingSession(args.sessionId, args as any);
        try {
          contextProvider.updateContext({
            status: 'idle',
            activeSessionId: undefined
          });
        } catch (e: any) {
          console.error('[kitchenPlugin] Failed to update context on end_cooking_session:', e.message);
        }
        return result;
      }
    },
    {
      declaration: {
        name: 'get_chef_timeline',
        description: 'Retorna a linha do tempo e biografia culinária do usuário.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      handler: async () => {
        return await recipeService.getChefTimeline();
      }
    },
    {
      declaration: {
        name: 'get_cooking_stats',
        description: 'Retorna estatísticas de cozimento gerais.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      handler: async () => {
        return await recipeService.getCookingStats();
      }
    },
    {
      declaration: {
        name: 'set_kitchen_timer',
        description: 'Define um cronômetro de cozinha.',
        parameters: {
          type: 'OBJECT',
          properties: {
            label: { type: 'STRING', description: 'Rótulo do timer' },
            minutes: { type: 'NUMBER', description: 'Tempo em minutos' }
          },
          required: ['label', 'minutes']
        }
      },
      handler: async (args) => {
        const tid = timerService.startKitchenTimer(args.label, args.minutes);
        return { status: 'started', timerId: tid };
      }
    },
    {
      declaration: {
        name: 'schedule_meal_plan',
        description: 'Agenda um planejamento de refeição (data e horário) e sincroniza automaticamente com o Google Agenda do usuário.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'Data do planejamento (YYYY-MM-DD)' },
            mealType: { type: 'STRING', enum: ['Lunch', 'Dinner', 'MealPrep'], description: 'Tipo da refeição' },
            recipeVersionId: { type: 'NUMBER', description: 'ID da versão da receita' },
            servings: { type: 'NUMBER', description: 'Quantidade de porções a planejar' }
          },
          required: ['date', 'mealType', 'recipeVersionId']
        }
      },
      handler: async (args) => {
        const [plan] = await db
          .insert(schema.mealPlans)
          .values({
            date: args.date,
            mealType: args.mealType,
            recipeVersionId: args.recipeVersionId,
            servings: args.servings ?? 2,
          })
          .returning();

        let calendarSyncStatus = 'Not configured';
        try {
          const { syncMealPlansToGoogleCalendar } = await import('../services/google-calendar.js');
          const syncRes = await syncMealPlansToGoogleCalendar();
          calendarSyncStatus = syncRes.success ? 'Synced successfully' : `Sync skipped: ${syncRes.message}`;
        } catch (calError: any) {
          console.error('Calendar sync error:', calError.message);
          calendarSyncStatus = `Sync failed: ${calError.message}`;
        }

        return { plan, calendarSyncStatus };
      }
    },
    {
      declaration: {
        name: 'search_youtube_videos',
        description: 'Busca vídeos de receitas ou tutoriais passo-a-passo no YouTube e retorna títulos e links.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Termo de busca para o vídeo (ex: receita de lasanha, como picar cebola)' }
          },
          required: ['query']
        }
      },
      handler: async (args) => {
        return await searchYouTubeRecipes(args.query);
      }
    },
    {
      declaration: {
        name: 'get_cooking_objectives',
        description: 'Exibe a lista de todos os objetivos culinários ativos e concluídos, juntamente com suas missões de técnica associadas e progresso.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      handler: async () => {
        const { getObjectivesList } = await import('../services/objectives.js');
        return await getObjectivesList();
      }
    },
    {
      declaration: {
        name: 'create_cooking_objective',
        description: 'Cria um novo objetivo culinário (meta de longo prazo) para focar no aprendizado (ex: Dominar Carnes, Aprender Panificação).',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Nome do objetivo' },
            description: { type: 'STRING', description: 'Descrição detalhada do objetivo culinário' }
          },
          required: ['name']
        }
      },
      handler: async (args) => {
        const { createObjective } = await import('../services/objectives.js');
        return await createObjective(args.name, args.description);
      }
    },
    {
      declaration: {
        name: 'create_cooking_mission',
        description: 'Adiciona uma nova missão de desafio associada a um objetivo, vinculando uma técnica culinária específica que a conclui ao ser executada em uma sessão.',
        parameters: {
          type: 'OBJECT',
          properties: {
            objectiveId: { type: 'NUMBER', description: 'ID do objetivo associado' },
            name: { type: 'STRING', description: 'Nome da missão (ex: Selar filé mignon perfeitamente)' },
            description: { type: 'STRING', description: 'Instruções e metas da missão' },
            techniqueId: { type: 'NUMBER', description: 'ID da técnica culinária que conclui este desafio ao ser usada' }
          },
          required: ['objectiveId', 'name', 'description', 'techniqueId']
        }
      },
      handler: async (args) => {
        const { createMission } = await import('../services/objectives.js');
        return await createMission(args.objectiveId, args.name, args.description, args.techniqueId);
      }
    }
  ],
  init: async () => {
    registerKitchenRules();
    eventEngine.start();
  }
};

export default kitchenPlugin;
