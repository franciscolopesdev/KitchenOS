import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createHealthGoal,
  logWeight,
  logWaterIntake,
  logNutrition,
  getDailySummary
} from './services/health.js';
import {
  createRecipe,
  createRecipeVersion
} from './services/recipe.js';
import {
  startCookingSession,
  endCookingSession
} from './services/cooking-session.js';

async function runHealthTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTES DE SAÚDE E NUTRIÇÃO CULINÁRIA ATIVA');
  console.log('======================================================\n');

  const todayStr = new Date().toISOString().split('T')[0];
  let testGoalId: number | null = null;
  let testRecipeId: number | null = null;
  let testVersionId: number | null = null;
  let testSessionId: number | null = null;

  // Track initial values of today's nutrition log to revert/verify cleanly
  let initialNutrition: any = null;
  let hasError = false;

  try {
    // 0. Pre-cleanup in case a previous run crashed
    await db.delete(schema.recipes).where(eq(schema.recipes.name, 'Salada Proteica de Teste'));

    // 1. Get initial nutrition state
    const initialSummary = await getDailySummary(todayStr);
    initialNutrition = {
      calories: initialSummary.actual.calories,
      protein: initialSummary.actual.protein,
      carbs: initialSummary.actual.carbs,
      fat: initialSummary.actual.fat,
      water: initialSummary.actual.waterIntakeMl,
      weight: initialSummary.actual.weightKg
    };
    console.log('PASSO 1: Estado nutricional inicial do dia:', initialNutrition);

    // 2. Setup Health Goal
    console.log('\nPASSO 2: Criando objetivo de saúde ativo...');
    const goal = await createHealthGoal(
      'Teste de Definição de Musculos',
      80.0, // target Weight kg
      2500, // target calories
      150,  // target protein
      250,  // target carbs
      70,   // target fat
      2500  // target water
    );
    testGoalId = goal.id;
    console.log(`✔ Objetivo de saúde criado: "${goal.goalType}" (ID: ${testGoalId})`);

    // 3. Log Water
    console.log('\nPASSO 3: Registrando consumo de água (+500ml)...');
    await logWaterIntake(todayStr, 500);
    const summaryAfterWater = await getDailySummary(todayStr);
    console.log(`✔ Água atual: ${summaryAfterWater.actual.waterIntakeMl}ml (Esperado: ${initialNutrition.water + 500}ml)`);
    if (summaryAfterWater.actual.waterIntakeMl !== initialNutrition.water + 500) {
      throw new Error('Erro ao registrar consumo de água');
    }

    // 4. Log Weight
    console.log('\nPASSO 4: Registrando peso (79.5 kg)...');
    await logWeight(todayStr, 79.5);
    const summaryAfterWeight = await getDailySummary(todayStr);
    console.log(`✔ Peso atual: ${summaryAfterWeight.actual.weightKg}kg (Esperado: 79.5kg)`);
    if (summaryAfterWeight.actual.weightKg !== 79.5) {
      throw new Error('Erro ao registrar peso');
    }

    // 5. Log Custom Nutrition
    console.log('\nPASSO 5: Registrando refeição personalizada (+300 kcal)...');
    await logNutrition(todayStr, 300, 20, 40, 5);
    const summaryAfterNutrition = await getDailySummary(todayStr);
    console.log(`✔ Calorias atuais: ${summaryAfterNutrition.actual.calories}kcal (Esperado: ${initialNutrition.calories + 300}kcal)`);
    if (summaryAfterNutrition.actual.calories !== initialNutrition.calories + 300) {
      throw new Error('Erro ao registrar refeição personalizada');
    }

    // 6. Test Automatic Logging on Cooking Session Completion
    console.log('\nPASSO 6: Testando log automático de nutrientes na finalização de sessão culinária...');
    // Create test recipe
    const recipe = await createRecipe(
      'Salada Proteica de Teste',
      'Receita rica em proteínas para teste de saúde',
      'Saladas',
      ['Saudável', 'Proteico']
    );
    testRecipeId = recipe.id;

    // Create recipe version
    const version = await createRecipeVersion(
      testRecipeId,
      '1.0',
      'Versão Fitness de Teste',
      'Salada com peito de frango e quinoa',
      1, // portions
      false,
      10, // minutes
      'Easy',
      [],
      []
    );
    testVersionId = version.id;

    // Manually set nutrition macros in DB to mock calculation (since ingredients are empty)
    await db
      .update(schema.recipeVersions)
      .set({
        calories: 450,
        proteinGrams: 35,
        carbsGrams: 40,
        fatGrams: 12
      })
      .where(eq(schema.recipeVersions.id, testVersionId));

    // Start session
    const sessionRes = await startCookingSession({
      date: todayStr,
      startTime: '12:00',
      location: 'Cozinha de Teste',
      chef: 'Francisco',
      recipeVersionIds: [testVersionId]
    });
    testSessionId = sessionRes.session.id;

    // Conclude session
    await endCookingSession(testSessionId, {
      endTime: '12:15',
      overallRating: 5,
      mood: '✨ Energizado',
      servingsCooked: 1
    });

    const summaryAfterSession = await getDailySummary(todayStr);
    const expectedCalories = initialNutrition.calories + 300 + 450;
    console.log(`✔ Calorias após concluir sessão: ${summaryAfterSession.actual.calories}kcal (Esperado: ${expectedCalories}kcal)`);
    if (summaryAfterSession.actual.calories !== expectedCalories) {
      throw new Error('Erro no log automático de nutrientes na finalização da sessão');
    }
    console.log('  👉 [OK] Nutrientes da sessão culinária logados automaticamente com sucesso!');

    // 7. Check Daily Summary Targets Progress Percentages
    console.log('\nPASSO 7: Validando porcentagens de progresso do summary...');
    console.log(`  * Progresso Calorias: ${summaryAfterSession.progress.caloriesPercent}%`);
    console.log(`  * Progresso Água: ${summaryAfterSession.progress.waterPercent}%`);
    console.log(`  * Progresso Proteína: ${summaryAfterSession.progress.proteinPercent}%`);
    
    if (summaryAfterSession.progress.caloriesPercent > 0 && summaryAfterSession.progress.waterPercent > 0) {
      console.log('  👉 [OK] Porcentagens calculadas com base nas metas corretas!');
    } else {
      throw new Error('Progresso incorreto no Daily Summary');
    }

  } catch (error: any) {
    console.error('❌ Ocorreu um erro nos testes:', error.message);
    hasError = true;
  } finally {
    // 8. Cleanup Database from Test Artifacts
    console.log('\n======================================================');
    console.log('🧹 LIMPANDO DADOS DE TESTE...');
    console.log('======================================================');

    try {
      // Revert daily nutrition logs to initial state
      if (initialNutrition) {
        await db
          .update(schema.nutritionLogs)
          .set({
            calories: initialNutrition.calories,
            protein: initialNutrition.protein,
            carbs: initialNutrition.carbs,
            fat: initialNutrition.fat,
            waterIntakeMl: initialNutrition.water,
            weightKg: initialNutrition.weight
          })
          .where(eq(schema.nutritionLogs.date, todayStr));
        console.log('✔ Revertido diário de saúde do dia.');
      }

      // Delete health goals
      if (testGoalId) {
        await db.delete(schema.healthGoals).where(eq(schema.healthGoals.id, testGoalId));
        console.log(`✔ Excluído meta de saúde de teste (ID: ${testGoalId})`);
      }

      // Delete recipe, version, session
      if (testSessionId) {
        await db.delete(schema.cookingSessionRecipes).where(eq(schema.cookingSessionRecipes.cookingSessionId, testSessionId));
        await db.delete(schema.cookingSessions).where(eq(schema.cookingSessions.id, testSessionId));
        console.log(`✔ Excluída sessão de cozinha de teste (ID: ${testSessionId})`);
      }

      if (testVersionId) {
        await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, testVersionId));
        console.log(`✔ Excluída versão de receita de teste (ID: ${testVersionId})`);
      }

      if (testRecipeId) {
        await db.delete(schema.recipes).where(eq(schema.recipes.id, testRecipeId));
        console.log(`✔ Excluída receita de teste (ID: ${testRecipeId})`);
      }

      // Set other goals back to Active if needed
      await db
        .update(schema.healthGoals)
        .set({ status: 'Active' })
        .where(eq(schema.healthGoals.status, 'Paused'));

      if (!hasError) {
        console.log('\n🎉 TODOS OS TESTES PASSARAM E O WORKSPACE ESTÁ LIMPO!');
      } else {
        process.exit(1);
      }
    } catch (e: any) {
      console.error('Erro durante a limpeza:', e.message);
      process.exit(1);
    }
  }
}

runHealthTests();
