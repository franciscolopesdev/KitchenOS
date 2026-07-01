import { Telegraf } from 'telegraf';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getInventoryList, getShoppingList, addToShoppingList } from './inventory.js';
import { getOrCreateIngredient } from './recipe.js';
import dotenv from 'dotenv';

dotenv.config();

let bot: Telegraf | null = null;

export function formatShoppingListText(items: any[]): string {
  if (items.length === 0) {
    return '🛒 Sua lista de compras está vazia!';
  }

  const categories: Record<string, any[]> = {};
  for (const item of items) {
    const cat = item.category || 'Outros';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }

  let text = '🛒 *Lista de Compras KitchenOS*:\n\n';
  const emojis: Record<string, string> = {
    'Proteínas': '🥩',
    'Vegetais': '🥦',
    'Laticínios': '🧀',
    'Temperos': '🌶️',
    'Grãos': '🌾',
    'Outros': '📦',
  };

  for (const [cat, catItems] of Object.entries(categories)) {
    const emoji = emojis[cat] || '📦';
    text += `*${emoji} ${cat}*:\n`;
    for (const item of catItems) {
      text += `  • ${item.amountNeeded}${item.unit} de _${item.name}_\n`;
    }
    text += '\n';
  }

  return text.trim();
}

function parseTelegramAddItem(text: string): { amount: number; unit: string; name: string } {
  // Regex to match "500g de frango" or "2 unidades de cebola" or "3 colheres de sopa de azeite"
  const regex = /^([\d\.,]+)\s*(g|ml|unidade|unidades|colher de sopa|colher de chá|colheres|kg|l)?\s+(?:de\s+)?(.+)$/i;
  const match = text.match(regex);

  if (match) {
    let amount = parseFloat(match[1].replace(',', '.'));
    let unit = match[2] ? match[2].toLowerCase().trim() : 'unidade';
    let name = match[3].trim();

    // Standardize units
    if (unit === 'kg') {
      amount = amount * 1000;
      unit = 'g';
    } else if (unit === 'l') {
      amount = amount * 1000;
      unit = 'ml';
    } else if (unit === 'unidades') {
      unit = 'unidade';
    }

    return { amount, unit, name };
  }

  // Default fallback if no amount is matched (e.g. "/adicionar cebola")
  return { amount: 1, unit: 'unidade', name: text.trim() };
}

export function startTelegramBot(): { success: boolean; message: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'your_telegram_bot_token_here') {
    console.warn('[Telegram Bot] Skipping startup: TELEGRAM_BOT_TOKEN not configured in .env');
    return { success: false, message: 'TELEGRAM_BOT_TOKEN not configured in .env' };
  }

  try {
    bot = new Telegraf(token);

    // /start command
    bot.start((ctx) => {
      ctx.replyWithMarkdown(
        `Olá! Eu sou o assistente do *KitchenOS* 🍳\n\n` +
        `Aqui estão os comandos que você pode usar:\n` +
        `• /estoque - Ver os itens na geladeira/freezer/despensa.\n` +
        `• /compras - Ver a lista de compras atual formatada.\n` +
        `• /adicionar <quantidade><unidade> de <ingrediente> - Adiciona um item na lista de compras (ex: \`/adicionar 500g de peito de frango\` ou \`/adicionar cebola\`).\n` +
        `• /cardapio - Ver as refeições planejadas para os próximos dias.`
      );
    });

    // /estoque command
    bot.command('estoque', async (ctx) => {
      try {
        const inventory = await getInventoryList();
        if (inventory.length === 0) {
          return ctx.reply('📦 Seu estoque está vazio!');
        }

        let text = '📦 *Estoque KitchenOS*:\n\n';
        const locations: Record<string, any[]> = { Fridge: [], Freezer: [], Pantry: [] };
        
        for (const item of inventory) {
          locations[item.location].push(item);
        }

        const locationNames: Record<string, { label: string; emoji: string }> = {
          Fridge: { label: 'Geladeira', emoji: '❄️' },
          Freezer: { label: 'Freezer', emoji: '🧊' },
          Pantry: { label: 'Despensa', emoji: '🚪' },
        };

        for (const [loc, items] of Object.entries(locations)) {
          if (items.length === 0) continue;
          const info = locationNames[loc];
          text += `${info.emoji} *${info.label}*:\n`;
          for (const item of items) {
            text += `  • ${item.amount}${item.unit} de _${item.name}_\n`;
          }
          text += '\n';
        }

        ctx.replyWithMarkdown(text.trim());
      } catch (error: any) {
        ctx.reply(`Erro ao buscar estoque: ${error.message}`);
      }
    });

    // /compras command
    bot.command('compras', async (ctx) => {
      try {
        const items = await getShoppingList();
        const text = formatShoppingListText(items);
        ctx.replyWithMarkdown(text);
      } catch (error: any) {
        ctx.reply(`Erro ao buscar lista de compras: ${error.message}`);
      }
    });

    // /adicionar command
    bot.command('adicionar', async (ctx) => {
      const text = ctx.message.text.substring(10).trim(); // remove "/adicionar"
      if (!text) {
        return ctx.reply('Por favor, informe o item que deseja adicionar. Ex: /adicionar 500g de frango');
      }

      try {
        const { amount, unit, name } = parseTelegramAddItem(text);

        // Resolve or create ingredient in SQLite
        // We put it under 'Outros' category as a default for shopping list additions
        const ingredient = await getOrCreateIngredient(name, 'Outros', unit);

        // Add to SQLite Shopping List
        await addToShoppingList(ingredient.id, amount, unit);

        ctx.replyWithMarkdown(`✔ *${amount}${unit}* de *${ingredient.name}* adicionado na lista de compras!`);
      } catch (error: any) {
        ctx.reply(`Erro ao adicionar item: ${error.message}`);
      }
    });

    // /cardapio command
    bot.command('cardapio', async (ctx) => {
      try {
        const plans = await db.query.mealPlans.findMany({
          orderBy: (mp, { asc }) => [asc(mp.date)],
          limit: 7,
        });

        if (plans.length === 0) {
          return ctx.reply('🗓️ Nenhum planejamento de refeições para os próximos dias.');
        }

        let text = '🗓️ *Cardápio Planejado (Próximos Dias)*:\n\n';
        for (const plan of plans) {
          const version = await db.query.recipeVersions.findFirst({
            where: eq(schema.recipeVersions.id, plan.recipeVersionId),
          });
          if (!version) continue;

          const recipe = await db.query.recipes.findFirst({
            where: eq(schema.recipes.id, version.recipeId),
          });

          const recipeName = recipe ? recipe.name : 'Receita';
          const mealTypePt = plan.mealType === 'Lunch' ? 'Almoço' : plan.mealType === 'Dinner' ? 'Jantar' : 'Marmita';
          const dateParts = plan.date.split('-');
          const formattedDate = `${dateParts[2]}/${dateParts[1]}`;

          text += `*${formattedDate}* - ${mealTypePt}: _${recipeName}_ (v${version.versionNumber})\n`;
        }

        ctx.replyWithMarkdown(text.trim());
      } catch (error: any) {
        ctx.reply(`Erro ao buscar cardápio: ${error.message}`);
      }
    });

    // Launch Bot asynchronously
    bot.launch();
    console.log('[Telegram Bot] Bot successfully started and listening to updates.');

    // Enable graceful stop
    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));

    return { success: true, message: 'Telegram Bot successfully started' };
  } catch (error: any) {
    console.error('[Telegram Bot] Failed to initialize:', error.message);
    return { success: false, message: `Failed to initialize: ${error.message}` };
  }
}

/**
 * Sends a proactive message to a configured chat ID in the background.
 */
export async function sendProactiveMessage(text: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) {
    return false;
  }
  try {
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    return true;
  } catch (err: any) {
    console.error('[Telegram Bot] Error sending proactive message:', err.message);
    return false;
  }
}
