import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';
import {
  getOrCreateTechnique,
  createRecipe,
  createRecipeVersion,
} from './services/recipe.js';
import {
  createObjective,
  createMission,
  getObjectivesList,
} from './services/objectives.js';
import {
  startCookingSession,
  endCookingSession,
} from './services/cooking-session.js';

async function runObjectivesTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTES DE OBJETIVOS E MISSÕES CULINÁRIAS');
  console.log('======================================================\n');

  let testObjectiveId: number | null = null;
  let testMissionId: number | null = null;
  let testTechniqueId: number | null = null;
  let testRecipeId: number | null = null;
  let testVersionId: number | null = null;
  let testSessionId: number | null = null;

  try {
    // 1. Setup da Técnica Culinária
    console.log('PASSO 1: Criando técnica culinária para o desafio...');
    const technique = await getOrCreateTechnique(
      'Emulsão Térmica de Teste',
      'Técnica de emulsão de gordura em água sob aquecimento controlado',
      'Hard',
      'Fundamental para molhos como holandês e béarnaise'
    );
    testTechniqueId = technique.id;
    console.log(`✔ Técnica criada: "${technique.name}" (ID: ${testTechniqueId})`);

    // 2. Setup do Objetivo Culinário
    console.log('\nPASSO 2: Criando objetivo culinário (meta de aprendizado)...');
    const objective = await createObjective(
      'Dominar Culinária Francesa de Teste',
      'Aprender as técnicas clássicas francesas, incluindo os molhos mãe.'
    );
    testObjectiveId = objective.id;
    console.log(`✔ Objetivo criado: "${objective.name}" (ID: ${testObjectiveId})`);

    // 3. Setup da Missão de Desafio
    console.log('\nPASSO 3: Criando missão associando a técnica e o objetivo...');
    const mission = await createMission(
      testObjectiveId,
      'Preparar Molho Holandês de Teste',
      'Conseguir emulsificar perfeitamente manteiga clarificada e gemas sem talhar.',
      testTechniqueId
    );
    testMissionId = mission.id;
    console.log(`✔ Missão criada: "${mission.name}" (ID: ${testMissionId})`);

    // Verificar se o targetCount do objetivo subiu para 1
    const objBefore = await db.query.objectives.findFirst({
      where: eq(schema.objectives.id, testObjectiveId)
    });
    console.log(`✔ Verificação do Objetivo antes do preparo:`);
    console.log(`  * Status: ${objBefore?.status} (Esperado: Active)`);
    console.log(`  * Metas Totais: ${objBefore?.targetCount} (Esperado: 1)`);
    console.log(`  * Metas Concluídas: ${objBefore?.currentCount} (Esperado: 0)`);

    if (objBefore && objBefore.targetCount === 1 && objBefore.currentCount === 0) {
      console.log('  👉 [OK] Inicialização de progresso correta!');
    } else {
      throw new Error('Inicialização de progresso do objetivo incorreta.');
    }

    // 4. Setup da Receita e Versão de Teste
    console.log('\nPASSO 4: Criando receita e versão vinculada que utiliza a técnica...');
    const recipe = await createRecipe(
      'Molho Holandês Clássico de Teste',
      'Molho mãe clássico francês',
      'Francesa',
      ['Molhos', 'Clássicos']
    );
    testRecipeId = recipe.id;

    const version = await createRecipeVersion(
      testRecipeId,
      '1.0',
      'Tentativa Holandês v1',
      'Primeira tentativa de emulsionar holandês',
      2,
      false,
      20,
      'Hard',
      [], // sem ingredientes para simplificar
      [{ techniqueId: testTechniqueId, stepOrder: 1, notes: 'Emulsionar gemas e manteiga' }]
    );
    testVersionId = version.id;
    console.log(`✔ Receita e versão v1.0 criadas com sucesso.`);

    // 5. Iniciar Sessão de Cozinha (Cooking Session)
    console.log('\nPASSO 5: Iniciando Sessão de Cozinha...');
    const sessionRes = await startCookingSession({
      date: '2026-06-25',
      startTime: '16:00',
      location: 'Cozinha de Teste',
      chef: 'Francisco',
      recipeVersionIds: [testVersionId],
    });
    testSessionId = sessionRes.session.id;
    console.log(`✔ Sessão culinária #${testSessionId} criada.`);

    // 6. Concluir Sessão de Cozinha e Verificar Conclusão Automática da Missão
    console.log('\nPASSO 6: Concluindo Sessão de Cozinha (Acionando finalização)...');
    const endRes = await endCookingSession(testSessionId, {
      endTime: '16:30',
      overallRating: 5,
      mood: '💪 Focado',
      servingsCooked: 2
    });

    console.log(`✔ Sessão finalizada. Missões concluídas na resposta:`, endRes.completedMissions?.map(m => m.name));

    // Verificar no banco de dados se a missão foi marcada como Completed
    const missionAfter = await db.query.missions.findFirst({
      where: eq(schema.missions.id, testMissionId)
    });
    console.log(`✔ Verificação da Missão após preparo:`);
    console.log(`  * Status da Missão: ${missionAfter?.status} (Esperado: Completed)`);
    console.log(`  * Concluído em: ${missionAfter?.completedAt}`);

    if (missionAfter && missionAfter.status === 'Completed' && missionAfter.completedAt) {
      console.log('  👉 [OK] Missão de técnica concluída automaticamente com sucesso!');
    } else {
      throw new Error('Falha na conclusão automática da missão.');
    }

    // Verificar se o objetivo evoluiu para concluído
    const objAfter = await db.query.objectives.findFirst({
      where: eq(schema.objectives.id, testObjectiveId)
    });
    console.log(`✔ Verificação do Objetivo após preparo:`);
    console.log(`  * Status do Objetivo: ${objAfter?.status} (Esperado: Completed)`);
    console.log(`  * Metas Concluídas: ${objAfter?.currentCount}/${objAfter?.targetCount} (Esperado: 1/1)`);

    if (objAfter && objAfter.status === 'Completed' && objAfter.currentCount === 1) {
      console.log('  👉 [OK] Progresso do objetivo principal atualizado perfeitamente!');
    } else {
      throw new Error('Falha no progresso/conclusão do objetivo principal.');
    }

    // 7. Testar listagem pela API/Serviço
    console.log('\nPASSO 7: Buscando objetivos através da listagem do serviço...');
    const objectivesList = await getObjectivesList();
    const testObj = objectivesList.find(o => o.id === testObjectiveId);
    
    console.log(`✔ Objetivo na listagem: "${testObj?.name}" contendo ${testObj?.missions?.length} missões.`);
    if (testObj && testObj.missions.length === 1 && testObj.missions[0].status === 'Completed') {
      console.log('  👉 [OK] Listagem e carregamento relacional de técnicas e missões corretos!');
    } else {
      throw new Error('Falha na listagem estruturada de objetivos.');
    }

  } catch (error: any) {
    console.error('\n❌ Falha nos testes de objetivos e missões culinárias:', error.message);
    process.exit(1);
  } finally {
    // 8. Limpeza do Banco de Dados
    console.log('\n🧹 Iniciando limpeza do banco de dados local...');
    if (testSessionId) {
      await db.delete(schema.cookingSessionRecipes).where(eq(schema.cookingSessionRecipes.cookingSessionId, testSessionId));
      await db.delete(schema.cookingSessions).where(eq(schema.cookingSessions.id, testSessionId));
    }
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
    console.log('✔ Limpeza concluída com sucesso.');
  }

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE OBJETIVOS E MISSÕES PASSARAM! 🎉');
  console.log('======================================================\n');
}

runObjectivesTests().catch(console.error);
