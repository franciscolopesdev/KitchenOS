import { KitchenOSPlugin } from '../core/plugin-registry.js';
import * as creService from '../services/cre.js';

export const crePlugin: KitchenOSPlugin = {
  name: 'cre',
  systemInstructions: [
    'Você é o Motor de Raciocínio Culinário (Culinary Reasoning Engine - CRE) do KitchenOS.',
    'Seu papel é auxiliar o usuário a adaptar receitas culinárias clássicas aos seus utensílios e equipamentos físicos disponíveis.',
    'Diretrizes:',
    '1. Sempre verifique os utensílios do usuário (`get_user_equipments`) antes de sugerir ou adaptar uma receita. Nunca recomende equipamentos que o usuário não possua ou que estejam desativados.',
    '2. Quando o usuário perguntar se pode fazer uma receita em um equipamento diferente (ex: "posso fazer na Air Fryer?"), use a ferramenta `adapt_recipe_equipment` para calcular a melhor adaptação baseada nas propriedades térmicas do equipamento.',
    '3. Explique os motivos das alterações físicas sugeridas (por que ajustar gorduras, tempos ou ordens) de maneira lógica e instrutiva em português.',
    '4. Se o nível de confiança (%) retornado pela adaptação for baixo (ex: < 60%), alerte o usuário sobre os riscos culinários e dê dicas de segurança.'
  ],
  tools: [
    {
      declaration: {
        name: 'get_user_equipments',
        description: 'Retorna a lista de utensílios/equipamentos de cozinha do usuário e seu status de disponibilidade.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      handler: async () => {
        const list = await creService.getEquipmentList();
        return {
          equipments: list,
          profiles: creService.EQUIPMENT_PROFILES
        };
      }
    },
    {
      declaration: {
        name: 'toggle_equipment_availability',
        description: 'Habilita ou desabilita um equipamento culinário no perfil do usuário.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'NUMBER', description: 'ID do equipamento no banco de dados.' },
            isAvailable: { type: 'BOOLEAN', description: 'Disponibilidade do equipamento (true para ativo, false para inativo).' }
          },
          required: ['id', 'isAvailable']
        }
      },
      handler: async (args) => {
        return await creService.toggleEquipment(args.id, args.isAvailable);
      }
    },
    {
      declaration: {
        name: 'adapt_recipe_equipment',
        description: 'Adapta dinamicamente as etapas e instruções de uma versão de receita para um equipamento alvo específico.',
        parameters: {
          type: 'OBJECT',
          properties: {
            recipeVersionId: { type: 'NUMBER', description: 'ID da versão da receita original no banco de dados.' },
            targetEquipment: { type: 'STRING', description: 'Nome do equipamento alvo (ex: Air Fryer, Panela de Pressão, Forno, Frigideira Inox).' }
          },
          required: ['recipeVersionId', 'targetEquipment']
        }
      },
      handler: async (args) => {
        return await creService.adaptRecipeForEquipment(args.recipeVersionId, args.targetEquipment);
      }
    },
    {
      declaration: {
        name: 'log_adaptation_feedback',
        description: 'Registra a avaliação do usuário sobre o sucesso de uma receita adaptada.',
        parameters: {
          type: 'OBJECT',
          properties: {
            adaptationId: { type: 'NUMBER', description: 'ID do registro de adaptação gerado.' },
            rating: { type: 'STRING', enum: ['Excelente', 'Boa', 'Regular', 'Ruim'], description: 'Avaliação da adaptação culinária' }
          },
          required: ['adaptationId', 'rating']
        }
      },
      handler: async (args) => {
        return await creService.logAdaptationFeedback(args.adaptationId, args.rating);
      }
    }
  ]
};

export default crePlugin;
