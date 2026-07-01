import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { startCookingSession, endCookingSession } from './services/cooking-session.js';
import { createRecipe, createRecipeVersion } from './services/recipe.js';
import { eventEngine } from './core/event-engine.js';

// Native fetch interceptor to mock the Gemini reflection call
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input.toString();
  if (urlStr.includes('generativelanguage.googleapis.com')) {
    console.log('🤖 [Test Mock] Intercepting Gemini API reflection loop...');
    
    // Simulate technique ID (we will query or assume 1)
    let technique = await db.query.techniques.findFirst();
    const techId = technique ? technique.id : 1;

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  shouldCreateNewVersion: true,
                  newVersionNumber: '1.1',
                  newVersionName: 'Bisteca Suína de Teste CBE (Tempo Ajustado)',
                  newVersionDescription: 'Versão adaptada e otimizada para Air Fryer com base no teste real de 22 minutos.',
                  estimatedTimeMinutes: 22,
                  updatedSteps: [
                    {
                      stepOrder: 1,
                      techniqueId: techId,
                      notes: 'Pincele azeite e asse na Air Fryer a 200°C por 20 a 22 minutos, virando na metade do tempo.'
                    },
                    {
                      stepOrder: 2,
                      techniqueId: techId,
                      notes: 'À parte, derreta a manteiga com alho e regue por cima ao tirar da Air Fryer.'
                    }
                  ],
                  updatedIngredients: []
                })
              }
            ]
          }
        }
      ]
    };
    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return originalFetch(input, init);
};

async function runCBETests() {
  console.log('\n======================================================');
  console.log('🧪 TESTES DO MOTOR DE COMPORTAMENTO COGNITIVO (CBE)');
  console.log('======================================================\n');

  let testRecipeId: number | null = null;
  let testVersionId: number | null = null;
  let testSessionId: number | null = null;
  let hasError = false;

  try {
    // 0. Pre-cleanup
    await db.delete(schema.recipes).where(eq(schema.recipes.name, 'Bisteca Suína de Teste CBE'));

    // 1. Create test recipe and version
    console.log('PASSO 1: Criando receita e versão base (v1.0)...');
    const recipe = await createRecipe(
      'Bisteca Suína de Teste CBE',
      'Receita de teste para validar o loop de aprendizado do CBE',
      'Suína',
      ['Suíno', 'CBE']
    );
    testRecipeId = recipe.id;

    // Resolve a technique ID
    let technique = await db.query.techniques.findFirst();
    if (!technique) {
      [technique] = await db.insert(schema.techniques).values({
        name: 'Grelhar no Calor',
        description: 'Técnica de calor',
        difficulty: 'Easy'
      }).returning();
    }

    const version = await createRecipeVersion(
      testRecipeId,
      '1.0',
      'Bisteca Clássica CBE',
      'Bisteca de teste feita na frigideira',
      2,
      true,
      15,
      'Easy',
      [],
      [
        { stepOrder: 1, techniqueId: technique.id, notes: 'Grelhar na frigideira com óleo por 15 min.' }
      ]
    );
    testVersionId = version.id;
    console.log(`✔ Receita base criada: ID #${testRecipeId}, Versão ID #${testVersionId}`);

    // Ensure environment key is present for the reflection trigger
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock-api-key';

    // 2. Start a cooking session
    console.log('\nPASSO 2: Iniciando sessão culinária...');
    const sessionRes = await startCookingSession({
      date: new Date().toISOString().split('T')[0],
      startTime: '12:00',
      location: 'Cozinha de Testes',
      chef: 'Francisco Teste',
      recipeVersionIds: [testVersionId]
    });
    testSessionId = sessionRes.session.id;
    console.log(`✔ Sessão iniciada: ID #${testSessionId}`);

    // 3. End session, logging feedback that triggers learning and recipe evolution
    console.log('\nPASSO 3: Finalizando sessão culinária com feedbacks de erro/aprendizado...');
    const endRes = await endCookingSession(testSessionId, {
      endTime: '12:22',
      equipmentUsed: 'Air Fryer',
      overallRating: 5,
      successes: 'Carne suculenta no final.',
      errors: '15 min foi curto na Air Fryer, precisei de 22 min para dourar.',
      learnings: 'A manteiga de alho regada pós-preparo preserva a umidade.',
      nextAttemptSuggestions: 'Ajustar o tempo padrão de cozimento para 22 minutos.'
    });

    console.log('✔ Sessão finalizada com sucesso. Analisando as alterações de aprendizado do CBE...');

    // 4. Validate Recipe Preferences (Promoted automatically)
    console.log('\nPASSO 4: Validando preferências salvas na receita...');
    const updatedRecipe = await db.query.recipes.findFirst({
      where: eq(schema.recipes.id, testRecipeId)
    });

    if (!updatedRecipe) {
      throw new Error('Falha ao recuperar a receita atualizada.');
    }

    console.log(`  - Equipamento Preferido: "${updatedRecipe.preferredEquipment}" (Esperado: "Air Fryer")`);
    console.log(`  - Motivo da Preferência: "${updatedRecipe.preferenceReason}"`);

    if (updatedRecipe.preferredEquipment !== 'Air Fryer') {
      throw new Error('CBE falhou ao registrar o equipamento preferido na receita.');
    }
    if (!updatedRecipe.preferenceReason || !updatedRecipe.preferenceReason.includes('suculenta')) {
      throw new Error('CBE falhou ao preencher o motivo da preferência.');
    }
    console.log('✔ Promoção a equipamento preferido validada com sucesso!');

    // 5. Validate Recipe Evolution ("Receita Viva")
    console.log('\nPASSO 5: Validando evolução automática da receita viva...');
    // We expect a new version (1.1) to be created and set as currentVersionId
    const finalRecipe = await db.query.recipes.findFirst({
      where: eq(schema.recipes.id, testRecipeId)
    });
    
    const activeVersionId = finalRecipe?.currentVersionId;
    if (!activeVersionId || activeVersionId === testVersionId) {
      throw new Error('CBE falhou em criar ou definir a nova versão ativa da receita.');
    }

    const evolvedVersion = await db.query.recipeVersions.findFirst({
      where: eq(schema.recipeVersions.id, activeVersionId)
    });

    if (!evolvedVersion) {
      throw new Error('Falha ao recuperar a versão evoluída.');
    }

    console.log(`  - Nova Versão Ativa: ID #${evolvedVersion.id} (v${evolvedVersion.versionNumber})`);
    console.log(`  - Título da Versão: "${evolvedVersion.name}"`);
    console.log(`  - Descrição da Versão: "${evolvedVersion.description}"`);
    console.log(`  - Tempo Estimado: ${evolvedVersion.estimatedTimeMinutes} min (Esperado: 22)`);

    if (evolvedVersion.versionNumber !== '1.1') {
      throw new Error(`Número da versão esperado "1.1", obtido: "${evolvedVersion.versionNumber}"`);
    }
    if (evolvedVersion.estimatedTimeMinutes !== 22) {
      throw new Error(`Tempo estimado esperado 22, obtido: ${evolvedVersion.estimatedTimeMinutes}`);
    }

    // Check if the steps are updated
    const evolvedSteps = await db
      .select()
      .from(schema.recipeTechniques)
      .where(eq(schema.recipeTechniques.recipeVersionId, evolvedVersion.id))
      .orderBy(schema.recipeTechniques.stepOrder);

    console.log('  - Passos da nova versão:');
    evolvedSteps.forEach(s => {
      console.log(`    [Passo ${s.stepOrder}] "${s.notes}"`);
    });

    if (evolvedSteps.length !== 2 || !evolvedSteps[0].notes?.includes('22 minutos')) {
      throw new Error('Os passos da versão evoluída não foram atualizados corretamente pela CBE.');
    }
    console.log('✔ Evolução estrutural da Receita Viva validada com sucesso!');

    // 6. Validate notifications triggered
    console.log('\nPASSO 6: Validando disparo de notificações do EventEngine...');
    const cbeNotif = eventEngine.activeNotifications.find(n => n.ruleName === 'Evolução de Receita Viva');
    if (!cbeNotif) {
      throw new Error('Nenhuma notificação de evolução de receita foi disparada pela CBE.');
    }
    console.log(`  - Notificação ativa disparada: "${cbeNotif.message}"`);
    console.log('✔ Notificação de evolução validada com sucesso!');

  } catch (err: any) {
    hasError = true;
    console.error('\n❌ ERRO DURANTE A EXECUÇÃO DOS TESTES CBE:', err.message);
  } finally {
    // 7. Cleanup database records
    console.log('\nPASSO 7: Limpando registros de teste do banco de dados...');
    try {
      // Find all versions of this recipe
      if (testRecipeId) {
        const versions = await db
          .select({ id: schema.recipeVersions.id })
          .from(schema.recipeVersions)
          .where(eq(schema.recipeVersions.recipeId, testRecipeId));
        
        for (const v of versions) {
          await db.delete(schema.recipeTechniques).where(eq(schema.recipeTechniques.recipeVersionId, v.id));
          await db.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeVersionId, v.id));
          await db.delete(schema.ratings).where(eq(schema.ratings.recipeVersionId, v.id));
        }

        await db.delete(schema.cookingSessionRecipes).where(eq(schema.cookingSessionRecipes.recipeVersionId, testVersionId!));
        await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.recipeId, testRecipeId));
        await db.delete(schema.recipes).where(eq(schema.recipes.id, testRecipeId));
      }
      if (testSessionId) {
        await db.delete(schema.cookingSessions).where(eq(schema.cookingSessions.id, testSessionId));
      }
      // Remove test notification
      eventEngine.activeNotifications = eventEngine.activeNotifications.filter(n => n.ruleName !== 'Evolução de Receita Viva');
      
      console.log('✔ Limpeza concluída.');
    } catch (cleanupErr: any) {
      console.error('Erro durante a limpeza de dados:', cleanupErr.message);
    }
  }

  // Restore global fetch
  globalThis.fetch = originalFetch;

  console.log('\n======================================================');
  if (hasError) {
    console.log('❌ FALHA: Alguns testes CBE falharam. Veja acima.');
    console.log('======================================================\n');
    process.exit(1);
  } else {
    console.log('🎉 SUCESSO: Todos os testes do CBE passaram com 100% de sucesso!');
    console.log('======================================================\n');
    process.exit(0);
  }
}

runCBETests();
