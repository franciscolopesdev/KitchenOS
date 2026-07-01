import { google } from 'googleapis';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, gte, lte, and } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'postmessage');
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export async function syncMealPlansToGoogleCalendar(daysAhead = 7): Promise<{ success: boolean; message: string; count?: number }> {
  const auth = getOAuth2Client();
  if (!auth) {
    console.warn('[Google Calendar] Skipping sync: Google credentials not configured in .env');
    return { success: false, message: 'Google credentials not configured in .env' };
  }

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    // 1. Define date range
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const endDate = new Date();
    endDate.setDate(today.getDate() + daysAhead);
    const endDateStr = endDate.toISOString().split('T')[0];

    // 2. Fetch meal plans in range
    const plans = await db
      .select()
      .from(schema.mealPlans)
      .where(
        and(
          gte(schema.mealPlans.date, todayStr),
          lte(schema.mealPlans.date, endDateStr)
        )
      );

    console.log(`[Google Calendar] Found ${plans.length} meal plans to sync between ${todayStr} and ${endDateStr}`);

    // 3. Clear existing KitchenOS events in this range to avoid duplicates
    // List events in range
    const eventsRes = await calendar.events.list({
      calendarId: 'primary',
      timeMin: today.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
    });

    const existingEvents = eventsRes.data.items || [];
    const kitchenOsEvents = existingEvents.filter(
      (e) => e.description && e.description.includes('[KitchenOS]')
    );

    console.log(`[Google Calendar] Removing ${kitchenOsEvents.length} old KitchenOS calendar events...`);
    for (const event of kitchenOsEvents) {
      if (event.id) {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: event.id,
        });
      }
    }

    // 4. Create new events
    let createdCount = 0;
    for (const plan of plans) {
      // Get recipe details
      const version = await db.query.recipeVersions.findFirst({
        where: eq(schema.recipeVersions.id, plan.recipeVersionId),
      });

      if (!version) continue;

      const recipe = await db.query.recipes.findFirst({
        where: eq(schema.recipes.id, version.recipeId),
      });

      const recipeName = recipe ? recipe.name : 'Receita';
      const mealNamePt = plan.mealType === 'Lunch' ? 'Almoço' : plan.mealType === 'Dinner' ? 'Jantar' : 'Marmita';
      
      const eventTitle = `🍳 ${mealNamePt}: ${recipeName} (v${version.versionNumber})`;

      // Calculate meal hours
      let startHour = 12;
      let startMinute = 0;
      if (plan.mealType === 'Dinner') {
        startHour = 19;
        startMinute = 30;
      } else if (plan.mealType === 'MealPrep') {
        startHour = 9;
        startMinute = 0;
      }

      const startDateTime = new Date(plan.date);
      // Set to correct hours in local time
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(startDateTime.getHours() + 1); // 1 hour duration

      // Create event body
      const event = {
        summary: eventTitle,
        description: `[KitchenOS] Refeição planejada no KitchenOS.\nReceita: ${recipeName}\nVersão: ${version.versionNumber}\nPorções: ${plan.servings}\nNotion: ${plan.notionPageId ? `https://notion.so/${plan.notionPageId.replace(/-/g, '')}` : 'Não sincronizado'}`,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: process.env.TIMEZONE || 'America/Sao_Paulo',
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: process.env.TIMEZONE || 'America/Sao_Paulo',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 }, // 30 minutes reminder
          ],
        },
      };

      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      createdCount++;
    }

    console.log(`[Google Calendar] Successfully created ${createdCount} events.`);
    return { success: true, message: 'Google Calendar sync completed', count: createdCount };
  } catch (error: any) {
    console.error('[Google Calendar] Sync error:', error.message);
    return { success: false, message: `Sync failed: ${error.message}` };
  }
}
