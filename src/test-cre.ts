import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  adaptRecipeForEquipment,
  logAdaptationFeedback,
  getEquipmentList,
  toggleEquipment
} from './services/cre.js';
import {
  createRecipe,
  createRecipeVersion
} from './services/recipe.js';

async function runCRETests() {
  console.log('\n======================================================');
  console.log('🧪 TESTES DO MOTOR DE RACIOCÍNIO CULINÁRIO (CRE)');
  console.log('======================================================\n');

  let testRecipeId: number | null = null;
  let testVersionId: number | null = null;
  let testAdaptationId: number | null = null;
  let hasError = false;

  try {
    // 0. Pre-cleanup in case of previous crashes
    await db.delete(schema.recipes).where(eq(schema.recipes.name, 'Bisteca Suína de Teste'));

    // 1. Get initial equipment list and verify seed items
    console.log('PASSO 1: Buscando lista de utensílios do usuário...');
    const equipments = await getEquipmentList();
    console.log(`✔ Encontrados ${equipments.length} equipamentos cadastrados.`);
    
    const airFryer = equipments.find(e => e.name === 'Air Fryer');
    if (!airFryer) {
      throw new Error('Equipamento seed "Air Fryer" não encontrado.');
    }
    console.log(`✔ Equipamento "Air Fryer" status de disponibilidade: ${airFryer.isAvailable}`);

    // 2. Toggle equipment availability
    console.log('\nPASSO 2: Testando alternar disponibilidade do equipamento...');
    const originalStatus = airFryer.isAvailable;
    const toggled = await toggleEquipment(airFryer.id, !originalStatus);
    console.log(`✔ Novo status retornado da função: ${toggled.isAvailable}`);
    if (toggled.isAvailable === originalStatus) {
      throw new Error('A função de alternar status de equipamento falhou.');
    }
    // Revert back
    await toggleEquipment(airFryer.id, originalStatus);
    console.log('✔ Retornado status original do equipamento com sucesso.');

    // 3. Create test recipe and version
    console.log('\nPASSO 3: Criando receita e versão de teste para adaptação...');
    const recipe = await createRecipe(
      'Bisteca Suína de Teste',
      'Bisteca de teste para validação física do motor cognitivo',
      'Suína',
      ['Suíno', 'Rápido']
    );
    testRecipeId = recipe.id;

    const version = await createRecipeVersion(
      testRecipeId,
      '1.0',
      'Bisteca de Teste Clássica',
      'Receita de bisteca suína temperada feita tradicionalmente na frigideira',
      2, // servings
      true,
      20,
      'Easy',
      [],
      []
    );
    testVersionId = version.id;
    console.log(`✔ Receita de teste criada: ID #${testRecipeId}, Versão: ID #${testVersionId}`);

    // 4. Insert steps/techniques for the test recipe version
    console.log('\nPASSO 4: Inserindo etapas e técnicas culinárias na receita...');
    
    // We need to resolve a technique ID. We can select the first technique from database or create a test one
    let technique = await db.query.techniques.findFirst();
    if (!technique) {
      [technique] = await db.insert(schema.techniques).values({
        name: 'Selagem de Teste',
        description: 'Selar carnes',
        difficulty: 'Easy'
      }).returning();
    }

    await db.insert(schema.recipeTechniques).values([
      {
        recipeVersionId: testVersionId,
        techniqueId: technique.id,
        stepOrder: 1,
        notes: 'Selar a bisteca suína em fogo alto com um fio de azeite até dourar bem de ambos os lados.'
      },
      {
        recipeVersionId: testVersionId,
        techniqueId: technique.id,
        stepOrder: 2,
        notes: 'Regar a carne na frigideira com manteiga derretida e dentes de alho amassados.'
      }
    ]);
    console.log('✔ Etapas culinárias ("Selar", "Regar com manteiga") associadas com sucesso.');

    // 5. Test Recipe Adaptation: Skillet -> Air Fryer
    console.log('\nPASSO 5: Executando motor de adaptação culinária (Frigideira -> Air Fryer)...');
    const adaptation = await adaptRecipeForEquipment(testVersionId, 'Air Fryer');
    testAdaptationId = adaptation.id ?? null;

    console.log('✔ Adaptação gerada com sucesso:');
    console.log(`  - Nível de Confiança: ${adaptation.confidence}%`);
    console.log(`  - Raciocínio Físico-Térmico: "${adaptation.explanation}"`);
    console.log('  - Passos Adaptados:');
    
    adaptation.adaptationsApplied.forEach(step => {
      console.log(`    [Passo ${step.stepOrder}]`);
      console.log(`      Original: "${step.originalText}"`);
      console.log(`      Adaptado: "${step.adaptedText}"`);
      console.log(`      Motivo:   "${step.reason}"`);
    });

    // Validations: check physics reasoning rules
    const firstStep = adaptation.adaptationsApplied.find(s => s.stepOrder === 1);
    const secondStep = adaptation.adaptationsApplied.find(s => s.stepOrder === 2);

    if (!firstStep || !firstStep.adaptedText.includes('azeite') || !firstStep.adaptedText.includes('200°C')) {
      throw new Error('Falha na adaptação do primeiro passo (azeite/convecção).');
    }
    if (!secondStep || !secondStep.adaptedText.includes('À parte') || !secondStep.adaptedText.includes('Regue por cima')) {
      throw new Error('Falha na adaptação do segundo passo (manteiga pós-preparo).');
    }
    console.log('✔ Regras físicas de cocção e umidade na Air Fryer validadas com sucesso!');

    // 5.5: Test Oven -> Air Fryer gratinating adaptation
    console.log('\nPASSO 5.5: Executando motor de adaptação culinária (Forno -> Air Fryer com Gratinar)...');
    const ovenVersion = await createRecipeVersion(
      testRecipeId!,
      '1.1-Forno',
      'Bisteca Suína no Forno com Queijo',
      'Assar a bisteca no forno convencional',
      2,
      true,
      25,
      'Medium',
      [],
      []
    );
    await db.insert(schema.recipeTechniques).values([
      {
        recipeVersionId: ovenVersion.id,
        techniqueId: technique.id,
        stepOrder: 1,
        notes: 'Coloque as fatias de queijo sobre as bistecas e leve ao forno para gratinar por 10 minutos.'
      }
    ]);
    const ovenAdaptation = await adaptRecipeForEquipment(ovenVersion.id, 'Air Fryer');
    console.log('✔ Adaptação Forno -> Air Fryer (Gratinar) gerada com sucesso:');
    console.log(`  - Nível de Confiança: ${ovenAdaptation.confidence}%`);
    console.log(`  - Raciocínio: "${ovenAdaptation.explanation}"`);
    
    const gratinStep = ovenAdaptation.adaptationsApplied.find(s => s.stepOrder === 1);
    if (!gratinStep || !gratinStep.adaptedText.includes('200°C') || !gratinStep.adaptedText.includes('Evite queijo ralado de saquinho')) {
      throw new Error('Falha na adaptação do gratinado de Forno para Air Fryer (esperava 200°C e aviso de queijo ralado).');
    }
    console.log('✔ Regras físicas de gratinado na Air Fryer validadas com sucesso!');

    // Clean up oven version techniques and adaptation
    await db.delete(schema.recipeTechniques).where(eq(schema.recipeTechniques.recipeVersionId, ovenVersion.id));
    await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, ovenVersion.id));
    if (ovenAdaptation.id) {
      await db.delete(schema.recipeAdaptations).where(eq(schema.recipeAdaptations.id, ovenAdaptation.id));
    }

    // 6. Test User Feedback Rating Logging
    console.log('\nPASSO 6: Registrando feedback qualitativo do usuário...');
    const updatedAdaptation = await logAdaptationFeedback(testAdaptationId!, 'Excelente');
    console.log(`✔ Feedback salvo no banco local: "${updatedAdaptation.feedbackRating}"`);
    if (updatedAdaptation.feedbackRating !== 'Excelente') {
      throw new Error('O feedback registrado não coincide com o valor enviado.');
    }

  } catch (err: any) {
    hasError = true;
    console.error('\n❌ ERRO DURANTE A EXECUÇÃO DOS TESTES:', err.message);
  } finally {
    // 7. Cleanup database records
    console.log('\nPASSO 7: Limpando registros de teste do banco de dados...');
    try {
      if (testAdaptationId) {
        await db.delete(schema.recipeAdaptations).where(eq(schema.recipeAdaptations.id, testAdaptationId));
      }
      if (testVersionId) {
        await db.delete(schema.recipeTechniques).where(eq(schema.recipeTechniques.recipeVersionId, testVersionId));
        await db.delete(schema.recipeVersions).where(eq(schema.recipeVersions.id, testVersionId));
      }
      if (testRecipeId) {
        await db.delete(schema.recipes).where(eq(schema.recipes.id, testRecipeId));
      }
      console.log('✔ Limpeza concluída.');
    } catch (cleanupErr: any) {
      console.error('Erro durante a limpeza de dados:', cleanupErr.message);
    }
  }

  console.log('\n======================================================');
  if (hasError) {
    console.log('❌ FALHA: Alguns testes CRE falharam. Veja acima.');
    console.log('======================================================\n');
    process.exit(1);
  } else {
    console.log('🎉 SUCESSO: Todos os testes do CRE passaram com 100% de sucesso!');
    console.log('======================================================\n');
    process.exit(0);
  }
}

runCRETests();
