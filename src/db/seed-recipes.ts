import * as recipeService from '../services/recipe.js';
import { db } from './client.js';
import * as schema from './schema.js';

async function seedRecipes() {
  console.log('Seeding famous recipes matching your profile...');

  // Ensure base ingredients are resolved
  const acem = await recipeService.getOrCreateIngredient('Acém', 'Proteínas', 'g');
  const coxao = await recipeService.getOrCreateIngredient('Coxão mole', 'Proteínas', 'g');
  const frango = await recipeService.getOrCreateIngredient('Peito de frango', 'Proteínas', 'g');
  const bisteca = await recipeService.getOrCreateIngredient('Bisteca suína', 'Proteínas', 'g');
  const linguica = await recipeService.getOrCreateIngredient('Linguiça Toscana', 'Proteínas', 'g');

  const cebola = await recipeService.getOrCreateIngredient('Cebola', 'Vegetais', 'g');
  const alho = await recipeService.getOrCreateIngredient('Alho', 'Temperos', 'g');
  const pimentoes = await recipeService.getOrCreateIngredient('Pimentões', 'Vegetais', 'g');
  const tomate = await recipeService.getOrCreateIngredient('Tomate', 'Vegetais', 'g');
  const batata = await recipeService.getOrCreateIngredient('Batata', 'Vegetais', 'g');

  const cremeLeite = await recipeService.getOrCreateIngredient('Creme de leite', 'Laticínios', 'g');
  const extratoTomate = await recipeService.getOrCreateIngredient('Extrato de tomate', 'Outros', 'g');
  const manteiga = await recipeService.getOrCreateIngredient('Manteiga', 'Laticínios', 'g');
  const azeite = await recipeService.getOrCreateIngredient('Azeite de Oliva', 'Temperos', 'ml');
  const vinhoTinto = await recipeService.getOrCreateIngredient('Vinho Tinto Seco', 'Temperos', 'ml');
  const pimenta = await recipeService.getOrCreateIngredient('Pimenta-do-reino', 'Temperos', 'g');
  const sal = await recipeService.getOrCreateIngredient('Sal', 'Temperos', 'g');

  // Resolve Techniques
  const selar = await recipeService.getOrCreateTechnique('Selar', 'Dourar a carne rapidamente em alta temperatura.');
  const refogar = await recipeService.getOrCreateTechnique('Refogar', 'Cozinhar cebola e alho na gordura quente.');
  const deglacar = await recipeService.getOrCreateTechnique('Deglaçar', 'Usar líquido para soltar a crosta do fundo da panela.');
  const brasear = await recipeService.getOrCreateTechnique('Brasear', 'Cozimento lento tampado com líquido.');
  const reduzir = await recipeService.getOrCreateTechnique('Reduzir', 'Ferver para encorpar e concentrar sabor.');

  // --- RECIPE 1: Strogonoff de Frango ---
  const r1 = await recipeService.createRecipe('Strogonoff de Frango Clássico', 'Prato cremoso com peito de frango selado e molho encorpado.', 'Brasileira', ['Marmitável', 'Rápido']);
  await recipeService.createRecipeVersion(
    r1.id,
    '1.0',
    'Primeiro lançamento',
    'Versão clássica com creme de leite e extrato de tomate.',
    2,
    true,
    25,
    'Easy',
    [
      { ingredientId: frango.id, amount: 300, unit: 'g' },
      { ingredientId: cebola.id, amount: 80, unit: 'g' },
      { ingredientId: alho.id, amount: 10, unit: 'g' },
      { ingredientId: cremeLeite.id, amount: 200, unit: 'g' },
      { ingredientId: extratoTomate.id, amount: 30, unit: 'g' },
      { ingredientId: manteiga.id, amount: 15, unit: 'g' },
      { ingredientId: sal.id, amount: 5, unit: 'g' },
      { ingredientId: pimenta.id, amount: 1, unit: 'g' },
    ],
    [
      { techniqueId: selar.id, stepOrder: 1, notes: 'Cortar frango em cubos e selar na manteiga em fogo alto.' },
      { techniqueId: refogar.id, stepOrder: 2, notes: 'Reservar frango e refogar cebola e alho na mesma panela.' },
      { techniqueId: deglacar.id, stepOrder: 3, notes: 'Adicionar extrato de tomate e deglaçar o fundo da panela.' },
      { techniqueId: reduzir.id, stepOrder: 4, notes: 'Retornar frango, adicionar creme de leite e deixar ferver levemente até engrossar.' },
    ]
  );
  console.log('✔ Strogonoff de Frango seeded.');

  // --- RECIPE 2: Picadinho de Carne ---
  const r2 = await recipeService.createRecipe('Picadinho de Carne Tradicional', 'Carne macia cortada na ponta da faca com molho aromático.', 'Brasileira', ['Comfort Food']);
  await recipeService.createRecipeVersion(
    r2.id,
    '1.0',
    'Versão original',
    'Feito com coxão mole e deglaçado com água.',
    2,
    true,
    30,
    'Easy',
    [
      { ingredientId: coxao.id, amount: 300, unit: 'g' },
      { ingredientId: cebola.id, amount: 100, unit: 'g' },
      { ingredientId: alho.id, amount: 15, unit: 'g' },
      { ingredientId: tomate.id, amount: 120, unit: 'g', notes: 'picado sem sementes' },
      { ingredientId: azeite.id, amount: 15, unit: 'ml' },
      { ingredientId: sal.id, amount: 5, unit: 'g' },
      { ingredientId: pimenta.id, amount: 2, unit: 'g' },
    ],
    [
      { techniqueId: selar.id, stepOrder: 1, notes: 'Selar o coxão mole picado no azeite quente.' },
      { techniqueId: refogar.id, stepOrder: 2, notes: 'Adicionar cebola, alho e tomate picado.' },
      { techniqueId: deglacar.id, stepOrder: 3, notes: 'Deglaçar com um pouco de água para criar o molho encorpado.' },
      { techniqueId: reduzir.id, stepOrder: 4, notes: 'Cozinhar tampado em fogo baixo até reduzir e apurar sabores.' },
    ]
  );
  console.log('✔ Picadinho de Carne seeded.');

  // --- RECIPE 3: Carne de Panela com Batatas ---
  const r3 = await recipeService.createRecipe('Carne de Panela com Batatas', 'Ensopado rico de acém braseado com batatas tenras.', 'Brasileira', ['Marmitável']);
  await recipeService.createRecipeVersion(
    r3.id,
    '1.0',
    'Versão clássica de pressão',
    'Acém cozido lentamente até desfiar.',
    2,
    true,
    50,
    'Medium',
    [
      { ingredientId: acem.id, amount: 300, unit: 'g' },
      { ingredientId: batata.id, amount: 200, unit: 'g', notes: 'em cubos grandes' },
      { ingredientId: cebola.id, amount: 100, unit: 'g' },
      { ingredientId: alho.id, amount: 15, unit: 'g' },
      { ingredientId: pimentoes.id, amount: 50, unit: 'g' },
      { ingredientId: extratoTomate.id, amount: 40, unit: 'g' },
      { ingredientId: azeite.id, amount: 15, unit: 'ml' },
      { ingredientId: sal.id, amount: 6, unit: 'g' },
    ],
    [
      { techniqueId: selar.id, stepOrder: 1, notes: 'Selar cubos grandes de acém no azeite na panela de pressão.' },
      { techniqueId: refogar.id, stepOrder: 2, notes: 'Juntar cebola, alho, pimentões e extrato de tomate.' },
      { techniqueId: brasear.id, stepOrder: 3, notes: 'Adicionar água até cobrir metade e cozinhar na pressão por 35 min.' },
      { techniqueId: reduzir.id, stepOrder: 4, notes: 'Abrir panela, juntar batatas e cozinhar sem pressão até ficarem macias e o caldo encorpar.' },
    ]
  );
  console.log('✔ Carne de Panela seeded.');

  // --- RECIPE 4: Bisteca Grelhada ---
  const r4 = await recipeService.createRecipe('Bisteca de Porco Grelhada Aromática', 'Bisteca dourada temperada com alho e finalizada na manteiga.', 'Brasileira', ['Rápido']);
  await recipeService.createRecipeVersion(
    r4.id,
    '1.0',
    'Preparo clássico na frigideira',
    'Selado rápido para manter a carne suculenta.',
    2,
    false,
    15,
    'Easy',
    [
      { ingredientId: bisteca.id, amount: 300, unit: 'g' },
      { ingredientId: alho.id, amount: 15, unit: 'g', notes: 'amassado' },
      { ingredientId: manteiga.id, amount: 20, unit: 'g' },
      { ingredientId: azeite.id, amount: 10, unit: 'ml' },
      { ingredientId: sal.id, amount: 4, unit: 'g' },
      { ingredientId: pimenta.id, amount: 2, unit: 'g' },
    ],
    [
      { techniqueId: selar.id, stepOrder: 1, notes: 'Selar as bistecas na frigideira bem quente com azeite por 3-4 min de cada lado.' },
      { techniqueId: deglacar.id, stepOrder: 2, notes: 'Adicionar manteiga e dentes de alho amassados no final, regando as bistecas com a gordura derretida.' },
    ]
  );
  console.log('✔ Bisteca Grelhada seeded.');

  // --- RECIPE 5: Ragu de Linguiça com Vinho ---
  const r5 = await recipeService.createRecipe('Ragu de Linguiça Toscana', 'Molho encorpado de linguiça debulhada reduzido no vinho tinto.', 'Italiana', ['Comfort Food', 'Marmitável']);
  await recipeService.createRecipeVersion(
    r5.id,
    '1.0',
    'Versão com vinho tinto',
    'Excelente para acompanhar massas ou polenta.',
    2,
    true,
    35,
    'Easy',
    [
      { ingredientId: linguica.id, amount: 300, unit: 'g', notes: 'debulhada (sem pele)' },
      { ingredientId: cebola.id, amount: 100, unit: 'g' },
      { ingredientId: alho.id, amount: 10, unit: 'g' },
      { ingredientId: pimentoes.id, amount: 50, unit: 'g' },
      { ingredientId: vinhoTinto.id, amount: 80, unit: 'ml' },
      { ingredientId: extratoTomate.id, amount: 45, unit: 'g' },
      { ingredientId: azeite.id, amount: 10, unit: 'ml' },
      { ingredientId: sal.id, amount: 3, unit: 'g' },
    ],
    [
      { techniqueId: refogar.id, stepOrder: 1, notes: 'Refogar a cebola, alho e pimentão no azeite. Juntar a linguiça debulhada e dourar bem.' },
      { techniqueId: deglacar.id, stepOrder: 2, notes: 'Despejar o vinho tinto seco e deglaçar, raspando os açúcares do fundo da panela.' },
      { techniqueId: reduzir.id, stepOrder: 3, notes: 'Adicionar extrato de tomate e cozinhar em fogo baixo até o álcool evaporar e o molho reduzir.' },
    ]
  );
  console.log('✔ Ragu de Linguiça seeded.');

  console.log('\nAll famous recipes seeded successfully!');
}

seedRecipes().catch(err => {
  console.error('Recipes seeding failed:', err);
  process.exit(1);
});
