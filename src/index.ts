import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as recipeService from './services/recipe.js';
import * as inventoryService from './services/inventory.js';
import { prompts as aiPrompts } from './services/ai.js';
import { syncNotionToSqlite } from './notion/sync.js';

// Setup MCP Server
const server = new Server(
  {
    name: 'kitchen-os',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Define schema validation for tool parameters using Zod
const GetOrCreateCuisineSchema = z.object({
  name: z.string(),
});

const GetOrCreateTagSchema = z.object({
  name: z.string(),
});

const GetOrCreateIngredientSchema = z.object({
  name: z.string(),
  category: z.string(),
  defaultUnit: z.string().optional(),
  avoidsGinger: z.boolean().optional(),
  flavorProfile: z.string().optional(),
});

const GetOrCreateTechniqueSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  difficulty: z.string().optional(),
  flavorImpact: z.string().optional(),
});

const CreateRecipeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  cuisineName: z.string().optional(),
  tagNames: z.array(z.string()).optional(),
});

const CreateRecipeVersionSchema = z.object({
  recipeId: z.number(),
  versionNumber: z.string(),
  name: z.string(),
  description: z.string().optional(),
  yieldPortions: z.number().optional(),
  isFreezerFriendly: z.boolean().optional(),
  estimatedTimeMinutes: z.number().optional(),
  difficulty: z.string().optional(),
  ingredientsList: z.array(
    z.object({
      ingredientId: z.number(),
      amount: z.number(),
      unit: z.string(),
      notes: z.string().optional(),
      isOptional: z.boolean().optional(),
    })
  ),
  techniquesList: z.array(
    z.object({
      techniqueId: z.number(),
      stepOrder: z.number(),
      notes: z.string().optional(),
    })
  ).optional(),
});

const LogExperimentSchema = z.object({
  recipeVersionId: z.number(),
  rating: z.number().min(1).max(5),
  outcomeNotes: z.string(),
  servingsCooked: z.number().optional(),
  proteinWeightGrams: z.number().optional(),
  deltaNotes: z.string().optional(),
  nextVersionSuggestions: z.string().optional(),
  autoDeplete: z.boolean().optional(),
});

const ManageInventorySchema = z.object({
  ingredientId: z.number(),
  amount: z.number(),
  unit: z.string(),
  location: z.enum(['Pantry', 'Fridge', 'Freezer']),
  expirationDate: z.string().optional(),
});

const GetInventoryListSchema = z.object({
  location: z.enum(['Pantry', 'Fridge', 'Freezer']).optional(),
});

const AddToShoppingListSchema = z.object({
  ingredientId: z.number(),
  amountNeeded: z.number(),
  unit: z.string(),
});

const PurchaseShoppingItemSchema = z.object({
  itemId: z.number(),
});

const ScaleRecipeSchema = z.object({
  recipeVersionId: z.number(),
  targetPortions: z.number().optional(),
  targetProteinGrams: z.number().optional(),
});

const GetRecipeDetailsSchema = z.object({
  recipeId: z.number(),
});

const SearchRecipesSchema = z.object({
  query: z.string(),
});

const SyncCalendarSchema = z.object({
  daysAhead: z.number().optional(),
});

const EstimateNutritionSchema = z.object({
  recipeVersionId: z.number(),
});

const GetExpirationAlertsSchema = z.object({
  daysThreshold: z.number().optional(),
});

const GetIngredientSubstitutesSchema = z.object({
  ingredientName: z.string(),
});

const ExportRecipeMarkdownSchema = z.object({
  recipeVersionId: z.number(),
});

const GetRecipeCostSchema = z.object({
  recipeVersionId: z.number(),
});

const SetKitchenTimerSchema = z.object({
  label: z.string(),
  minutes: z.number(),
});

const ExportRecipePdfSchema = z.object({
  recipeVersionId: z.number(),
});

const SetIngredientPriceSchema = z.object({
  ingredientId: z.number(),
  pricePerUnit: z.number(),
  priceUnit: z.string().optional(),
});

const StartCookingSessionSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  startTime: z.string(), // HH:MM
  location: z.string().optional(),
  chef: z.string().optional(),
  participants: z.string().optional(),
  recipeVersionIds: z.array(z.number()),
});

const EndCookingSessionSchema = z.object({
  sessionId: z.number(),
  endTime: z.string(), // HH:MM
  durationMinutes: z.number().optional(),
  mood: z.string().optional(),
  overallRating: z.number().optional(),
  learnings: z.string().optional(),
  errors: z.string().optional(),
  successes: z.string().optional(),
  neverAgain: z.string().optional(),
  whyWorked: z.string().optional(),
  nextAttemptSuggestions: z.string().optional(),
  generalNotes: z.string().optional(),
  servingsCooked: z.number().optional(),
});

const AddSessionReviewerRatingSchema = z.object({
  sessionId: z.number(),
  recipeVersionId: z.number(),
  reviewerName: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  wouldEatAgain: z.boolean().optional(),
  suggestedChanges: z.string().optional(),
});

const AddSessionPhotoSchema = z.object({
  sessionId: z.number(),
  localPath: z.string(),
  caption: z.string().optional(),
  notes: z.string().optional(),
  recipeVersionId: z.number().optional(),
});

const GetChefTimelineSchema = z.object({});

// Register List of Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_or_create_cuisine',
        description: 'Busca ou cadastra uma culinária/país de origem no banco.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome da gastronomia, ex: Italiana, Brasileira' },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_or_create_tag',
        description: 'Busca ou cadastra uma tag no banco.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome da tag, ex: Marmitável, Comfort Food' },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_or_create_ingredient',
        description: 'Busca ou cadastra um ingrediente padrão. Bloqueia ou sinaliza gengibre automaticamente.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do ingrediente, ex: Cebola' },
            category: { type: 'string', description: 'Categoria: Proteínas, Vegetais, Temperos, Laticínios, Grãos, Outros' },
            defaultUnit: { type: 'string', description: 'Unidade padrão de medida (ex: g, ml, unidade)' },
            avoidsGinger: { type: 'boolean', description: 'Se deve marcar restrição alimentar a gengibre neste ingrediente' },
            flavorProfile: { type: 'string', description: 'JSON contendo perfil de sabor do ingrediente' },
          },
          required: ['name', 'category'],
        },
      },
      {
        name: 'get_or_create_technique',
        description: 'Busca ou cadastra uma técnica culinária.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome da técnica, ex: Refogar, Deglaçar' },
            description: { type: 'string', description: 'O que é a técnica' },
            difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'], description: 'Nível de dificuldade' },
            flavorImpact: { type: 'string', description: 'Impacto dessa técnica no perfil de sabores' },
          },
          required: ['name'],
        },
      },
      {
        name: 'create_recipe',
        description: 'Cria uma receita básica (apenas metadados). As instruções de cozimento ficam em suas versões.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do prato, ex: Strogonoff de Bisteca' },
            description: { type: 'string', description: 'Descrição curta da receita' },
            cuisineName: { type: 'string', description: 'Nome da gastronomia associada' },
            tagNames: { type: 'array', items: { type: 'string' }, description: 'Tags para categorizar' },
          },
          required: ['name'],
        },
      },
      {
        name: 'create_recipe_version',
        description: 'Cria uma nova versão (snapshot) para uma receita. Valida restrição de gengibre.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeId: { type: 'number', description: 'ID da receita no banco' },
            versionNumber: { type: 'string', description: 'Ex: 1.0, 1.1, 2.0' },
            name: { type: 'string', description: 'Nome da versão, ex: Ajuste de acidez' },
            description: { type: 'string', description: 'Resumo das diferenças nesta versão' },
            yieldPortions: { type: 'number', description: 'Número de porções base, default é 2' },
            isFreezerFriendly: { type: 'boolean', description: 'Se pode congelar, default é true' },
            estimatedTimeMinutes: { type: 'number', description: 'Tempo total estimado' },
            difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'], description: 'Dificuldade' },
            ingredientsList: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ingredientId: { type: 'number', description: 'ID do ingrediente cadastrado' },
                  amount: { type: 'number', description: 'Quantidade' },
                  unit: { type: 'string', description: 'Unidade de medida, ex: g, ml' },
                  notes: { type: 'string', description: 'Detalhes adicionais, ex: picado finamente' },
                  isOptional: { type: 'boolean', description: 'Se ingrediente é opcional' },
                },
                required: ['ingredientId', 'amount', 'unit'],
              },
            },
            techniquesList: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  techniqueId: { type: 'number', description: 'ID da técnica cadastrada' },
                  stepOrder: { type: 'number', description: 'Passo do processo culinário (1, 2, 3...)' },
                  notes: { type: 'string', description: 'Detalhes específicos da técnica para este passo' },
                },
                required: ['techniqueId', 'stepOrder'],
              },
            },
          },
          required: ['recipeId', 'versionNumber', 'name', 'ingredientsList'],
        },
      },
      {
        name: 'log_cooking_experiment',
        description: 'Registra o log de um preparo prático. Pode deduzir estoque de ingredientes automaticamente.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeVersionId: { type: 'number', description: 'ID da versão da receita cozinhada' },
            rating: { type: 'number', minimum: 1, maximum: 5, description: 'Avaliação de 1 a 5' },
            outcomeNotes: { type: 'string', description: 'Como ficou o resultado?' },
            servingsCooked: { type: 'number', description: 'Quantidade de porções servidas' },
            proteinWeightGrams: { type: 'number', description: 'Peso total de proteína em gramas, padrão: 300g' },
            deltaNotes: { type: 'string', description: 'Alterações em tempo de execução feitas na hora' },
            nextVersionSuggestions: { type: 'string', description: 'Dicas de melhoria para o próximo preparo' },
            autoDeplete: { type: 'boolean', description: 'Se deve deduzir ingredientes do estoque automaticamente' },
          },
          required: ['recipeVersionId', 'rating', 'outcomeNotes'],
        },
      },
      {
        name: 'get_recipe_details',
        description: 'Retorna a ficha completa de uma receita, incluindo a versão ativa, ingredientes, técnicas e histórico de experimentos.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeId: { type: 'number', description: 'ID da receita' },
          },
          required: ['recipeId'],
        },
      },
      {
        name: 'scale_recipe',
        description: 'Redimensiona as quantidades de ingredientes baseado em porções ou peso de proteína.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeVersionId: { type: 'number', description: 'ID da versão da receita' },
            targetPortions: { type: 'number', description: 'Porções desejadas' },
            targetProteinGrams: { type: 'number', description: 'Peso desejado da proteína principal em gramas' },
          },
          required: ['recipeVersionId'],
        },
      },
      {
        name: 'manage_inventory',
        description: 'Adiciona, atualiza ou consome itens do estoque da despensa, geladeira ou freezer.',
        inputSchema: {
          type: 'object',
          properties: {
            ingredientId: { type: 'number', description: 'ID do ingrediente' },
            amount: { type: 'number', description: 'Quantidade a adicionar (use valor negativo para remover)' },
            unit: { type: 'string', description: 'Unidade de medida' },
            location: { type: 'string', enum: ['Pantry', 'Fridge', 'Freezer'], description: 'Local onde está guardado' },
            expirationDate: { type: 'string', description: 'Data de validade, ex: YYYY-MM-DD' },
          },
          required: ['ingredientId', 'amount', 'unit', 'location'],
        },
      },
      {
        name: 'get_inventory_list',
        description: 'Exibe o estoque total de ingredientes.',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', enum: ['Pantry', 'Fridge', 'Freezer'], description: 'Filtrar por localização' },
          },
        },
      },
      {
        name: 'get_shopping_list',
        description: 'Retorna os itens ativos (não comprados) na lista de compras.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'add_to_shopping_list',
        description: 'Adiciona um item manualmente na lista de compras.',
        inputSchema: {
          type: 'object',
          properties: {
            ingredientId: { type: 'number', description: 'ID do ingrediente' },
            amountNeeded: { type: 'number', description: 'Quantidade necessária' },
            unit: { type: 'string', description: 'Unidade' },
          },
          required: ['ingredientId', 'amountNeeded', 'unit'],
        },
      },
      {
        name: 'purchase_shopping_item',
        description: 'Marca item como comprado e move automaticamente para o estoque apropriado.',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'number', description: 'ID do item na lista de compras' },
          },
          required: ['itemId'],
        },
      },
      {
        name: 'search_recipes',
        description: 'Busca por termo nas receitas e descrições.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Termo de pesquisa' },
          },
          required: ['query'],
        },
      },
      {
        name: 'sync_notion',
        description: 'Força a sincronização incremental bidirecional entre o banco SQLite local e o Notion.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'sync_calendar',
        description: 'Sincroniza os planejamentos de refeição futuros com o Google Agenda.',
        inputSchema: {
          type: 'object',
          properties: {
            daysAhead: { type: 'number', description: 'Número de dias à frente para sincronizar, default: 7' },
          },
        },
      },
      {
        name: 'get_weather',
        description: 'Consulta a temperatura e o clima atual local.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'estimate_nutrition',
        description: 'Estima e salva os macronutrientes e calorias de uma versão de receita.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeVersionId: { type: 'number', description: 'ID da versão da receita' },
          },
          required: ['recipeVersionId'],
        },
      },
      {
        name: 'format_shopping_list',
        description: 'Gera uma versão em texto estruturado e formatado (com emojis) da lista de compras ativa, ideal para colar no WhatsApp.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_expiration_alerts',
        description: 'Retorna alertas de itens no estoque próximos do vencimento.',
        inputSchema: {
          type: 'object',
          properties: {
            daysThreshold: { type: 'number', description: 'Número de dias de limite para expiração, default: 3' },
          },
        },
      },
      {
        name: 'get_cooking_stats',
        description: 'Retorna estatísticas gerais e relatórios de preparo de refeições.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_ingredient_substitutes',
        description: 'Busca e sugere substitutos culinários clássicos para um ingrediente.',
        inputSchema: {
          type: 'object',
          properties: {
            ingredientName: { type: 'string', description: 'Nome do ingrediente para buscar substitutos' },
          },
          required: ['ingredientName'],
        },
      },
      {
        name: 'export_recipe_markdown',
        description: 'Gera e retorna a ficha técnica de uma receita em formato Markdown estruturado para impressão.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeVersionId: { type: 'number', description: 'ID da versão da receita' },
          },
          required: ['recipeVersionId'],
        },
      },
      {
        name: 'format_whatsapp_share_link',
        description: 'Gera um link clicável do WhatsApp Web/Mobile contendo a lista de compras formatada.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_recipe_cost',
        description: 'Calcula o custo total estimado e por porção de uma versão de receita.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeVersionId: { type: 'number', description: 'ID da versão da receita' },
          },
          required: ['recipeVersionId'],
        },
      },
      {
        name: 'set_kitchen_timer',
        description: 'Define um cronômetro de cozinha assíncrono no terminal com alerta sonoro ao finalizar.',
        inputSchema: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Rótulo do timer, ex: Cozinhar macarrão' },
            minutes: { type: 'number', description: 'Tempo em minutos (pode ser fracionado, ex: 0.5 para 30s)' },
          },
          required: ['label', 'minutes'],
        },
      },
      {
        name: 'export_recipe_pdf',
        description: 'Gera um cartão de receita em HTML altamente estilizado e pronto para impressão/PDF.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeVersionId: { type: 'number', description: 'ID da versão da receita' },
          },
          required: ['recipeVersionId'],
        },
      },
      {
        name: 'set_ingredient_price',
        description: 'Define o preço de custo por unidade de medida para um ingrediente padrão.',
        inputSchema: {
          type: 'object',
          properties: {
            ingredientId: { type: 'number', description: 'ID do ingrediente base' },
            pricePerUnit: { type: 'number', description: 'Preço por unidade (ex: preço por grama/ml/unidade)' },
            priceUnit: { type: 'string', description: 'Unidade monetária, default: R$' },
          },
          required: ['ingredientId', 'pricePerUnit'],
        },
      },
      {
        name: 'start_cooking_session',
        description: 'Inicia uma nova Sessão de Cozinha ativa (agrupando várias receitas preparadas juntas).',
        inputSchema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Data do preparo (YYYY-MM-DD)' },
            startTime: { type: 'string', description: 'Horário de início (HH:MM)' },
            location: { type: 'string', description: 'Local, ex: Casa, Cozinha Principal' },
            chef: { type: 'string', description: 'Quem está cozinhando, default: Francisco' },
            participants: { type: 'string', description: 'Quem está ajudando / participando' },
            recipeVersionIds: { type: 'array', items: { type: 'number' }, description: 'IDs das versões das receitas sendo preparadas' },
          },
          required: ['date', 'startTime', 'recipeVersionIds'],
        },
      },
      {
        name: 'end_cooking_session',
        description: 'Finaliza uma Sessão de Cozinha ativa, aplicando diário de aprendizados, avaliações, deduzindo o estoque e evoluindo nível de técnicas utilizadas.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'number', description: 'ID da sessão de cozinha a finalizar' },
            endTime: { type: 'string', description: 'Horário de término (HH:MM)' },
            durationMinutes: { type: 'number', description: 'Duração em minutos (calculado automaticamente se omitido)' },
            mood: { type: 'string', description: 'Humor durante o preparo, ex: 😃 Contente, 🥰 Inspirado, 🥵 Estressado/Cansado' },
            overallRating: { type: 'number', description: 'Avaliação geral da sessão (1 a 5)' },
            learnings: { type: 'string', description: 'O que aprendi nesta sessão' },
            errors: { type: 'string', description: 'Erros cometidos / O que deu errado' },
            successes: { type: 'string', description: 'O que acertei / O que deu certo' },
            neverAgain: { type: 'string', description: 'Coisas a NUNCA mais repetir' },
            whyWorked: { type: 'string', description: 'Por que funcionou' },
            nextAttemptSuggestions: { type: 'string', description: 'Ideias/sugestões para o próximo preparo' },
            generalNotes: { type: 'string', description: 'Anotações gerais e observações' },
            servingsCooked: { type: 'number', description: 'Número de porções servidas para consumir no estoque' },
          },
          required: ['sessionId', 'endTime'],
        },
      },
      {
        name: 'add_session_reviewer_rating',
        description: 'Adiciona uma avaliação independente de um comensal/companheiro(a) para um prato preparado na sessão de cozinha.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'number', description: 'ID da sessão de cozinha' },
            recipeVersionId: { type: 'number', description: 'ID da versão da receita avaliada' },
            reviewerName: { type: 'string', description: 'Nome do avaliador, ex: Companheira, Francisco' },
            rating: { type: 'number', minimum: 1, maximum: 5, description: 'Avaliação de 1 a 5' },
            comment: { type: 'string', description: 'Comentários e feedback' },
            wouldEatAgain: { type: 'boolean', description: 'Se comeria este prato novamente' },
            suggestedChanges: { type: 'string', description: 'Mudanças sugeridas para a próxima versão' },
          },
          required: ['sessionId', 'recipeVersionId', 'reviewerName', 'rating'],
        },
      },
      {
        name: 'add_session_photo',
        description: 'Vincula uma foto do preparo/prato a uma sessão de cozinha e/ou versão de receita.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'number', description: 'ID da sessão de cozinha' },
            localPath: { type: 'string', description: 'Caminho local da imagem ou URL' },
            caption: { type: 'string', description: 'Legenda explicativa da foto' },
            notes: { type: 'string', description: 'Observações específicas sobre a imagem/evolução' },
            recipeVersionId: { type: 'number', description: 'ID opcional da versão da receita à qual a foto pertence' },
          },
          required: ['sessionId', 'localPath'],
        },
      },
      {
        name: 'get_chef_timeline',
        description: 'Gera e retorna a linha do tempo e biografia culinária do usuário com aprendizados, sessões e domínio técnico.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_or_create_cuisine': {
        const parsed = GetOrCreateCuisineSchema.parse(args);
        const data = await recipeService.getOrCreateCuisine(parsed.name);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_or_create_tag': {
        const parsed = GetOrCreateTagSchema.parse(args);
        const data = await recipeService.getOrCreateTag(parsed.name);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_or_create_ingredient': {
        const parsed = GetOrCreateIngredientSchema.parse(args);
        const data = await recipeService.getOrCreateIngredient(
          parsed.name,
          parsed.category,
          parsed.defaultUnit,
          parsed.avoidsGinger,
          parsed.flavorProfile
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_or_create_technique': {
        const parsed = GetOrCreateTechniqueSchema.parse(args);
        const data = await recipeService.getOrCreateTechnique(
          parsed.name,
          parsed.description,
          parsed.difficulty,
          parsed.flavorImpact
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'create_recipe': {
        const parsed = CreateRecipeSchema.parse(args);
        const data = await recipeService.createRecipe(
          parsed.name,
          parsed.description,
          parsed.cuisineName,
          parsed.tagNames
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'create_recipe_version': {
        const parsed = CreateRecipeVersionSchema.parse(args);
        const data = await recipeService.createRecipeVersion(
          parsed.recipeId,
          parsed.versionNumber,
          parsed.name,
          parsed.description,
          parsed.yieldPortions,
          parsed.isFreezerFriendly,
          parsed.estimatedTimeMinutes,
          parsed.difficulty,
          parsed.ingredientsList,
          parsed.techniquesList
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'log_cooking_experiment': {
        const parsed = LogExperimentSchema.parse(args);
        const experiment = await recipeService.logExperiment(
          parsed.recipeVersionId,
          parsed.rating,
          parsed.outcomeNotes,
          parsed.servingsCooked,
          parsed.proteinWeightGrams,
          parsed.deltaNotes,
          parsed.nextVersionSuggestions
        );

        let depletionResults: any[] = [];
        if (parsed.autoDeplete) {
          depletionResults = await inventoryService.autoDepleteInventory(
            parsed.recipeVersionId,
            parsed.servingsCooked ?? 2
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ experiment, depletionResults }),
            },
          ],
        };
      }
      case 'get_recipe_details': {
        const parsed = GetRecipeDetailsSchema.parse(args);
        const data = await recipeService.getRecipeDetails(parsed.recipeId);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'scale_recipe': {
        const parsed = ScaleRecipeSchema.parse(args);
        const data = await recipeService.scaleRecipe(
          parsed.recipeVersionId,
          parsed.targetPortions,
          parsed.targetProteinGrams
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'manage_inventory': {
        const parsed = ManageInventorySchema.parse(args);
        const data = await inventoryService.manageInventory(
          parsed.ingredientId,
          parsed.amount,
          parsed.unit,
          parsed.location,
          parsed.expirationDate
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_inventory_list': {
        const parsed = GetInventoryListSchema.parse(args);
        const data = await inventoryService.getInventoryList(parsed.location);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_shopping_list': {
        const data = await inventoryService.getShoppingList();
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'add_to_shopping_list': {
        const parsed = AddToShoppingListSchema.parse(args);
        const data = await inventoryService.addToShoppingList(
          parsed.ingredientId,
          parsed.amountNeeded,
          parsed.unit
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'purchase_shopping_item': {
        const parsed = PurchaseShoppingItemSchema.parse(args);
        const data = await inventoryService.purchaseShoppingListItem(parsed.itemId);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'search_recipes': {
        const parsed = SearchRecipesSchema.parse(args);
        const data = await recipeService.searchRecipes(parsed.query);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'sync_notion': {
        // Run synchronization in background
        const data = await syncNotionToSqlite();
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', data }) }] };
      }
      case 'sync_calendar': {
        const parsed = SyncCalendarSchema.parse(args);
        const { syncMealPlansToGoogleCalendar } = await import('./services/google-calendar.js');
        const data = await syncMealPlansToGoogleCalendar(parsed.daysAhead);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_weather': {
        const { getCurrentWeather } = await import('./services/weather.js');
        const data = await getCurrentWeather();
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'estimate_nutrition': {
        const parsed = EstimateNutritionSchema.parse(args);
        const { updateRecipeVersionNutrition } = await import('./services/nutrition.js');
        const data = await updateRecipeVersionNutrition(parsed.recipeVersionId);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'format_shopping_list': {
        const items = await inventoryService.getShoppingList();
        const { formatShoppingListText } = await import('./services/telegram.js');
        const data = formatShoppingListText(items);
        return { content: [{ type: 'text', text: data }] };
      }
      case 'get_expiration_alerts': {
        const parsed = GetExpirationAlertsSchema.parse(args);
        const data = await inventoryService.getExpirationAlerts(parsed.daysThreshold);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_cooking_stats': {
        const data = await recipeService.getCookingStats();
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_ingredient_substitutes': {
        const parsed = GetIngredientSubstitutesSchema.parse(args);
        const data = await recipeService.getIngredientSubstitutes(parsed.ingredientName);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'export_recipe_markdown': {
        const parsed = ExportRecipeMarkdownSchema.parse(args);
        const data = await recipeService.exportRecipeToMarkdown(parsed.recipeVersionId);
        return { content: [{ type: 'text', text: data }] };
      }
      case 'format_whatsapp_share_link': {
        const items = await inventoryService.getShoppingList();
        const { formatShoppingListText } = await import('./services/telegram.js');
        const listText = formatShoppingListText(items);
        const encodedText = encodeURIComponent(listText);
        const whatsappLink = `https://api.whatsapp.com/send?text=${encodedText}`;
        const whatsappWebLink = `https://web.whatsapp.com/send?text=${encodedText}`;
        return {
          content: [
            {
              type: 'text',
              text: `🔗 *Links de Compartilhamento WhatsApp*:\n\n• *Link Universal (Mobile/Web):* ${whatsappLink}\n• *Link Dedicado WhatsApp Web:* ${whatsappWebLink}\n\nClique no link acima para abrir o WhatsApp com a mensagem pré-preenchida contendo os itens do mercado!`
            }
          ]
        };
      }
      case 'get_recipe_cost': {
        const parsed = GetRecipeCostSchema.parse(args);
        const data = await recipeService.calculateRecipeCost(parsed.recipeVersionId);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'set_kitchen_timer': {
        const parsed = SetKitchenTimerSchema.parse(args);
        const { startKitchenTimer } = await import('./services/timer.js');
        const timerId = startKitchenTimer(parsed.label, parsed.minutes);
        return { content: [{ type: 'text', text: `Timer iniciado com sucesso! ID: ${timerId}` }] };
      }
      case 'export_recipe_pdf': {
        const parsed = ExportRecipePdfSchema.parse(args);
        const { generateRecipeHtmlCard } = await import('./services/pdf-generator.js');
        const filePath = await generateRecipeHtmlCard(parsed.recipeVersionId);
        return { content: [{ type: 'text', text: `Ficha técnica em HTML gerada com sucesso em: ${filePath}` }] };
      }
      case 'set_ingredient_price': {
        const parsed = SetIngredientPriceSchema.parse(args);
        const data = await recipeService.setIngredientPrice(parsed.ingredientId, parsed.pricePerUnit, parsed.priceUnit);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'start_cooking_session': {
        const parsed = StartCookingSessionSchema.parse(args);
        const { startCookingSession } = await import('./services/cooking-session.js');
        const data = await startCookingSession(parsed);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'end_cooking_session': {
        const parsed = EndCookingSessionSchema.parse(args);
        const { endCookingSession } = await import('./services/cooking-session.js');
        const data = await endCookingSession(parsed.sessionId, parsed);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'add_session_reviewer_rating': {
        const parsed = AddSessionReviewerRatingSchema.parse(args);
        const { addSessionReviewerRating } = await import('./services/cooking-session.js');
        const data = await addSessionReviewerRating(
          parsed.sessionId,
          parsed.recipeVersionId,
          parsed.reviewerName,
          parsed.rating,
          parsed.comment,
          parsed.wouldEatAgain,
          parsed.suggestedChanges
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'add_session_photo': {
        const parsed = AddSessionPhotoSchema.parse(args);
        const { addSessionPhoto } = await import('./services/cooking-session.js');
        const data = await addSessionPhoto(
          parsed.sessionId,
          parsed.localPath,
          parsed.caption,
          parsed.notes,
          parsed.recipeVersionId
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      case 'get_chef_timeline': {
        const data = await recipeService.getChefTimeline();
        return { content: [{ type: 'text', text: data }] };
      }
      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${error.message}` }],
    };
  }
});

// Register List of Prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: aiPrompts.reflectOnRecipe.name,
        description: aiPrompts.reflectOnRecipe.description,
        arguments: aiPrompts.reflectOnRecipe.arguments,
      },
      {
        name: aiPrompts.suggestRecipes.name,
        description: aiPrompts.suggestRecipes.description,
        arguments: aiPrompts.suggestRecipes.arguments,
      },
      {
        name: aiPrompts.parseCookingLog.name,
        description: aiPrompts.parseCookingLog.description,
        arguments: aiPrompts.parseCookingLog.arguments,
      },
      {
        name: aiPrompts.generateRecipe.name,
        description: aiPrompts.generateRecipe.description,
        arguments: aiPrompts.generateRecipe.arguments,
      },
    ],
  };
});

// Handle Prompt Execution
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case aiPrompts.reflectOnRecipe.name: {
        const recipeIdStr = args?.recipeId || args?.recipeName;
        if (!recipeIdStr) throw new Error('Recipe identifier (recipeId or recipeName) is required.');

        // Try parsing ID, otherwise search by name
        let recipeDetails;
        if (/^\d+$/.test(recipeIdStr)) {
          recipeDetails = await recipeService.getRecipeDetails(parseInt(recipeIdStr));
        } else {
          const search = await recipeService.searchRecipes(recipeIdStr);
          if (search.length === 0) throw new Error(`Recipe "${recipeIdStr}" not found.`);
          recipeDetails = await recipeService.getRecipeDetails(search[0].id);
        }

        if (!recipeDetails) throw new Error(`Recipe details could not be retrieved.`);

        const historyMarkdown = recipeDetails.history
          .map(
            (h) =>
              `- **v${h.versionNumber}** (${h.cookedAt}) - Nota: ${'⭐'.repeat(h.rating)}\n  * Relato: ${h.outcomeNotes}\n  * Improvisos: ${h.deltaNotes ?? 'Nenhum'}`
          )
          .join('\n');

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: aiPrompts.reflectOnRecipe.template(recipeDetails.name, historyMarkdown),
              },
            },
          ],
        };
      }
      case aiPrompts.suggestRecipes.name: {
        const inventory = await inventoryService.getInventoryList();
        const inventoryMarkdown = inventory
          .map((i) => `- **${i.name}**: ${i.amount}${i.unit} (${i.location})`)
          .join('\n');

        let weatherSummary = '';
        try {
          const { getCurrentWeather } = await import('./services/weather.js');
          const weather = await getCurrentWeather();
          weatherSummary = `Clima atual do usuário: ${weather.temperature}°C, ${weather.description}.`;
          if (weather.isCold) {
            weatherSummary += ` Está frio! Dê uma leve preferência a receitas mais quentes e reconfortantes (ex: sopas, caldos, assados).`;
          } else if (weather.isRainy) {
            weatherSummary += ` Está chovendo! Dê uma leve preferência a comfort foods quentes.`;
          } else if (weather.isHot) {
            weatherSummary += ` Está quente! Dê uma leve preferência a receitas frescas ou grelhados rápidos.`;
          }
        } catch (e) {
          // ignore
        }

        const basePromptText = aiPrompts.suggestRecipes.template(inventoryMarkdown);
        const promptTextWithWeather = weatherSummary 
          ? `${weatherSummary}\n\n${basePromptText}`
          : basePromptText;

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: promptTextWithWeather,
              },
            },
          ],
        };
      }
      case aiPrompts.parseCookingLog.name: {
        const rawInput = args?.userInput || args?.relato;
        if (!rawInput) throw new Error('User input is required.');

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: aiPrompts.parseCookingLog.template(rawInput),
              },
            },
          ],
        };
      }
      case aiPrompts.generateRecipe.name: {
        const recipeName = args?.recipeName || args?.nome;
        if (!recipeName) throw new Error('Recipe name is required.');

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: aiPrompts.generateRecipe.template(recipeName),
              },
            },
          ],
        };
      }
      default:
        throw new Error(`Prompt not found: ${name}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to compile prompt: ${error.message}`);
  }
});

// Boot Server on Stdio Transport
async function run() {
  // Start Telegram Bot
  try {
    const { startTelegramBot } = await import('./services/telegram.js');
    startTelegramBot();
  } catch (error: any) {
    console.error('Failed to start Telegram Bot:', error.message);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KitchenOS MCP Server running on stdio');
}

run().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
