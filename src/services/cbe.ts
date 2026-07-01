import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createRecipeVersion } from './recipe.js';
import { eventEngine } from '../core/event-engine.js';
import { notion } from '../notion/client.js';

function textProperty(content: string) {
  return {
    rich_text: [
      {
        text: {
          content: content.substring(0, 2000),
        },
      },
    ],
  };
}

// Helper to make call to Gemini
async function callGeminiReflection(apiKey: string, promptText: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${errorText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini');
  return JSON.parse(rawText.trim());
}

/**
 * Cognitive reflection loop that evaluates a finished cooking session.
 * Promotes successful adaptations to user preferences and spawns evolved recipe versions.
 */
export async function processSessionLearning(sessionId: number) {
  console.log(`[CBE] Evaluating session #${sessionId} for cognitive learning...`);
  const session = await db.query.cookingSessions.findFirst({
    where: eq(schema.cookingSessions.id, sessionId),
  });
  if (!session) return;

  // Find linked recipe versions
  const linkedRecipes = await db
    .select()
    .from(schema.cookingSessionRecipes)
    .where(eq(schema.cookingSessionRecipes.cookingSessionId, sessionId));

  for (const link of linkedRecipes) {
    try {
      const versionId = link.recipeVersionId;
      const version = await db.query.recipeVersions.findFirst({
        where: eq(schema.recipeVersions.id, versionId),
      });
      if (!version) continue;

      const recipe = await db.query.recipes.findFirst({
        where: eq(schema.recipes.id, version.recipeId),
      });
      if (!recipe) continue;

      // Find adaptation for this session and version
      const adaptation = await db.query.recipeAdaptations.findFirst({
        where: and(
          eq(schema.recipeAdaptations.cookingSessionId, sessionId),
          eq(schema.recipeAdaptations.recipeVersionId, versionId)
        )
      });

      // Equipment used
      const equipmentUsed = session.equipmentUsed || (adaptation ? adaptation.targetEquipment : null);
      if (!equipmentUsed) {
        console.log(`[CBE] No equipment recorded or inferred for recipe "${recipe.name}" in session #${sessionId}. Skipping preference promote.`);
        continue;
      }

      // 1. Promote to preference if overallRating is high (>= 4) or adaptation feedback is high
      const isSuccessful =
        (session.overallRating !== null && session.overallRating >= 4) ||
        (adaptation && (adaptation.feedbackRating === 'Excelente' || adaptation.feedbackRating === 'Boa'));

      if (isSuccessful) {
        let reason = session.whyWorked || session.successes || '';
        if (!reason && adaptation) {
          reason = `Adaptação automática para ${adaptation.targetEquipment} funcionou com sucesso.`;
        }
        if (!reason) {
          reason = `Excelente resultado obtido em preparo real utilizando ${equipmentUsed}.`;
        }

        // Update recipe preference
        await db
          .update(schema.recipes)
          .set({
            preferredEquipment: equipmentUsed,
            preferredVersionId: versionId,
            preferenceReason: reason,
          })
          .where(eq(schema.recipes.id, recipe.id));

        // Sync preference update to Notion immediately if page exists
        if (recipe.notionPageId) {
          try {
            await notion.pages.update({
              page_id: recipe.notionPageId,
              properties: {
                'Equipamento Preferido': textProperty(equipmentUsed),
                'Motivo da Preferência': textProperty(reason),
              }
            });
            console.log(`[CBE] Synced preference to Notion page ${recipe.notionPageId}`);
          } catch (notionErr: any) {
            console.error(`[CBE] Failed to update recipe preference on Notion page ${recipe.notionPageId}:`, notionErr.message);
          }
        }

        console.log(`[CBE] Saved preference for recipe "${recipe.name}": ${equipmentUsed} (Reason: ${reason})`);
      }

      // 2. Evolve Recipe Version ("Receita Viva")
      // Check if there are warnings, errors, or nextAttemptSuggestions that indicate adjustments were needed
      const hasFeedback = session.errors || session.learnings || session.nextAttemptSuggestions;
      if (hasFeedback) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          console.warn('[CBE] Skipping recipe evolution reflection: GEMINI_API_KEY is not set in environment.');
          continue;
        }

        // Fetch original steps/techniques
        const originalSteps = await db
          .select({
            order: schema.recipeTechniques.stepOrder,
            notes: schema.recipeTechniques.notes,
            techniqueId: schema.recipeTechniques.techniqueId,
          })
          .from(schema.recipeTechniques)
          .where(eq(schema.recipeTechniques.recipeVersionId, versionId))
          .orderBy(schema.recipeTechniques.stepOrder);

        // Fetch original ingredients
        const originalIngredients = await db
          .select({
            ingredientId: schema.recipeIngredients.ingredientId,
            amount: schema.recipeIngredients.amount,
            unit: schema.recipeIngredients.unit,
            notes: schema.recipeIngredients.notes,
            isOptional: schema.recipeIngredients.isOptional,
          })
          .from(schema.recipeIngredients)
          .where(eq(schema.recipeIngredients.recipeVersionId, versionId));

        // Format prompt for reflection
        const prompt = `
Você é a Cognitive Behavior Engine (CBE) do KitchenOS.
Sua tarefa é analisar os resultados de uma sessão de cozinha e decidir se devemos criar uma versão aprimorada de uma receita (Receita Viva) com base no feedback real.

Informações da Receita Atual:
- Nome: "${recipe.name}"
- Versão Atual: "${version.versionNumber}" (Título da versão: "${version.name}")
- Equipamento Utilizado: "${equipmentUsed}"
- Ingredientes Atuais: ${JSON.stringify(originalIngredients)}
- Passos Culinários Atuais: ${JSON.stringify(originalSteps)}

Resultado do Preparo Realizado:
- Avaliação Geral: ${session.overallRating}/5
- Sucessos/O que deu certo: "${session.successes || 'N/A'}"
- Erros/Problemas: "${session.errors || 'N/A'}"
- Aprendizados/Notas: "${session.learnings || 'N/A'}"
- Tempo real gasto: ${session.durationMinutes || 'N/A'} minutos
- Sugestões para a próxima tentativa: "${session.nextAttemptSuggestions || 'N/A'}"

Analise se as instruções de cozimento, tempos, temperaturas, equipamentos ou quantidades de ingredientes precisam ser atualizados.
Por exemplo, se o usuário disse "15 min foi curto, precisei de 22 min para dourar", o passo correspondente da receita deve ser atualizado para recomendar 22 minutos na Air Fryer.
NUNCA adicione gengibre (ginger) na receita.

Retorne obrigatoriamente um objeto JSON com o seguinte formato:
{
  "shouldCreateNewVersion": boolean,
  "newVersionNumber": string,
  "newVersionName": string,
  "newVersionDescription": string,
  "estimatedTimeMinutes": number,
  "updatedSteps": [
    {
      "stepOrder": number,
      "techniqueId": number,
      "notes": string
    }
  ],
  "updatedIngredients": [
    {
      "ingredientId": number,
      "amount": number,
      "unit": string,
      "notes": string,
      "isOptional": boolean
    }
  ]
}
`;

        console.log(`[CBE] Dispatching AI reflection loop for "${recipe.name}"...`);
        const reflectionResult = await callGeminiReflection(apiKey, prompt);

        if (reflectionResult && reflectionResult.shouldCreateNewVersion) {
          console.log(`[CBE] AI reflection determined a new version is needed: v${reflectionResult.newVersionNumber} for "${recipe.name}"`);
          
          // Map to match type interfaces
          const newSteps = reflectionResult.updatedSteps.map((s: any) => ({
            techniqueId: s.techniqueId,
            stepOrder: s.stepOrder,
            notes: s.notes
          }));
          const newIngredients = reflectionResult.updatedIngredients.map((i: any) => ({
            ingredientId: i.ingredientId,
            amount: i.amount,
            unit: i.unit,
            notes: i.notes,
            isOptional: i.isOptional
          }));

          // Generate new version in DB
          const newVersion = await createRecipeVersion(
            recipe.id,
            reflectionResult.newVersionNumber,
            reflectionResult.newVersionName,
            reflectionResult.newVersionDescription,
            version.yieldPortions,
            version.isFreezerFriendly,
            reflectionResult.estimatedTimeMinutes || version.estimatedTimeMinutes || undefined,
            version.difficulty,
            newIngredients,
            newSteps
          );

          // Update preferred version
          await db
            .update(schema.recipes)
            .set({
              currentVersionId: newVersion.id,
              preferredVersionId: newVersion.id,
              preferredEquipment: equipmentUsed,
            })
            .where(eq(schema.recipes.id, recipe.id));

          // Post a notification in the EventEngine queue celebrating the evolution
          const notifMsg = `🌟 **Receita Viva Evoluída**: A receita **${recipe.name}** evoluiu para a versão **v${reflectionResult.newVersionNumber}** (${reflectionResult.newVersionName}) após reflexão da sessão de cozinha. Tempo ideal ajustado para **${reflectionResult.estimatedTimeMinutes} min** na **${equipmentUsed}**!`;
          eventEngine.activeNotifications.push({
            id: `cbe_evolve_${Date.now()}`,
            ruleName: 'Evolução de Receita Viva',
            priority: 'Important',
            message: notifMsg,
            timestamp: new Date().toISOString(),
            read: false
          });

          console.log(`[CBE] Recipe "${recipe.name}" evolved to version ${reflectionResult.newVersionNumber} (ID: ${newVersion.id})`);
        } else {
          console.log(`[CBE] AI reflection determined no new recipe version is required.`);
        }
      }
    } catch (e: any) {
      console.error(`[CBE] Error processing learning for session #${sessionId}:`, e.message);
    }
  }
}
