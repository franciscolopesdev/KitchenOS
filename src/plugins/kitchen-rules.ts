import { AppEventRule, eventEngine, pushNotification } from '../core/event-engine.js';
import * as inventoryService from '../services/inventory.js';
import { getCurrentWeather } from '../services/weather.js';
import { sendProactiveMessage } from '../services/telegram.js';
import { contextProvider } from '../core/context-provider.js';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Register kitchen-related EventEngine rules.
 */
export function registerKitchenRules(): void {
  // 1. Expiration Alert Rule (checks once an hour, runs warning if expiring in <= 3 days)
  eventEngine.registerRule({
    id: 'kitchen-expiration-alert',
    name: 'Alerta de Ingredientes Expirando',
    description: 'Varre o estoque local por itens vencendo em até 3 dias e gera alertas.',
    priority: 'Important',
    cooldownSeconds: 3600 * 12, // 12 hours cooldown to avoid spamming the user
    condition: async () => {
      try {
        const expiring = await inventoryService.getExpirationAlerts(3);
        return expiring.length > 0;
      } catch {
        return false;
      }
    },
    action: async () => {
      try {
        const expiring = await inventoryService.getExpirationAlerts(3);
        let listText = expiring.map(i => `• *${i.ingredientName}* (${i.amount}${i.unit}) vence em _${i.expirationDate}_`).join('\n');
        
        const title = '⚠️ *Alerta de Validade KitchenOS*:\n';
        const msg = `${title}Os seguintes ingredientes estão próximos da validade no seu estoque:\n\n${listText}\n\nQue tal preparar uma receita para utilizá-los?`;

        console.log('[EventEngine] Expiring ingredients alert fired!');
        pushNotification(msg, 'Warning');
        await sendProactiveMessage(msg);
      } catch (err: any) {
        console.error('[EventEngine] Error in expiration alert action:', err.message);
      }
    }
  });

  // 2. Cold Weather Dinner Suggestion Rule (checks local weather around dinner hours 18:00 - 20:00)
  eventEngine.registerRule({
    id: 'kitchen-cold-weather-dinner',
    name: 'Sugestão de Jantar por Clima',
    description: 'Sugere receitas quentes e confortantes no jantar se o clima local estiver abaixo de 18°C ou chuvoso.',
    priority: 'Suggestion',
    cooldownSeconds: 3600 * 6, // 6 hours cooldown
    condition: async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const isDinnerTime = currentHour >= 18 && currentHour <= 21;
      
      const ctx = contextProvider.getContext();
      const isUserHome = ctx.location === 'home' && ctx.status !== 'sleeping';

      if (!isDinnerTime || !isUserHome) {
        return false;
      }

      try {
        const weather = await getCurrentWeather();
        // Trigger if temperature is below 18C or it is rainy
        return weather.isCold || weather.isRainy;
      } catch {
        return false;
      }
    },
    action: async () => {
      try {
        const weather = await getCurrentWeather();
        const condPt = weather.isRainy ? 'chovendo' : 'frio';
        const msg = `❄️ *Sugestão do Chef KitchenOS*:\n\nEstá bastante *${condPt}* lá fora (${weather.temperature}°C, ${weather.description}).\n\nQue tal preparar uma receita quente e reconfortante hoje para se aquecer? 🍵🥣`;

        console.log('[EventEngine] Cold weather dinner alert fired!');
        pushNotification(msg, 'Suggestion');
        await sendProactiveMessage(msg);
      } catch (err: any) {
        console.error('[EventEngine] Error in cold weather dinner action:', err.message);
      }
    }
  });

  // 3. Active Mission Recommendation Rule (checks every 24 hours)
  eventEngine.registerRule({
    id: 'kitchen-active-missions-recommendation',
    name: 'Sugestão de Preparo por Missões Ativas',
    description: 'Sugere receitas cadastradas ou busca no YouTube para concluir desafios de técnica culinária ativos.',
    priority: 'Suggestion',
    cooldownSeconds: 3600 * 24, // 24 hours cooldown
    condition: async () => {
      try {
        const activeMissions = await db
          .select()
          .from(schema.missions)
          .where(eq(schema.missions.status, 'Active'));
        return activeMissions.length > 0;
      } catch {
        return false;
      }
    },
    action: async () => {
      try {
        // Get all active missions
        const activeMissions = await db
          .select()
          .from(schema.missions)
          .where(eq(schema.missions.status, 'Active'));
        
        if (activeMissions.length === 0) return;

        // Choose the first active mission
        const mission = activeMissions[0];
        
        // Resolve technique name
        const tech = await db.query.techniques.findFirst({
          where: eq(schema.techniques.id, mission.techniqueId)
        });
        
        const techniqueName = tech ? tech.name : 'Técnica';

        // Find recipes that use this technique in the database
        const recipeTechs = await db
          .select()
          .from(schema.recipeTechniques)
          .where(eq(schema.recipeTechniques.techniqueId, mission.techniqueId));
        
        const matchingRecipes = [];
        for (const rt of recipeTechs) {
          const version = await db.query.recipeVersions.findFirst({
            where: eq(schema.recipeVersions.id, rt.recipeVersionId)
          });
          if (version) {
            const recipe = await db.query.recipes.findFirst({
              where: eq(schema.recipes.id, version.recipeId)
            });
            if (recipe) {
              matchingRecipes.push(recipe.name);
            }
          }
        }

        // Remove duplicate recipe names
        const uniqueRecipes = Array.from(new Set(matchingRecipes));

        let msg = '';
        if (uniqueRecipes.length > 0) {
          const recipeList = uniqueRecipes.map(r => `• *${r}*`).join('\n');
          msg = `🎯 *Desafio Ativo KitchenOS*:\n\nQue tal tentar concluir a missão *"${mission.name}"* hoje?\n\nVocê tem as seguintes receitas cadastradas que utilizam a técnica *"${techniqueName}"*:\n\n${recipeList}\n\nQue tal cozinhar uma delas? 🍳`;
        } else {
          msg = `🎯 *Desafio Ativo KitchenOS*:\n\nVocê tem a missão ativa *"${mission.name}"* para treinar a técnica *"${techniqueName}"*.\n\nNão encontramos nenhuma receita no seu banco de dados usando essa técnica. Que tal cadastrar uma nova receita ou procurar por vídeos explicativos no YouTube sobre como dominar a técnica *"${techniqueName}"*? 📹`;
        }

        console.log(`[EventEngine] Active mission recommendation fired for "${mission.name}"`);
        pushNotification(msg, 'Suggestion');
        await sendProactiveMessage(msg);
      } catch (err: any) {
        console.error('[EventEngine] Error in active mission recommendation action:', err.message);
      }
    }
  });

  // 4. Hydration Reminder Rule (checks late afternoon)
  eventEngine.registerRule({
    id: 'health-hydration-reminder',
    name: 'Lembrete de Hidratação',
    description: 'Lembra o usuário de beber água se o consumo estiver abaixo de 50% da meta diária no final da tarde.',
    priority: 'Suggestion',
    cooldownSeconds: 3600 * 12, // 12 hours cooldown
    condition: async () => {
      const now = new Date();
      const currentHour = now.getHours();
      // Fired between 16:00 and 19:00
      const isLateAfternoon = currentHour >= 16 && currentHour <= 19;
      if (!isLateAfternoon) return false;

      try {
        const { getDailySummary } = await import('../services/health.js');
        const dateStr = now.toISOString().split('T')[0];
        const summary = await getDailySummary(dateStr);
        if (summary.goal && summary.goal.targetWaterMl > 0) {
          return summary.actual.waterIntakeMl < (summary.goal.targetWaterMl * 0.5);
        }
        return false;
      } catch {
        return false;
      }
    },
    action: async () => {
      try {
        const { getDailySummary } = await import('../services/health.js');
        const dateStr = new Date().toISOString().split('T')[0];
        const summary = await getDailySummary(dateStr);
        if (summary.goal) {
          const msg = `💧 *Lembrete de Hidratação KitchenOS*:\n\nVocê registrou apenas *${summary.actual.waterIntakeMl}ml* de água hoje. Sua meta diária é *${summary.goal.targetWaterMl}ml*.\n\nQue tal beber um copo de água agora para manter a saúde em dia? 🥛`;
          console.log('[EventEngine] Hydration reminder fired!');
          pushNotification(msg, 'Suggestion');
          await sendProactiveMessage(msg);
        }
      } catch (err: any) {
        console.error('[EventEngine] Error in hydration reminder action:', err.message);
      }
    }
  });

  // 5. Equipment Compatibility Rule (checks meal plans for unavailable equipment and alerts user)
  eventEngine.registerRule({
    id: 'cre-equipment-compatibility-alert',
    name: 'Alerta de Incompatibilidade de Utensílios',
    description: 'Verifica se alguma refeição planejada exige equipamentos desativados no perfil do usuário.',
    priority: 'Suggestion',
    cooldownSeconds: 3600 * 24, // 24 hours cooldown
    condition: async () => {
      try {
        const upcomingPlans = await db
          .select()
          .from(schema.mealPlans)
          .where(eq(schema.mealPlans.isCooked, false));
        
        if (upcomingPlans.length === 0) return false;

        const unavailable = await db
          .select({ name: schema.userEquipments.name })
          .from(schema.userEquipments)
          .where(eq(schema.userEquipments.isAvailable, false));
        
        const unavailableNames = unavailable.map(u => u.name.toLowerCase());
        if (unavailableNames.length === 0) return false;

        for (const plan of upcomingPlans) {
          const version = await db.query.recipeVersions.findFirst({
            where: eq(schema.recipeVersions.id, plan.recipeVersionId)
          });
          if (version) {
            const desc = (version.name + ' ' + (version.description || '')).toLowerCase();
            for (const name of unavailableNames) {
              if (desc.includes(name)) {
                return true;
              }
            }
          }
        }
        return false;
      } catch {
        return false;
      }
    },
    action: async () => {
      try {
        const upcomingPlans = await db
          .select()
          .from(schema.mealPlans)
          .where(eq(schema.mealPlans.isCooked, false));

        const unavailable = await db
          .select({ name: schema.userEquipments.name })
          .from(schema.userEquipments)
          .where(eq(schema.userEquipments.isAvailable, false));
        const unavailableNames = unavailable.map(u => u.name.toLowerCase());

        for (const plan of upcomingPlans) {
          const version = await db.query.recipeVersions.findFirst({
            where: eq(schema.recipeVersions.id, plan.recipeVersionId)
          });
          if (version) {
            const desc = (version.name + ' ' + (version.description || '')).toLowerCase();
            for (const name of unavailableNames) {
              if (desc.includes(name)) {
                const recipe = await db.query.recipes.findFirst({
                  where: eq(schema.recipes.id, version.recipeId)
                });
                const recipeName = recipe ? recipe.name : version.name;
                const eqName = name.charAt(0).toUpperCase() + name.slice(1);
                
                const msg = `⚠️ *Aviso de Utensílios KitchenOS*:\n\nVocê planejou preparar a receita *"${recipeName}"*, que exige o uso de *"${eqName}"*.\n\nNotamos que este utensílio está marcado como indisponível no seu perfil. Você pode usar o **Motor de Raciocínio (CRE)** no chat ou painel para adaptá-lo para outro equipamento! 🔄`;
                console.log('[EventEngine] Equipment compatibility warning fired!');
                pushNotification(msg, 'Suggestion');
                await sendProactiveMessage(msg);
                return; // Alert one at a time
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[EventEngine] Error in equipment compatibility action:', err.message);
      }
    }
  });
}

