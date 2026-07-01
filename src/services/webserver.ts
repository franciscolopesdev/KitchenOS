import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import * as recipeService from './recipe.js';
import * as inventoryService from './inventory.js';
import * as cookingSessionService from './cooking-session.js';
import * as timerService from './timer.js';
import * as creService from './cre.js';
import { pluginRegistry } from '../core/plugin-registry.js';
import { kitchenPlugin } from '../plugins/kitchen-plugin.js';
import { healthPlugin } from '../plugins/health-plugin.js';
import { crePlugin } from '../plugins/cre-plugin.js';
import { activeNotifications } from '../core/event-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');

// Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Register plugins at startup
await pluginRegistry.register(kitchenPlugin);
await pluginRegistry.register(healthPlugin);
await pluginRegistry.register(crePlugin);

// Helper to call Gemini API
async function callGemini(apiKey: string, contents: any[], toolsEnabled = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const systemInstruction = {
    parts: [
      {
        text: pluginRegistry.getSystemInstructions()
      }
    ]
  };

  const body: any = {
    contents,
    systemInstruction,
  };

  const schemaObj = pluginRegistry.getGeminiToolsSchema();
  if (toolsEnabled && schemaObj.length > 0) {
    body.tools = schemaObj;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${errorText}`);
  }

  return await response.json();
}

// REST HTTP Server
const PORT = 3030;
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // JSON Body parser helper
  const getBody = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
  };

  // API Router
  try {
    if (pathname === '/api/inventory' && req.method === 'GET') {
      const location = parsedUrl.searchParams.get('location') as any;
      const data = await inventoryService.getInventoryList(location);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/shopping-list' && req.method === 'GET') {
      const data = await inventoryService.getShoppingList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/shopping-list/purchase' && req.method === 'POST') {
      const { itemId } = await getBody();
      const data = await inventoryService.purchaseShoppingListItem(itemId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/shopping-list/add' && req.method === 'POST') {
      const { ingredientId, amountNeeded, unit } = await getBody();
      const data = await inventoryService.addToShoppingList(ingredientId, amountNeeded, unit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/shopping-list/clear' && req.method === 'POST') {
      const data = await inventoryService.clearShoppingList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/ingredients' && req.method === 'GET') {
      const data = await db.select().from(schema.ingredients);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/recipes' && req.method === 'GET') {
      const data = await db.select().from(schema.recipes);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/recipe-versions' && req.method === 'GET') {
      const data = await db
        .select({
          id: schema.recipeVersions.id,
          name: schema.recipeVersions.name,
          versionNumber: schema.recipeVersions.versionNumber,
          recipeName: schema.recipes.name,
          preferredEquipment: schema.recipes.preferredEquipment,
          preferenceReason: schema.recipes.preferenceReason,
        })
        .from(schema.recipeVersions)
        .innerJoin(schema.recipes, eq(schema.recipeVersions.recipeId, schema.recipes.id));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/timeline' && req.method === 'GET') {
      const data = await recipeService.getChefTimeline();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ timeline: data }));
      return;
    }

    if (pathname === '/api/stats' && req.method === 'GET') {
      const data = await recipeService.getCookingStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/timers' && req.method === 'GET') {
      const data = timerService.listActiveTimers();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/notifications' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(activeNotifications));
      return;
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hasGeminiKey: !!process.env.GEMINI_API_KEY }));
      return;
    }

    if (pathname === '/api/objectives' && req.method === 'GET') {
      const { getObjectivesList } = await import('./objectives.js');
      const data = await getObjectivesList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/objectives/create' && req.method === 'POST') {
      const { name, description } = await getBody();
      const { createObjective } = await import('./objectives.js');
      const data = await createObjective(name, description);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/missions/create' && req.method === 'POST') {
      const { objectiveId, name, description, techniqueId } = await getBody();
      const { createMission } = await import('./objectives.js');
      const data = await createMission(objectiveId, name, description, techniqueId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/health/summary' && req.method === 'GET') {
      const dateStr = parsedUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
      const { getDailySummary } = await import('./health.js');
      const data = await getDailySummary(dateStr);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/health/log' && req.method === 'POST') {
      const { type, value, date, calories, protein, carbs, fat } = await getBody();
      const dateStr = date || new Date().toISOString().split('T')[0];
      const { logWeight, logWaterIntake, logNutrition } = await import('./health.js');
      
      let result: any;
      if (type === 'weight') {
        result = await logWeight(dateStr, parseFloat(value));
      } else if (type === 'water') {
        result = await logWaterIntake(dateStr, parseInt(value));
      } else if (type === 'meal') {
        result = await logNutrition(dateStr, calories || 0, protein || 0, carbs || 0, fat || 0);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid log type' }));
        return;
      }

      // Trigger Notion sync
      const { syncNotionToSqlite } = await import('../notion/sync.js');
      syncNotionToSqlite().catch(err => console.error('Auto sync error:', err.message));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/health/goal' && req.method === 'POST') {
      const { goalType, targetWeightKg, targetCalories, targetProtein, targetCarbs, targetFat, targetWaterMl } = await getBody();
      const { createHealthGoal } = await import('./health.js');
      const result = await createHealthGoal(
        goalType,
        targetWeightKg ?? null,
        targetCalories,
        targetProtein ?? null,
        targetCarbs ?? null,
        targetFat ?? null,
        targetWaterMl ?? 2000
      );

      // Trigger Notion sync
      const { syncNotionToSqlite } = await import('../notion/sync.js');
      syncNotionToSqlite().catch(err => console.error('Auto sync error:', err.message));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/equipments' && req.method === 'GET') {
      const data = await creService.getEquipmentList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/equipments/toggle' && req.method === 'POST') {
      const { id, isAvailable } = await getBody();
      const result = await creService.toggleEquipment(id, isAvailable);

      // Trigger Notion sync
      const { syncNotionToSqlite } = await import('../notion/sync.js');
      syncNotionToSqlite().catch(err => console.error('Auto sync error:', err.message));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/cre/adapt' && req.method === 'POST') {
      const { recipeVersionId, targetEquipment, cookingSessionId } = await getBody();
      const result = await creService.adaptRecipeForEquipment(recipeVersionId, targetEquipment, cookingSessionId);

      // Trigger Notion sync
      const { syncNotionToSqlite } = await import('../notion/sync.js');
      syncNotionToSqlite().catch(err => console.error('Auto sync error:', err.message));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/cre/feedback' && req.method === 'POST') {
      const { adaptationId, rating } = await getBody();
      const result = await creService.logAdaptationFeedback(adaptationId, rating);

      // Trigger Notion sync
      const { syncNotionToSqlite } = await import('../notion/sync.js');
      syncNotionToSqlite().catch(err => console.error('Auto sync error:', err.message));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/timers/cancel' && req.method === 'POST') {
      const { timerId } = await getBody();
      const success = timerService.cancelKitchenTimer(timerId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname === '/api/timers/start' && req.method === 'POST') {
      const { label, minutes } = await getBody();
      const timerId = timerService.startKitchenTimer(label, parseFloat(minutes));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, timerId }));
      return;
    }

    // AI Chat loop endpoint (Gemini Agent Orchestrator)
    if (pathname === '/api/chat' && req.method === 'POST') {
      const apiKey = (req.headers['x-gemini-key'] as string) || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gemini API key is required. Pass in headers or set in .env' }));
        return;
      }

      const { messages } = await getBody();

      // Conversation loop
      try {
        let geminiResponse = await callGemini(apiKey, messages);
        let candidate = geminiResponse.candidates?.[0];
        let content = candidate?.content;

        // Loop handling function/tool execution (up to 5 loops to prevent infinite loops)
        let loopCount = 0;
        while (content?.parts?.[0]?.functionCall && loopCount < 5) {
          loopCount++;
          const call = content.parts[0].functionCall;
          const toolName = call.name;
          const args = call.args || {};
          
          console.log(`🤖 [AI Agent] Executing tool call: ${toolName} with args:`, args);
          
            let toolResult: any;
            try {
              const tool = pluginRegistry.getTool(toolName);
              if (tool) {
                toolResult = await tool.handler(args);
              } else {
                toolResult = { error: `Tool ${toolName} not found.` };
              }
            } catch (e: any) {
              console.error(`Error executing tool ${toolName}:`, e.message);
              toolResult = { error: e.message };
            }

          // Build message history to feed back to Gemini
          // 1. Push model function call message
          messages.push({
            role: 'model',
            parts: [{ functionCall: call }]
          });

          // 2. Push tool response message
          messages.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: toolName,
                response: { result: toolResult }
              }
            }]
          });

          // Call Gemini again with the tool output
          geminiResponse = await callGemini(apiKey, messages);
          candidate = geminiResponse.candidates?.[0];
          content = candidate?.content;
        }

        // Return final text message and updated history
        const responseText = content?.parts?.[0]?.text || 'Desculpe, não consegui processar a resposta.';
        
        // Push final model text to history
        messages.push({
          role: 'model',
          parts: [{ text: responseText }]
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: responseText, messages }));
      } catch (e: any) {
        console.error('Error during chat loop:', e.message);
        let statusCode = 500;
        const errMsg = e.message.toLowerCase();
        if (errMsg.includes('suspended') || errMsg.includes('permission_denied') || errMsg.includes('403')) {
          statusCode = 403;
        } else if (errMsg.includes('api key') || errMsg.includes('401') || errMsg.includes('invalid')) {
          statusCode = 401;
        }
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // Static files handler
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(PUBLIC_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error: any) {
    console.error('Router error:', error.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal Server Error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 KitchenOS Dashboard Server running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
