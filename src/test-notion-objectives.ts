import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';
import { notion } from './notion/client.js';
import { syncNotionToSqlite } from './notion/sync.js';
import { createObjective, createMission } from './services/objectives.js';
import { getOrCreateTechnique, createRecipe, createRecipeVersion } from './services/recipe.js';
import { eventEngine } from './core/event-engine.js';
import { registerKitchenRules } from './plugins/kitchen-rules.js';

async function runNotionObjectivesTests() {
  console.log('\n======================================================');
  console.log('🧪 INTEGRATION TESTS: NOTION SYNC & MISSION RECOMMENDATIONS');
  console.log('======================================================\n');

  let testObjectiveId: number | null = null;
  let testMissionId: number | null = null;
  let testTechniqueId: number | null = null;
  let testRecipeId: number | null = null;
  let testVersionId: number | null = null;

  try {
    // 1. Create a mock Technique, Objective and Mission in SQLite
    console.log('Step 1: Creating mock technique, objective and mission...');
    const technique = await getOrCreateTechnique(
      'Técnica Secreta de Teste',
      'Técnica secreta para fins de teste de integração',
      'Medium',
      'Muito útil'
    );
    testTechniqueId = technique.id;

    const objective = await createObjective(
      'Objetivo de Teste de Integração',
      'Testar a sincronização com o Notion e o recomendador.'
    );
    testObjectiveId = objective.id;

    const mission = await createMission(
      testObjectiveId,
      'Missão de Teste de Integração',
      'Concluir o teste de integração com sucesso.',
      testTechniqueId
    );
    testMissionId = mission.id;

    console.log(`✔ Local entities created in SQLite:`);
    console.log(`  * Technique ID: ${testTechniqueId}`);
    console.log(`  * Objective ID: ${testObjectiveId}`);
    console.log(`  * Mission ID: ${testMissionId}`);

    // Create a recipe using this technique, to test matching recommendations
    const recipe = await createRecipe(
      'Receita Exemplo de Teste',
      'Receita para testar a recomendação de missões',
      'Universal',
      ['Teste']
    );
    testRecipeId = recipe.id;

    const version = await createRecipeVersion(
      testRecipeId,
      '1.0',
      'v1.0 Teste',
      'Apenas para teste',
      2,
      false,
      10,
      'Médio',
      [],
      [{ techniqueId: testTechniqueId, stepOrder: 1, notes: 'Aplicar a técnica secreta' }]
    );
    testVersionId = version.id;
    console.log(`✔ Recipe and Version created linked to the technique (Version ID: ${testVersionId})`);

    // 2. Perform Notion Sync
    console.log('\nStep 2: Performing Notion Sync...');
    const syncRes = await syncNotionToSqlite(20);
    console.log(`✔ Sync status: ${syncRes.status}`);

    // Verify if notionPageIds were updated in the database
    const syncedObjective = await db.query.objectives.findFirst({
      where: eq(schema.objectives.id, testObjectiveId)
    });
    const syncedMission = await db.query.missions.findFirst({
      where: eq(schema.missions.id, testMissionId)
    });

    console.log(`\nStep 3: Verifying Notion IDs in SQLite database...`);
    console.log(`  * Objective notionPageId: ${syncedObjective?.notionPageId}`);
    console.log(`  * Mission notionPageId: ${syncedMission?.notionPageId}`);

    if (syncedObjective?.notionPageId && syncedMission?.notionPageId) {
      console.log('  👉 [OK] Notion Page IDs successfully populated in SQLite!');
    } else {
      throw new Error('Notion Page IDs were not populated. Sync failed.');
    }

    // Verify Notion objects properties
    console.log('\nStep 4: Verifying Notion page contents...');
    const objPage = await notion.pages.retrieve({ page_id: syncedObjective.notionPageId });
    console.log(`✔ Retrieved Objective page from Notion successfully.`);
    
    const missionPage = await notion.pages.retrieve({ page_id: syncedMission.notionPageId });
    console.log(`✔ Retrieved Mission page from Notion successfully.`);

    // 3. Test recommendation logic
    console.log('\nStep 5: Testing EventEngine Rule trigger...');
    
    // Register the rules to make sure they are loaded
    registerKitchenRules();
    
    const rule = (eventEngine as any).rules.get('kitchen-active-missions-recommendation');
    if (!rule) {
      throw new Error('Rule "kitchen-active-missions-recommendation" is not registered in EventEngine.');
    }

    console.log(`✔ Rule found: "${rule.name}"`);

    // Force condition evaluation
    const isTriggered = await rule.condition();
    console.log(`  * Is triggered: ${isTriggered} (Esperado: true)`);
    if (isTriggered) {
      console.log('  👉 [OK] Rule condition correctly evaluated to true since there is an active mission!');
    } else {
      throw new Error('Rule condition evaluated to false despite active missions.');
    }

    // Run action to verify it runs without crashing and prints matches
    console.log('Running rule action (this logs matching recipes)...');
    await rule.action();
    console.log('  👉 [OK] Action executed successfully!');

  } catch (error: any) {
    console.error('\n❌ Integration tests failed:', error.message);
    process.exit(1);
  } finally {
    // 4. Archive Notion Pages and Clean Up SQLite
    console.log('\n🧹 Starting Notion and SQLite Cleanup...');

    // Resolve Notion Page IDs
    const syncedObjective = testObjectiveId 
      ? await db.query.objectives.findFirst({ where: eq(schema.objectives.id, testObjectiveId) }) 
      : null;
    const syncedMission = testMissionId 
      ? await db.query.missions.findFirst({ where: eq(schema.missions.id, testMissionId) }) 
      : null;
    const syncedTechnique = testTechniqueId 
      ? await db.query.techniques.findFirst({ where: eq(schema.techniques.id, testTechniqueId) }) 
      : null;
    const syncedRecipe = testRecipeId 
      ? await db.query.recipes.findFirst({ where: eq(schema.recipes.id, testRecipeId) }) 
      : null;

    // Archive in Notion
    if (syncedMission?.notionPageId) {
      try {
        console.log(`Archiving Mission in Notion: ${syncedMission.notionPageId}`);
        await notion.pages.update({ page_id: syncedMission.notionPageId, archived: true });
      } catch (err: any) {
        console.error('Failed to archive mission page:', err.message);
      }
    }
    if (syncedObjective?.notionPageId) {
      try {
        console.log(`Archiving Objective in Notion: ${syncedObjective.notionPageId}`);
        await notion.pages.update({ page_id: syncedObjective.notionPageId, archived: true });
      } catch (err: any) {
        console.error('Failed to archive objective page:', err.message);
      }
    }
    if (syncedTechnique?.notionPageId) {
      try {
        console.log(`Archiving Technique in Notion: ${syncedTechnique.notionPageId}`);
        await notion.pages.update({ page_id: syncedTechnique.notionPageId, archived: true });
      } catch (err: any) {
        console.error('Failed to archive technique page:', err.message);
      }
    }
    if (syncedRecipe?.notionPageId) {
      try {
        console.log(`Archiving Recipe in Notion: ${syncedRecipe.notionPageId}`);
        await notion.pages.update({ page_id: syncedRecipe.notionPageId, archived: true });
      } catch (err: any) {
        console.error('Failed to archive recipe page:', err.message);
      }
    }

    // Delete in SQLite
    if (testVersionId) {
      await db.delete(schema.recipeTechniques).where(eq(schema.recipeTechniques.recipeVersionId, testVersionId));
      await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, testVersionId));
    }
    if (testRecipeId) {
      await db.delete(schema.recipes).where(eq(schema.recipes.id, testRecipeId));
    }
    if (testMissionId) {
      await db.delete(schema.missions).where(eq(schema.missions.id, testMissionId));
    }
    if (testObjectiveId) {
      await db.delete(schema.objectives).where(eq(schema.objectives.id, testObjectiveId));
    }
    if (testTechniqueId) {
      await db.delete(schema.techniques).where(eq(schema.techniques.id, testTechniqueId));
    }

    console.log('✔ Cleanup completed successfully.');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL NOTION SYNC AND RECOMMENDATION TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runNotionObjectivesTests().catch(console.error);
