import { KitchenOSPlugin } from '../core/plugin-registry.js';
import * as healthService from '../services/health.js';

export const healthPlugin: KitchenOSPlugin = {
  name: 'health',
  systemInstructions: [
    'Você é o Assistente de Saúde e Nutrição do KitchenOS.',
    'Seu papel é ajudar o usuário a acompanhar seus registros de peso, hidratação e consumo calórico/macronutrientes.',
    'Diretrizes:',
    '1. Sempre use as ferramentas de saúde para consultar o diário (`get_health_summary`) ou registrar novos consumos quando o usuário relatar que bebeu água, pesou-se ou comeu algo fora de uma sessão culinária.',
    '2. Quando o usuário pedir sugestões, incentive-o a manter-se hidratado e a balancear os carboidratos, proteínas e gorduras de acordo com a meta ativa dele.',
    '3. Responda em Português de forma motivadora, clara e estruturada com emojis apropriados.'
  ],
  tools: [
    {
      declaration: {
        name: 'get_health_summary',
        description: 'Retorna o resumo diário de saúde (metas ativas vs logs consumidos, peso e água).',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'Data para consulta no formato YYYY-MM-DD. Se omitida, usa a data atual.' }
          }
        }
      },
      handler: async (args) => {
        const dateStr = args.date || new Date().toISOString().split('T')[0];
        return await healthService.getDailySummary(dateStr);
      }
    },
    {
      declaration: {
        name: 'log_water_intake',
        description: 'Adiciona consumo de água (em ml) para uma determinada data.',
        parameters: {
          type: 'OBJECT',
          properties: {
            ml: { type: 'NUMBER', description: 'Quantidade de água ingerida em mililitros (ex: 250, 500)' },
            date: { type: 'STRING', description: 'Data do registro no formato YYYY-MM-DD. Se omitida, usa a data atual.' }
          },
          required: ['ml']
        }
      },
      handler: async (args) => {
        const dateStr = args.date || new Date().toISOString().split('T')[0];
        return await healthService.logWaterIntake(dateStr, args.ml);
      }
    },
    {
      declaration: {
        name: 'log_weight',
        description: 'Registra o peso corporal (em kg) para uma determinada data.',
        parameters: {
          type: 'OBJECT',
          properties: {
            weightKg: { type: 'NUMBER', description: 'Peso corporal em kg (ex: 78.5)' },
            date: { type: 'STRING', description: 'Data do registro no formato YYYY-MM-DD. Se omitida, usa a data atual.' }
          },
          required: ['weightKg']
        }
      },
      handler: async (args) => {
        const dateStr = args.date || new Date().toISOString().split('T')[0];
        return await healthService.logWeight(dateStr, args.weightKg);
      }
    },
    {
      declaration: {
        name: 'create_health_goal',
        description: 'Define ou atualiza a meta de saúde ativa do usuário (calorias, macros, peso e água).',
        parameters: {
          type: 'OBJECT',
          properties: {
            goalType: { type: 'STRING', enum: ['WeightLoss', 'WeightGain', 'Maintenance', 'Hypertrophy'], description: 'Tipo da meta' },
            targetWeightKg: { type: 'NUMBER', description: 'Peso alvo em kg' },
            targetCalories: { type: 'NUMBER', description: 'Limite diário de calorias (kcal)' },
            targetProtein: { type: 'NUMBER', description: 'Meta diária de proteínas (g)' },
            targetCarbs: { type: 'NUMBER', description: 'Meta diária de carboidratos (g)' },
            targetFat: { type: 'NUMBER', description: 'Meta diária de gorduras (g)' },
            targetWaterMl: { type: 'NUMBER', description: 'Meta diária de hidratação (ml, padrão: 2000)' }
          },
          required: ['goalType', 'targetCalories']
        }
      },
      handler: async (args) => {
        return await healthService.createHealthGoal(
          args.goalType,
          args.targetWeightKg ?? null,
          args.targetCalories,
          args.targetProtein ?? null,
          args.targetCarbs ?? null,
          args.targetFat ?? null,
          args.targetWaterMl ?? 2000
        );
      }
    },
    {
      declaration: {
        name: 'log_custom_meal',
        description: 'Registra o consumo de uma refeição customizada fora de sessões culinárias (lanches, café da manhã).',
        parameters: {
          type: 'OBJECT',
          properties: {
            calories: { type: 'NUMBER', description: 'Calorias da refeição (kcal)' },
            protein: { type: 'NUMBER', description: 'Proteínas (g)' },
            carbs: { type: 'NUMBER', description: 'Carboidratos (g)' },
            fat: { type: 'NUMBER', description: 'Gorduras (g)' },
            date: { type: 'STRING', description: 'Data do consumo no formato YYYY-MM-DD. Se omitida, usa a data atual.' }
          },
          required: ['calories']
        }
      },
      handler: async (args) => {
        const dateStr = args.date || new Date().toISOString().split('T')[0];
        return await healthService.logNutrition(
          dateStr,
          args.calories,
          args.protein ?? 0,
          args.carbs ?? 0,
          args.fat ?? 0
        );
      }
    }
  ]
};

export default healthPlugin;
