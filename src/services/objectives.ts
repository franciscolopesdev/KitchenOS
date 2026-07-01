import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { pushNotification } from '../core/event-engine.js';
import { sendProactiveMessage } from './telegram.js';

export interface ObjectiveOutput {
  id: number;
  name: string;
  description: string | null;
  status: string;
  targetCount: number;
  currentCount: number;
  createdAt: string;
  missions: any[];
}

/**
 * Returns all culinary objectives with their nested missions.
 */
export async function getObjectivesList(): Promise<ObjectiveOutput[]> {
  const objs = await db.query.objectives.findMany({
    orderBy: (o, { desc }) => [desc(o.createdAt)]
  });
  
  const results: ObjectiveOutput[] = [];
  for (const obj of objs) {
    const relatedMissions = await db.query.missions.findMany({
      where: eq(schema.missions.objectiveId, obj.id)
    });
    
    // Resolve technique names for nice UI display
    const resolvedMissions = [];
    for (const m of relatedMissions) {
      const tech = await db.query.techniques.findFirst({
        where: eq(schema.techniques.id, m.techniqueId)
      });
      resolvedMissions.push({
        ...m,
        techniqueName: tech ? tech.name : 'Técnica Culinária'
      });
    }

    results.push({
      ...obj,
      missions: resolvedMissions
    });
  }
  return results;
}

/**
 * Returns list of missions, optionally filtered by objective.
 */
export async function getMissionsList(objectiveId?: number) {
  if (objectiveId) {
    return await db.query.missions.findMany({
      where: eq(schema.missions.objectiveId, objectiveId)
    });
  }
  return await db.query.missions.findMany();
}

/**
 * Creates a new culinary objective.
 */
export async function createObjective(name: string, description?: string) {
  const [obj] = await db
    .insert(schema.objectives)
    .values({
      name,
      description: description ?? '',
      status: 'Active',
      targetCount: 0,
      currentCount: 0
    })
    .returning();
  
  console.log(`[Objectives] Created objective "${name}" (#${obj.id})`);
  return obj;
}

/**
 * Creates a new mission under an objective, linking a specific technique.
 */
export async function createMission(
  objectiveId: number,
  name: string,
  description: string,
  techniqueId: number
) {
  const [mission] = await db
    .insert(schema.missions)
    .values({
      objectiveId,
      name,
      description,
      techniqueId,
      status: 'Active'
    })
    .returning();

  // Increment targetCount of objective
  const objective = await db.query.objectives.findFirst({
    where: eq(schema.objectives.id, objectiveId)
  });
  if (objective) {
    await db
      .update(schema.objectives)
      .set({ targetCount: objective.targetCount + 1 })
      .where(eq(schema.objectives.id, objectiveId));
  }

  console.log(`[Objectives] Created mission "${name}" (#${mission.id}) under objective #${objectiveId}`);
  return mission;
}

/**
 * Checks if the techniques used in a completed cooking session trigger any active missions.
 */
export async function checkAndCompleteMissions(cookingSessionId: number) {
  const session = await db.query.cookingSessions.findFirst({
    where: eq(schema.cookingSessions.id, cookingSessionId)
  });
  if (!session) return { completedMissions: [] };

  const linkedRecipes = await db
    .select()
    .from(schema.cookingSessionRecipes)
    .where(eq(schema.cookingSessionRecipes.cookingSessionId, cookingSessionId));

  const techniqueIds = new Set<number>();
  for (const link of linkedRecipes) {
    const recipeTechs = await db
      .select()
      .from(schema.recipeTechniques)
      .where(eq(schema.recipeTechniques.recipeVersionId, link.recipeVersionId));
    
    for (const rt of recipeTechs) {
      techniqueIds.add(rt.techniqueId);
    }
  }

  if (techniqueIds.size === 0) return { completedMissions: [] };

  const completedMissionsList = [];

  for (const techId of techniqueIds) {
    // Find active missions for this technique
    const activeMissions = await db.query.missions.findMany({
      where: and(
        eq(schema.missions.techniqueId, techId),
        eq(schema.missions.status, 'Active')
      )
    });

    for (const mission of activeMissions) {
      const nowStr = new Date().toISOString();
      // Update mission to completed
      const [updatedMission] = await db
        .update(schema.missions)
        .set({
          status: 'Completed',
          completedAt: nowStr
        })
        .where(eq(schema.missions.id, mission.id))
        .returning();

      completedMissionsList.push(updatedMission);

      // Increment objective currentCount
      const obj = await db.query.objectives.findFirst({
        where: eq(schema.objectives.id, mission.objectiveId)
      });
      
      if (obj) {
        const newCurrentCount = obj.currentCount + 1;
        const allMissions = await db.query.missions.findMany({
          where: eq(schema.missions.objectiveId, obj.id)
        });
        const activeCount = allMissions.filter(m => m.status === 'Active').length;
        const isObjectiveCompleted = activeCount === 0;

        await db
          .update(schema.objectives)
          .set({
            currentCount: newCurrentCount,
            status: isObjectiveCompleted ? 'Completed' : obj.status
          })
          .where(eq(schema.objectives.id, obj.id));

        // Trigger notifications
        const msg = `🏆 *Missão Concluída no KitchenOS!*\n\nVocê completou o desafio *"${mission.name}"* ao utilizar a técnica culinária associada na sua sessão de cozinha!\n\n` + 
          (isObjectiveCompleted 
            ? `🎉 *Parabéns!* O objetivo principal *"${obj.name}"* foi totalmente alcançado!` 
            : `Progresso do objetivo *"${obj.name}"*: ${newCurrentCount}/${obj.targetCount} concluídos.`);
        
        console.log(`[Objectives] Mission completed: ${mission.name}`);
        pushNotification(msg, 'Success');
        await sendProactiveMessage(msg);
      }
    }
  }

  return { completedMissions: completedMissionsList };
}
