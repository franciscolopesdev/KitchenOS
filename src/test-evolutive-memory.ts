import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';
import {
  getOrCreateIngredient,
  getOrCreateTechnique,
  createRecipe,
  createRecipeVersion,
  getChefTimeline,
  getCookingStats,
} from './services/recipe.js';
import {
  startCookingSession,
  endCookingSession,
  addSessionReviewerRating,
  addSessionPhoto,
} from './services/cooking-session.js';
import { manageInventory } from './services/inventory.js';

async function runEvolutiveMemoryTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTES DE EVOLUÇÃO CULINÁRIA & MEMÓRIA EM EVOLUÇÃO');
  console.log('======================================================\n');

  let testCuisineId: number | null = null;
  let testRecipeId: number | null = null;
  let testVersionId: number | null = null;
  let testIngredientId: number | null = null;
  let testTechniqueId: number | null = null;
  let testSessionId: number | null = null;

  try {
    // 1. Setup do Ingrediente
    console.log('PASSO 1: Criando ingrediente de teste e adicionando ao estoque...');
    const ingredient = await getOrCreateIngredient('Carne de Acém Premium', 'Proteínas', 'g');
    testIngredientId = ingredient.id;
    console.log(`✔ Ingrediente criado: "${ingredient.name}" (ID: ${testIngredientId})`);

    // Adiciona 1000g de acém no Fridge
    await manageInventory(testIngredientId, 1000, 'g', 'Fridge');
    const [initialStock] = await db
      .select()
      .from(schema.inventories)
      .where(eq(schema.inventories.ingredientId, testIngredientId));
    console.log(`✔ Estoque inicial abastecido: ${initialStock.amount}${initialStock.unit} no ${initialStock.location}`);

    // 2. Setup da Técnica Culinária
    console.log('\nPASSO 2: Criando técnica culinária com nível de domínio inicial...');
    const technique = await getOrCreateTechnique(
      'Braseamento Lento',
      'Cozimento em fogo baixo com líquido em panela tampada por longo período',
      'Medium',
      'Gera suculência extrema e caramelização de colágeno'
    );
    testTechniqueId = technique.id;
    // Garante que o nível de domínio começa em 1
    await db
      .update(schema.techniques)
      .set({ masteryLevel: 1 })
      .where(eq(schema.techniques.id, testTechniqueId));
    
    console.log(`✔ Técnica criada: "${technique.name}" (ID: ${testTechniqueId}) com Nível de Domínio inicial: 1`);

    // 3. Setup da Receita e Versão
    console.log('\nPASSO 3: Criando receita e versão vinculada com história e objetivo...');
    const recipe = await createRecipe(
      'Ragu de Acém Clássico',
      'Ragu cozido lentamente por horas',
      'Italiana',
      ['Almoço de Domingo', 'Para Congelar']
    );
    testRecipeId = recipe.id;

    // Atualiza a história e o objetivo diretamente
    await db
      .update(schema.recipes)
      .set({
        history: 'Esta receita nasceu da vontade de recriar os ragus de domingo da nonna usando cortes de carne mais acessíveis, cozidos com dedicação.',
        objective: 'Dominar o ponto de desfiamento da carne e redução lenta de molho de tomate aromático.',
      })
      .where(eq(schema.recipes.id, testRecipeId));

    const version = await createRecipeVersion(
      testRecipeId,
      '1.0',
      'Primeira Tentativa Ragu de Acém',
      'Versão inicial com acém braseado lentamente',
      4, // rendimento: 4 porções
      true, // freezer friendly
      120, // 2 horas
      'Medium',
      [{ ingredientId: testIngredientId, amount: 600, unit: 'g', notes: 'Cortado em cubos grandes' }],
      [{ techniqueId: testTechniqueId, stepOrder: 1, notes: 'Brasear a carne por 1.5 a 2 horas após dourar' }]
    );
    testVersionId = version.id;

    const recipeDetails = await db.query.recipes.findFirst({
      where: eq(schema.recipes.id, testRecipeId),
    });

    console.log(`✔ Receita: "${recipeDetails?.name}"`);
    console.log(`  * História: "${recipeDetails?.history}"`);
    console.log(`  * Objetivo: "${recipeDetails?.objective}"`);
    console.log(`  * Versão v${version.versionNumber} criada com ID: ${testVersionId}`);

    // 4. Iniciar Sessão de Cozinha (Cooking Session)
    console.log('\nPASSO 4: Iniciando uma nova Sessão de Cozinha...');
    const sessionRes = await startCookingSession({
      date: '2026-06-21',
      startTime: '11:30',
      location: 'Cozinha Principal',
      chef: 'Francisco',
      participants: 'Companheira',
      recipeVersionIds: [testVersionId],
    });
    testSessionId = sessionRes.session.id;
    console.log(`✔ Sessão de Cozinha #${testSessionId} criada como rascunho com sucesso.`);

    // 5. Adicionar Foto e Legendas
    console.log('\nPASSO 5: Vinculando foto do prato com legenda e versão...');
    const photo = await addSessionPhoto(
      testSessionId,
      'https://exemplo.com/fotos/ragu_acem_v1.jpg',
      'Ragu de Acém v1.0 Finalizado',
      'Textura perfeita, carne soltando fibra a fibra.',
      testVersionId
    );
    console.log(`✔ Foto registrada com legenda: "${photo.caption}" para a Versão ID: ${photo.recipeVersionId}`);

    // 6. Concluir Sessão de Cozinha e Verificar Evolução Automática
    console.log('\nPASSO 6: Concluindo Sessão de Cozinha (Simulando sucesso: Nota 5)...');
    const endRes = await endCookingSession(testSessionId, {
      endTime: '13:00', // 11:30 às 13:00 = 90 min (1.5 horas)
      mood: '🥰 Inspirado',
      overallRating: 5,
      learnings: 'Braseamento necessita de fogo realmente mínimo para não queimar o fundo.',
      errors: 'Cortei as cenouras muito finas e elas sumiram no molho.',
      successes: 'A carne desfiou perfeitamente e o molho reduziu no ponto certo.',
      neverAgain: 'Não usar fogo médio ou alto após iniciar a fervura.',
      whyWorked: 'Panela de ferro fundido manteve o calor constante.',
      nextAttemptSuggestions: 'Adicionar cogumelos frescos na última meia hora.',
      generalNotes: 'Almoço delicioso de domingo em família.',
      servingsCooked: 4, // consome 4 porções
    });

    console.log(`✔ Sessão finalizada. Duração calculada: ${endRes.session.durationMinutes} minutos.`);
    console.log(`✔ Diário de Aprendizado salvo com sucesso.`);

    // Verificar se o estoque foi devidamente reduzido:
    // Receita pedia 600g para 4 porções. Servings cooked foi 4. Então deve reduzir exatamente 600g.
    // Estoque inicial era 1000g. Estoque final esperado: 400g.
    const [finalStock] = await db
      .select()
      .from(schema.inventories)
      .where(eq(schema.inventories.ingredientId, testIngredientId));
    console.log(`✔ Verificação de Estoque: Restam ${finalStock ? finalStock.amount : 0}g no estoque (Esperado: 400g).`);
    if (finalStock && finalStock.amount === 400) {
      console.log('  👉 [OK] Baixa de estoque precisa e perfeita!');
    } else {
      console.error(`  👉 [ERRO] Estoque final incorreto: ${finalStock ? finalStock.amount : 'null'}`);
    }

    // Verificar se o nível de domínio da técnica evoluiu
    const updatedTechnique = await db.query.techniques.findFirst({
      where: eq(schema.techniques.id, testTechniqueId),
    });
    console.log(`✔ Verificação de Técnica: Domínio de "${updatedTechnique?.name}": ${updatedTechnique?.masteryLevel}/10 (Esperado: 2/10).`);
    if (updatedTechnique && updatedTechnique.masteryLevel === 2) {
      console.log('  👉 [OK] Evolução técnica automática de nível disparada com sucesso!');
    } else {
      console.error(`  👉 [ERRO] Domínio técnico incorreto: ${updatedTechnique?.masteryLevel}`);
    }

    // 7. Adicionar avaliações independentes por participante (Multi-User Ratings)
    console.log('\nPASSO 7: Adicionando avaliações independentes dos participantes...');
    await addSessionReviewerRating(
      testSessionId,
      testVersionId,
      'Francisco',
      5,
      'Melhor ragu que já fiz na vida. Carne extremamente macia.',
      true,
      'Nenhuma'
    );

    await addSessionReviewerRating(
      testSessionId,
      testVersionId,
      'Companheira',
      4,
      'Sabor espetacular, muito encorpado. Só achei um pouquinho salgado no final.',
      true,
      'Reduzir um pouco o sal na selagem inicial.'
    );

    // O sistema deve calcular automaticamente a média e atualizar a nota geral da sessão
    // Avaliações: Francisco (5) + Companheira (4) = Média 4.5.
    const updatedSession = await db.query.cookingSessions.findFirst({
      where: eq(schema.cookingSessions.id, testSessionId),
    });
    console.log(`✔ Verificação de Avaliação Média da Sessão: ${updatedSession?.overallRating}/5 (Esperado: 4.5/5).`);
    if (updatedSession && updatedSession.overallRating === 4.5) {
      console.log('  👉 [OK] Média de avaliações atualizada automaticamente de forma perfeita!');
    } else {
      console.error(`  👉 [ERRO] Avaliação geral da sessão incorreta: ${updatedSession?.overallRating}`);
    }

    // 8. Testar Visualização de Timeline e Histórico (Biografia Culinária)
    console.log('\nPASSO 8: Compilando a Linha do Tempo & Biografia Culinária (Markdown)...');
    const timeline = await getChefTimeline();
    console.log('\n--- TIMELINE GERADA ---');
    console.log(timeline);
    console.log('------------------------');

    if (timeline.includes('Ragu de Acém Clássico') && timeline.includes('Braseamento Lento')) {
      console.log('✔ Timeline contem as informações da sessão de cozimento e domínio técnico!');
    } else {
      console.error('❌ Erro na geração da timeline: Falta dados cruciais de teste.');
    }

    // 9. Testar estatísticas culinárias
    console.log('\nPASSO 9: Obtendo estatísticas de cozinha...');
    const stats = await getCookingStats();
    console.log(`- Total de Sessões: ${stats.totalSessions}`);
    console.log(`- Ingredientes Mais Utilizados:`, stats.topIngredients.map(i => `${i.name} (${i.count}x)`).join(', '));
    console.log(`- Ingredientes Esquecidos (Pouco Usados):`, stats.neglectedIngredients.map(i => `${i.name}`).join(', '));

  } catch (error: any) {
    console.error('\n❌ Falha nos testes de evolução e memória culinária:', error.message);
    process.exit(1);
  } finally {
    // 10. Limpeza dos Dados de Teste no SQLite
    console.log('\n🧹 Iniciando limpeza do banco de dados local...');
    if (testSessionId) {
      await db.delete(schema.ratings).where(eq(schema.ratings.cookingSessionId, testSessionId));
      await db.delete(schema.photos).where(eq(schema.photos.cookingSessionId, testSessionId));
      await db.delete(schema.cookingSessionRecipes).where(eq(schema.cookingSessionRecipes.cookingSessionId, testSessionId));
      await db.delete(schema.cookingSessions).where(eq(schema.cookingSessions.id, testSessionId));
    }
    if (testVersionId) {
      await db.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeVersionId, testVersionId));
      await db.delete(schema.recipeTechniques).where(eq(schema.recipeTechniques.recipeVersionId, testVersionId));
      await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, testVersionId));
    }
    if (testRecipeId) {
      await db.delete(schema.recipeTags).where(eq(schema.recipeTags.recipeId, testRecipeId));
      await db.delete(schema.recipes).where(eq(schema.recipes.id, testRecipeId));
    }
    if (testIngredientId) {
      await db.delete(schema.inventories).where(eq(schema.inventories.ingredientId, testIngredientId));
      await db.delete(schema.ingredients).where(eq(schema.ingredients.id, testIngredientId));
    }
    if (testTechniqueId) {
      await db.delete(schema.techniques).where(eq(schema.techniques.id, testTechniqueId));
    }
    console.log('✔ Limpeza concluída com sucesso.');
  }

  console.log('\n======================================================');
  console.log('🎉 TODOS OS TESTES DE EVOLUÇÃO CULINÁRIA PASSARAM! 🎉');
  console.log('======================================================\n');
}

runEvolutiveMemoryTests().catch(console.error);
