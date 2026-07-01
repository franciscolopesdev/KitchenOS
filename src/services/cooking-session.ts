import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { autoDepleteInventory } from './inventory.js';

export interface StartSessionInput {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  location?: string;
  chef?: string;
  participants?: string;
  recipeVersionIds: number[];
}

export interface EndSessionInput {
  endTime: string; // HH:MM
  durationMinutes?: number;
  mood?: string;
  overallRating?: number;
  learnings?: string;
  errors?: string;
  successes?: string;
  neverAgain?: string;
  whyWorked?: string;
  nextAttemptSuggestions?: string;
  generalNotes?: string;
  equipmentUsed?: string;
  servingsCooked?: number; // servings cooked for depletion (default 2)
}

/**
 * Starts a new Cooking Session (draft) and links the recipes to it.
 */
export async function startCookingSession(input: StartSessionInput) {
  // Insert Cooking Session
  const [session] = await db
    .insert(schema.cookingSessions)
    .values({
      date: input.date,
      startTime: input.startTime,
      location: input.location ?? 'Cozinha Principal',
      chef: input.chef ?? 'Francisco',
      participants: input.participants ?? '',
    })
    .returning();

  // Link recipes (M:N)
  for (const vId of input.recipeVersionIds) {
    await db.insert(schema.cookingSessionRecipes).values({
      cookingSessionId: session.id,
      recipeVersionId: vId,
    });
  }

  console.log(`[Cooking Session] Started session #${session.id} on ${input.date} at ${input.startTime}`);
  return { session, recipeVersionIds: input.recipeVersionIds };
}

/**
 * Concludes a Cooking Session, auto-depletes inventory ingredients,
 * and updates technical mastery level for techniques used.
 */
export async function endCookingSession(sessionId: number, input: EndSessionInput) {
  const session = await db.query.cookingSessions.findFirst({
    where: eq(schema.cookingSessions.id, sessionId),
  });

  if (!session) throw new Error(`Cooking session #${sessionId} not found.`);

  // 1. Calculate duration if start and end are provided
  let finalDuration = input.durationMinutes;
  if (!finalDuration && session.startTime && input.endTime) {
    try {
      const [sh, sm] = session.startTime.split(':').map(Number);
      const [eh, em] = input.endTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      finalDuration = endMin >= startMin ? endMin - startMin : (24 * 60 - startMin) + endMin;
    } catch {
      finalDuration = undefined;
    }
  }

  // 2. Conclude session in DB
  const [updatedSession] = await db
    .update(schema.cookingSessions)
    .set({
      endTime: input.endTime,
      durationMinutes: finalDuration,
      mood: input.mood,
      overallRating: input.overallRating,
      learnings: input.learnings,
      errors: input.errors,
      successes: input.successes,
      neverAgain: input.neverAgain,
      whyWorked: input.whyWorked,
      nextAttemptSuggestions: input.nextAttemptSuggestions,
      generalNotes: input.generalNotes,
      equipmentUsed: input.equipmentUsed,
    })
    .where(eq(schema.cookingSessions.id, sessionId))
    .returning();

  // 3. Find associated recipe versions
  const linkedRecipes = await db
    .select()
    .from(schema.cookingSessionRecipes)
    .where(eq(schema.cookingSessionRecipes.cookingSessionId, sessionId));

  const servings = input.servingsCooked ?? 2;
  const depletionResults: any[] = [];
  const techniquesUpdated: string[] = [];

  for (const link of linkedRecipes) {
    // 3.1 Deplete ingredients
    try {
      const dep = await autoDepleteInventory(link.recipeVersionId, servings);
      depletionResults.push({ recipeVersionId: link.recipeVersionId, depleted: dep });
    } catch (e: any) {
      console.warn(`[Cooking Session] Stock depletion warning: ${e.message}`);
    }

    // 3.2 Update Technical Evolution (if overall rating is high, mastery level increases)
    if (input.overallRating && input.overallRating >= 4) {
      // Find techniques linked to this recipe version
      const recipeTechs = await db
        .select()
        .from(schema.recipeTechniques)
        .where(eq(schema.recipeTechniques.recipeVersionId, link.recipeVersionId));

      for (const rt of recipeTechs) {
        const technique = await db.query.techniques.findFirst({
          where: eq(schema.techniques.id, rt.techniqueId),
        });

        if (technique) {
          const currentMastery = technique.masteryLevel ?? 1;
          const newMastery = Math.min(10, currentMastery + 1); // clamp to max 10
          
          await db
            .update(schema.techniques)
            .set({ masteryLevel: newMastery })
            .where(eq(schema.techniques.id, technique.id));

          techniquesUpdated.push(`${technique.name} (${currentMastery}/10 ➔ ${newMastery}/10)`);
        }
      }
    }
  }

  // 3.3 Check and complete cooking missions
  let completedMissions: any[] = [];
  try {
    const { checkAndCompleteMissions } = await import('./objectives.js');
    const missionRes = await checkAndCompleteMissions(sessionId);
    completedMissions = missionRes.completedMissions;
  } catch (e: any) {
    console.error(`[Cooking Session] Objectives checking error: ${e.message}`);
  }

  // 3.4 Log nutrients automatically to the daily nutrition tracker
  try {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    for (const link of linkedRecipes) {
      const version = await db.query.recipeVersions.findFirst({
        where: eq(schema.recipeVersions.id, link.recipeVersionId)
      });
      if (version) {
        totalCalories += version.calories ?? 0;
        totalProtein += version.proteinGrams ?? 0;
        totalCarbs += version.carbsGrams ?? 0;
        totalFat += version.fatGrams ?? 0;
      }
    }

    if (totalCalories > 0 || totalProtein > 0 || totalCarbs > 0 || totalFat > 0) {
      const { logNutrition } = await import('./health.js');
      const dateStr = updatedSession.date || new Date().toISOString().split('T')[0];
      await logNutrition(dateStr, totalCalories, totalProtein, totalCarbs, totalFat);
      console.log(`[Cooking Session] Automatically logged ${totalCalories}kcal and macros to health logs for date ${dateStr}.`);
    }
  } catch (e: any) {
    console.error(`[Cooking Session] Failed to log nutrition automatically: ${e.message}`);
  }

  // 3.5 Run CBE continuous learning/reflection loop
  try {
    const { processSessionLearning } = await import('./cbe.js');
    await processSessionLearning(sessionId);
  } catch (e: any) {
    console.error(`[Cooking Session] CBE learning process failed: ${e.message}`);
  }

  console.log(`[Cooking Session] Concluded session #${sessionId}. Depleted stocks, updated masteries:`, techniquesUpdated, `and completed missions:`, completedMissions.map(m => m.name));
  return {
    session: updatedSession,
    depletionResults,
    techniquesUpdated,
    completedMissions,
  };
}

/**
 * Adds a reviewer rating to a session for a recipe version.
 */
export async function addSessionReviewerRating(
  sessionId: number,
  recipeVersionId: number,
  reviewerName: string,
  rating: number,
  comment?: string,
  wouldEatAgain = true,
  suggestedChanges?: string
) {
  const [review] = await db
    .insert(schema.ratings)
    .values({
      cookingSessionId: sessionId,
      recipeVersionId,
      reviewerName,
      rating,
      comment: comment ?? '',
      wouldEatAgain,
      suggestedChanges: suggestedChanges ?? '',
    })
    .returning();

  // Re-calculate session average overallRating automatically
  const allRatings = await db
    .select({ rating: schema.ratings.rating })
    .from(schema.ratings)
    .where(eq(schema.ratings.cookingSessionId, sessionId));

  if (allRatings.length > 0) {
    const sum = allRatings.reduce((acc, r) => acc + r.rating, 0);
    const avg = parseFloat((sum / allRatings.length).toFixed(1));
    await db
      .update(schema.cookingSessions)
      .set({ overallRating: avg })
      .where(eq(schema.cookingSessions.id, sessionId));
  }

  console.log(`[Cooking Session] Added rating from "${reviewerName}" (${rating}/5) to session #${sessionId}`);
  return review;
}

/**
 * Links a photo to a cooking session and/or recipe version.
 */
export async function addSessionPhoto(
  sessionId: number,
  localPath: string,
  caption?: string,
  notes?: string,
  recipeVersionId?: number
) {
  const [photo] = await db
    .insert(schema.photos)
    .values({
      cookingSessionId: sessionId,
      recipeVersionId,
      localPath,
      caption: caption ?? 'Prato Final',
      notes: notes ?? '',
    })
    .returning();

  console.log(`[Cooking Session] Linked photo to session #${sessionId}: ${localPath}`);
  return photo;
}
