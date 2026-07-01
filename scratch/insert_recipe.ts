import { db } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { createRecipe, createRecipeVersion, getOrCreateIngredient, getOrCreateTechnique } from '../src/services/recipe.js';

async function main() {
  const recipeName = 'Strogonoff de Frango Cremoso';
  
  // Check if recipe already exists
  const existingRecipe = await db.query.recipes.findFirst({
    where: eq(schema.recipes.name, recipeName),
  });

  if (existingRecipe) {
    console.log(`Receita "${recipeName}" já existe com ID: ${existingRecipe.id}`);
    return;
  }

  // Create recipe metadata
  console.log('Criando metadados da receita...');
  const recipe = await createRecipe(
    recipeName,
    'Um delicioso estrogonofe de frango quente e cremoso, perfeito para dias frios. Feito com peito de frango e creme de leite.',
    'Brasileira',
    ['Quente', 'Conforto', 'Frango']
  );

  // Retrieve or create ingredients to map their IDs
  const ingFrango = await getOrCreateIngredient('Peito de frango', 'Proteínas', 'g');
  const ingCreme = await getOrCreateIngredient('Creme de leite', 'Laticínios', 'g');
  const ingTomate = await getOrCreateIngredient('Extrato de tomate', 'Mercearia', 'g');
  const ingCebola = await getOrCreateIngredient('Cebola', 'Hortifrúti', 'unidade');
  const ingAlho = await getOrCreateIngredient('Alho', 'Hortifrúti', 'unidade');
  const ingManteiga = await getOrCreateIngredient('Manteiga', 'Laticínios', 'g');
  const ingAzeite = await getOrCreateIngredient('Azeite de Oliva', 'Mercearia', 'ml');
  const ingSal = await getOrCreateIngredient('Sal', 'Condimentos', 'g');
  const ingPimenta = await getOrCreateIngredient('Pimenta-do-reino', 'Condimentos', 'g');

  // Retrieve or create techniques
  const techRefogar = await getOrCreateTechnique('Refogar', 'Cozinhar rapidamente em pouca gordura quente', 'Easy');
  const techCozinhar = await getOrCreateTechnique('Cozimento Lento', 'Cozinhar em fogo baixo com líquidos', 'Easy');

  // Define ingredients and steps for 2 portions (standard user size)
  const ingredientsList = [
    { ingredientId: ingFrango.id, amount: 300, unit: 'g', notes: 'Cortado em cubos pequenos' },
    { ingredientId: ingCebola.id, amount: 0.5, unit: 'unidade', notes: 'Picada fina' },
    { ingredientId: ingAlho.id, amount: 2, unit: 'unidade', notes: 'Dentes picados ou amassados' },
    { ingredientId: ingManteiga.id, amount: 15, unit: 'g', notes: 'Para refogar o frango' },
    { ingredientId: ingAzeite.id, amount: 10, unit: 'ml', notes: 'Fio de azeite' },
    { ingredientId: ingTomate.id, amount: 40, unit: 'g', notes: 'Extrato de tomate' },
    { ingredientId: ingCreme.id, amount: 200, unit: 'g', notes: 'Creme de leite de caixinha' },
    { ingredientId: ingSal.id, amount: 2, unit: 'g', notes: 'Para temperar' },
    { ingredientId: ingPimenta.id, amount: 1, unit: 'g', notes: 'A gosto' },
  ];

  const techniquesList = [
    { stepOrder: 1, techniqueId: techRefogar.id, notes: 'Tempere o peito de frango com sal e pimenta-do-reino. Em uma panela quente, aqueça a manteiga e o azeite e doure o frango por cerca de 5 a 7 minutos até dourar bem. Retire o frango e reserve.' },
    { stepOrder: 2, techniqueId: techRefogar.id, notes: 'Na mesma panela, adicione a cebola e o alho picados. Refogue por 3 minutos até dourarem, limpando o fundo da panela.' },
    { stepOrder: 3, techniqueId: techCozinhar.id, notes: 'Retorne o frango dourado para a panela, adicione o extrato de tomate e misture bem. Deixe cozinhar por 2 minutos em fogo médio.' },
    { stepOrder: 4, techniqueId: techCozinhar.id, notes: 'Reduza o fogo para o mínimo, adicione o creme de leite e mexa bem. Deixe aquecer por 1 a 2 minutos sem ferver para não talhar. Sirva quente com arroz branco.' },
  ];

  // Insert recipe version v1.0
  console.log('Criando versão da receita (v1.0)...');
  const version = await createRecipeVersion(
    recipe.id,
    '1.0',
    'Strogonoff de Frango Tradicional',
    'Receita clássica de strogonoff brasileiro super cremosa feita na panela.',
    2,
    true,
    20,
    'Easy',
    ingredientsList,
    techniquesList
  );

  // Set current version of the recipe
  await db
    .update(schema.recipes)
    .set({ currentVersionId: version.id })
    .where(eq(schema.recipes.id, recipe.id));

  console.log(`Receita cadastrada com sucesso! ID Receita: ${recipe.id}, ID Versão: ${version.id}`);
}

main().catch(err => console.error(err));
