import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export interface HealthGoalOutput {
  id: number;
  goalType: string;
  targetWeightKg: number | null;
  targetCalories: number | null;
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFat: number | null;
  targetWaterMl: number;
  status: string;
  createdAt: string;
}

export interface DailySummaryOutput {
  date: string;
  actual: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    waterIntakeMl: number;
    weightKg: number | null;
  };
  goal: HealthGoalOutput | null;
  progress: {
    caloriesPercent: number;
    proteinPercent: number;
    carbsPercent: number;
    fatPercent: number;
    waterPercent: number;
  };
}

/**
 * Creates or updates the active health goal.
 * Pauses any previously active goals.
 */
export async function createHealthGoal(
  goalType: string,
  targetWeightKg: number | null,
  targetCalories: number | null,
  targetProtein: number | null,
  targetCarbs: number | null,
  targetFat: number | null,
  targetWaterMl = 2000
) {
  // Pause other active goals
  await db
    .update(schema.healthGoals)
    .set({ status: 'Paused' })
    .where(eq(schema.healthGoals.status, 'Active'));

  const [goal] = await db
    .insert(schema.healthGoals)
    .values({
      goalType,
      targetWeightKg,
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFat,
      targetWaterMl,
      status: 'Active',
    })
    .returning();

  console.log(`[Health] Created active health goal: ${goalType} (#${goal.id})`);
  return goal;
}

/**
 * Get or create the nutrition log for a specific date.
 */
async function getOrCreateLog(date: string) {
  let log = await db.query.nutritionLogs.findFirst({
    where: eq(schema.nutritionLogs.date, date)
  });

  if (!log) {
    const [newLog] = await db
      .insert(schema.nutritionLogs)
      .values({
        date,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        waterIntakeMl: 0,
        weightKg: null,
      })
      .returning();
    log = newLog;
    console.log(`[Health] Created empty nutrition log for date: ${date}`);
  }

  return log;
}

/**
 * Logs weight for a specific date.
 */
export async function logWeight(date: string, weightKg: number) {
  const log = await getOrCreateLog(date);
  const [updated] = await db
    .update(schema.nutritionLogs)
    .set({ weightKg })
    .where(eq(schema.nutritionLogs.id, log.id))
    .returning();

  console.log(`[Health] Logged weight ${weightKg}kg for date: ${date}`);
  return updated;
}

/**
 * Logs water intake (adds ml to existing count).
 */
export async function logWaterIntake(date: string, ml: number) {
  const log = await getOrCreateLog(date);
  const newIntake = log.waterIntakeMl + ml;
  
  const [updated] = await db
    .update(schema.nutritionLogs)
    .set({ waterIntakeMl: newIntake })
    .where(eq(schema.nutritionLogs.id, log.id))
    .returning();

  console.log(`[Health] Added ${ml}ml of water (Total: ${newIntake}ml) for date: ${date}`);
  return updated;
}

/**
 * Logs nutrients (adds to existing counts).
 */
export async function logNutrition(
  date: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number
) {
  const log = await getOrCreateLog(date);
  
  const [updated] = await db
    .update(schema.nutritionLogs)
    .set({
      calories: log.calories + calories,
      protein: log.protein + protein,
      carbs: log.carbs + carbs,
      fat: log.fat + fat,
    })
    .where(eq(schema.nutritionLogs.id, log.id))
    .returning();

  console.log(`[Health] Logged nutrition for date ${date}: +${calories}kcal, +${protein}g P, +${carbs}g C, +${fat}g F`);
  return updated;
}

/**
 * Gets a daily summary with progress targets.
 */
export async function getDailySummary(date: string): Promise<DailySummaryOutput> {
  const log = await getOrCreateLog(date);
  
  // Find currently active goal
  const goal = await db.query.healthGoals.findFirst({
    where: eq(schema.healthGoals.status, 'Active'),
    orderBy: [desc(schema.healthGoals.createdAt)]
  }) || null;

  // Calculate percentages
  const progress = {
    caloriesPercent: 0,
    proteinPercent: 0,
    carbsPercent: 0,
    fatPercent: 0,
    waterPercent: 0,
  };

  if (goal) {
    if (goal.targetCalories) {
      progress.caloriesPercent = Math.round((log.calories / goal.targetCalories) * 100);
    }
    if (goal.targetProtein) {
      progress.proteinPercent = Math.round((log.protein / goal.targetProtein) * 100);
    }
    if (goal.targetCarbs) {
      progress.carbsPercent = Math.round((log.carbs / goal.targetCarbs) * 100);
    }
    if (goal.targetFat) {
      progress.fatPercent = Math.round((log.fat / goal.targetFat) * 100);
    }
    if (goal.targetWaterMl) {
      progress.waterPercent = Math.round((log.waterIntakeMl / goal.targetWaterMl) * 100);
    }
  }

  return {
    date,
    actual: {
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
      waterIntakeMl: log.waterIntakeMl,
      weightKg: log.weightKg,
    },
    goal,
    progress,
  };
}
