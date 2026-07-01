import * as recipeService from '../services/recipe.js';
import { db } from './client.js';
import * as schema from './schema.js';
import { eq, like, or } from 'drizzle-orm';

const MEALDB_ID_PREFIX = 'TheMealDB ID:';

// Simple translations dictionary for common ingredients to keep database clean
const translations: Record<string, { name: string; category: string; unit: string }> = {
  'beef': { name: 'Acém', category: 'Proteínas', unit: 'g' },
  'beef mince': { name: 'Acém moído', category: 'Proteínas', unit: 'g' },
  'minced beef': { name: 'Acém moído', category: 'Proteínas', unit: 'g' },
  'chicken': { name: 'Peito de frango', category: 'Proteínas', unit: 'g' },
  'chicken breast': { name: 'Peito de frango', category: 'Proteínas', unit: 'g' },
  'chicken breasts': { name: 'Peito de frango', category: 'Proteínas', unit: 'g' },
  'pork': { name: 'Carne de porco', category: 'Proteínas', unit: 'g' },
  'pork chops': { name: 'Bisteca suína', category: 'Proteínas', unit: 'g' },
  'sausage': { name: 'Linguiça', category: 'Proteínas', unit: 'g' },
  'sausages': { name: 'Linguiça', category: 'Proteínas', unit: 'g' },

  'onion': { name: 'Cebola', category: 'Vegetais', unit: 'g' },
  'onions': { name: 'Cebola', category: 'Vegetais', unit: 'g' },
  'garlic': { name: 'Alho', category: 'Temperos', unit: 'g' },
  'garlic clove': { name: 'Alho', category: 'Temperos', unit: 'g' },
  'garlic cloves': { name: 'Alho', category: 'Temperos', unit: 'g' },
  'tomato': { name: 'Tomate', category: 'Vegetais', unit: 'g' },
  'tomatoes': { name: 'Tomate', category: 'Vegetais', unit: 'g' },
  'potato': { name: 'Batata', category: 'Vegetais', unit: 'g' },
  'potatoes': { name: 'Batata', category: 'Vegetais', unit: 'g' },
  'red pepper': { name: 'Pimentões', category: 'Vegetais', unit: 'g' },
  'green pepper': { name: 'Pimentões', category: 'Vegetais', unit: 'g' },
  'bell pepper': { name: 'Pimentões', category: 'Vegetais', unit: 'g' },

  'butter': { name: 'Manteiga', category: 'Laticínios', unit: 'g' },
  'cream': { name: 'Creme de leite', category: 'Laticínios', unit: 'g' },
  'double cream': { name: 'Creme de leite', category: 'Laticínios', unit: 'g' },
  'heavy cream': { name: 'Creme de leite', category: 'Laticínios', unit: 'g' },
  'tomato puree': { name: 'Extrato de tomate', category: 'Outros', unit: 'g' },
  'tomato paste': { name: 'Extrato de tomate', category: 'Outros', unit: 'g' },
  'olive oil': { name: 'Azeite de Oliva', category: 'Temperos', unit: 'ml' },
  'vegetable oil': { name: 'Azeite de Oliva', category: 'Temperos', unit: 'ml' },
  'water': { name: 'Água', category: 'Outros', unit: 'ml' },
  'red wine': { name: 'Vinho Tinto Seco', category: 'Temperos', unit: 'ml' },
  'white wine': { name: 'Vinho Branco Seco', category: 'Temperos', unit: 'ml' },

  'salt': { name: 'Sal', category: 'Temperos', unit: 'g' },
  'pepper': { name: 'Pimenta-do-reino', category: 'Temperos', unit: 'g' },
  'black pepper': { name: 'Pimenta-do-reino', category: 'Temperos', unit: 'g' },
  'oregano': { name: 'Orégano', category: 'Temperos', unit: 'g' },
  'parsley': { name: 'Salsa', category: 'Temperos', unit: 'g' },
  'rice': { name: 'Arroz', category: 'Grãos', unit: 'g' },
  'pasta': { name: 'Macarrão', category: 'Grãos', unit: 'g' },
  'spaghetti': { name: 'Macarrão', category: 'Grãos', unit: 'g' },
  'penne': { name: 'Macarrão', category: 'Grãos', unit: 'g' },
  'sugar': { name: 'Açúcar', category: 'Temperos', unit: 'g' },
  'flour': { name: 'Farinha', category: 'Grãos', unit: 'g' },
  'milk': { name: 'Leite', category: 'Laticínios', unit: 'ml' },
  'cheese': { name: 'Queijo', category: 'Laticínios', unit: 'g' },
  'cheddar': { name: 'Queijo', category: 'Laticínios', unit: 'g' },
  'parmesan': { name: 'Queijo', category: 'Laticínios', unit: 'g' },
  'allspice': { name: 'Pimenta-da-jamaica', category: 'Temperos', unit: 'g' },
  'bacon': { name: 'Bacon', category: 'Proteínas', unit: 'g' },
  'basil leaves': { name: 'Manjericão', category: 'Temperos', unit: 'g' },
  'black beans': { name: 'Feijão preto', category: 'Grãos', unit: 'g' },
  'bread': { name: 'Pão', category: 'Outros', unit: 'unidade' },
  'buns': { name: 'Pão de hambúrguer', category: 'Outros', unit: 'unidade' },
  'cabbage': { name: 'Repolho', category: 'Vegetais', unit: 'g' },
  'carrots': { name: 'Cenoura', category: 'Vegetais', unit: 'g' },
  'chorizo': { name: 'Chouriço', category: 'Proteínas', unit: 'g' },
  'cooked beetroot': { name: 'Beterraba cozida', category: 'Vegetais', unit: 'g' },
  'cornstarch': { name: 'Amido de milho', category: 'Grãos', unit: 'g' },
  'cumin': { name: 'Cominho', category: 'Temperos', unit: 'g' },
  'egg': { name: 'Ovo', category: 'Proteínas', unit: 'unidade' },
  'fettuccine': { name: 'Macarrão fettuccine', category: 'Grãos', unit: 'g' },
  'fried ripe bananas': { name: 'Banana-da-terra frita', category: 'Vegetais', unit: 'g' },
  'fromage frais': { name: 'Queijo fresco batido', category: 'Laticínios', unit: 'g' },
  'hotsauce': { name: 'Molho de pimenta', category: 'Temperos', unit: 'ml' },
  'king prawns': { name: 'Camarão-gigante', category: 'Proteínas', unit: 'g' },
  'lean minced steak': { name: 'Carne moída magra', category: 'Proteínas', unit: 'g' },
  'lemon juice': { name: 'Suco de limão', category: 'Temperos', unit: 'ml' },
  'lettuce': { name: 'Alface', category: 'Vegetais', unit: 'g' },
  'lime': { name: 'Limão', category: 'Temperos', unit: 'unidade' },
  'macaroni': { name: 'Macarrão caracol', category: 'Grãos', unit: 'g' },
  'mayonnaise': { name: 'Maionese', category: 'Outros', unit: 'g' },
  'morcilla': { name: 'Morcela', category: 'Proteínas', unit: 'g' },
  'mozzarella': { name: 'Muçarela', category: 'Laticínios', unit: 'g' },
  'mustard powder': { name: 'Mostarda em pó', category: 'Temperos', unit: 'g' },
  'naan bread': { name: 'Pão naan', category: 'Grãos', unit: 'unidade' },
  'nutmeg': { name: 'Noz-moscada', category: 'Temperos', unit: 'g' },
  'oil': { name: 'Óleo vegetal', category: 'Temperos', unit: 'ml' },
  'paprika': { name: 'Páprica', category: 'Temperos', unit: 'g' },
  'pickle juice': { name: 'Suco de picles', category: 'Outros', unit: 'ml' },
  'pico de gallo sauce': { name: 'Molho pico de gallo', category: 'Temperos', unit: 'g' },
  'red chilli': { name: 'Pimenta vermelha', category: 'Temperos', unit: 'g' },
  'rocket': { name: 'Rúcula', category: 'Vegetais', unit: 'g' },
  'sesame seed burger buns': { name: 'Pão de hambúrguer com gergelim', category: 'Grãos', unit: 'unidade' },
  'shredded meat': { name: 'Carne desfiada', category: 'Proteínas', unit: 'g' },
  'soy sauce': { name: 'Molho shoyu', category: 'Temperos', unit: 'ml' },
  'thyme': { name: 'Tomilho', category: 'Temperos', unit: 'g' },
};

const stats = {
  imported: 0,
  skippedDuplicate: 0,
  skippedGinger: 0,
  errors: 0,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMeasurement(measureStr: string, defaultUnit: string) {
  const clean = measureStr.toLowerCase().trim();

  const numMatch = clean.match(/^([0-9\/\.\s\-½⅓¼¾]+)/);
  if (!numMatch) return { amount: 1, unit: defaultUnit || 'unidade' };

  const amountStr = numMatch[1].trim();

  let amount = 1;
  try {
    if (amountStr.includes('½')) amount = 0.5;
    else if (amountStr.includes('⅓')) amount = 0.33;
    else if (amountStr.includes('¼')) amount = 0.25;
    else if (amountStr.includes('¾')) amount = 0.75;
    else if (amountStr.includes('/')) {
      const [num, den] = amountStr.split('/');
      amount = parseFloat(num) / parseFloat(den);
    } else {
      amount = parseFloat(amountStr);
    }
  } catch {
    amount = 1;
  }

  let unit = defaultUnit;
  if (clean.includes('g') && !clean.includes('clove') && !clean.includes('can')) unit = 'g';
  else if (clean.includes('ml') || clean.includes('l')) unit = 'ml';
  else if (clean.includes('tbsp') || clean.includes('tablespoon') || clean.includes('colher de sopa')) unit = 'colher de sopa';
  else if (clean.includes('tsp') || clean.includes('teaspoon') || clean.includes('colher de chá')) unit = 'colher de chá';
  else if (clean.includes('pinch') || clean.includes('pitada')) unit = 'pitada';
  else if (clean.includes('cup') || clean.includes('xícara')) {
    amount = amount * 200;
    unit = defaultUnit === 'ml' ? 'ml' : 'g';
  }

  if (isNaN(amount)) amount = 1;

  return { amount, unit };
}

function extractMealDbId(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(/TheMealDB ID:\s*(\d+)/);
  return match ? match[1] : null;
}

async function loadExistingImports(): Promise<{ mealIds: Set<string>; recipeNames: Set<string> }> {
  const rows = await db
    .select({ name: schema.recipes.name, description: schema.recipes.description })
    .from(schema.recipes)
    .where(or(like(schema.recipes.name, '%(Importada)%'), like(schema.recipes.description, `%${MEALDB_ID_PREFIX}%`)));

  const mealIds = new Set<string>();
  const recipeNames = new Set<string>();

  for (const row of rows) {
    recipeNames.add(row.name);
    const id = extractMealDbId(row.description);
    if (id) mealIds.add(id);
  }

  return { mealIds, recipeNames };
}

async function fetchAllCategories(): Promise<string[]> {
  const res = await fetch('https://www.themealdb.com/api/json/v1/1/categories.php');
  const data: any = await res.json();
  return (data.categories ?? []).map((c: { strCategory: string }) => c.strCategory);
}

async function fetchMealsByCategory(category: string): Promise<Array<{ idMeal: string; strMeal: string }>> {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`);
  const data: any = await res.json();
  return data.meals ?? [];
}

async function fetchMealDetail(idMeal: string): Promise<any | null> {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${idMeal}`);
  const data: any = await res.json();
  return data.meals?.[0] ?? null;
}

function mealContainsGinger(meal: any): boolean {
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    if (ing && ing.trim() !== '') {
      const ingClean = ing.toLowerCase().trim();
      if (ingClean.includes('ginger') || ingClean.includes('gengibre')) return true;
    }
  }

  const instructions = meal.strInstructions || '';
  return instructions.toLowerCase().includes('ginger') || instructions.toLowerCase().includes('gengibre');
}

function extractIngredients(meal: any) {
  const ingredientsList = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    const meas = meal[`strMeasure${i}`];
    if (ing && ing.trim() !== '') {
      ingredientsList.push({
        rawName: ing.toLowerCase().trim(),
        rawMeasure: meas || '',
      });
    }
  }
  return ingredientsList;
}

async function importMeal(meal: any, categories: string[]) {
  const idMeal = meal.idMeal as string;
  const name = meal.strMeal as string;
  const primaryCategory = categories[0] ?? meal.strCategory ?? 'Miscellaneous';

  const area = meal.strArea || 'International';
  const cuisine = await recipeService.getOrCreateCuisine(area);

  const tags = meal.strTags ? meal.strTags.split(',').map((t: string) => t.trim()) : [];
  for (const cat of categories) {
    if (!tags.includes(cat)) tags.push(cat);
  }

  const recipeNamePt = `${name} (Importada)`;
  const description = `${MEALDB_ID_PREFIX} ${idMeal}. Importado de TheMealDB. Categorias: ${categories.join(', ')}.`;
  const localRecipe = await recipeService.createRecipe(recipeNamePt, description, cuisine.name, tags);

  const ingredientsList = extractIngredients(meal);
  const recipeIngredientsInputs = [];

  for (const ing of ingredientsList) {
    let translated = translations[ing.rawName];
    if (!translated) {
      const key = Object.keys(translations).find((k) => ing.rawName.includes(k));
      if (key) translated = translations[key];
    }

    const finalName = translated ? translated.name : ing.rawName;
    const finalCategory = translated ? translated.category : 'Outros';
    const finalUnit = translated ? translated.unit : 'unidade';

    const dbIngredient = await recipeService.getOrCreateIngredient(finalName, finalCategory, finalUnit);
    const parsedMeas = parseMeasurement(ing.rawMeasure, finalUnit);

    recipeIngredientsInputs.push({
      ingredientId: dbIngredient.id,
      amount: parsedMeas.amount,
      unit: parsedMeas.unit,
      notes: ing.rawMeasure !== '' ? `Original: ${ing.rawMeasure}` : undefined,
    });
  }

  const instructions = meal.strInstructions || '';
  const instructionSteps = instructions
    .split('.')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 10);

  const techniquesInputs = [];
  let stepOrder = 1;

  const coreTechniques = [
    { keyword: 'fry', name: 'Refogar' },
    { keyword: 'saute', name: 'Refogar' },
    { keyword: 'sear', name: 'Selar' },
    { keyword: 'brown', name: 'Selar' },
    { keyword: 'deglaze', name: 'Deglaçar' },
    { keyword: 'simmer', name: 'Reduzir' },
    { keyword: 'boil', name: 'Reduzir' },
    { keyword: 'bake', name: 'Brasear' },
  ];

  for (const step of instructionSteps) {
    let matchedTech = null;
    for (const ct of coreTechniques) {
      if (step.toLowerCase().includes(ct.keyword)) {
        matchedTech = await recipeService.getOrCreateTechnique(ct.name);
        break;
      }
    }

    if (!matchedTech) {
      matchedTech = await recipeService.getOrCreateTechnique('Refogar');
    }

    techniquesInputs.push({
      techniqueId: matchedTech.id,
      stepOrder: stepOrder++,
      notes: step.substring(0, 500),
    });
  }

  await recipeService.createRecipeVersion(
    localRecipe.id,
    '1.0',
    'Importação Inicial',
    'Receita importada estruturada automaticamente.',
    4,
    true,
    35,
    'Easy',
    recipeIngredientsInputs,
    techniquesInputs
  );

  console.log(`✔ Importada: "${recipeNamePt}" [${primaryCategory}]`);
  stats.imported++;
}

async function importFromMealDB() {
  console.log('--- INICIANDO IMPORTAÇÃO COMPLETA DO THEMEALDB ---');

  const existing = await loadExistingImports();
  console.log(`Receitas já importadas: ${existing.recipeNames.size} (${existing.mealIds.size} com ID registrado)`);

  const categories = await fetchAllCategories();
  console.log(`Categorias encontradas: ${categories.length}`);

  const mealIndex = new Map<string, { idMeal: string; strMeal: string; categories: string[] }>();

  for (const cat of categories) {
    console.log(`\nListando categoria: ${cat}...`);
    try {
      const meals = await fetchMealsByCategory(cat);
      for (const meal of meals) {
        const current = mealIndex.get(meal.idMeal);
        if (current) {
          if (!current.categories.includes(cat)) current.categories.push(cat);
        } else {
          mealIndex.set(meal.idMeal, { ...meal, categories: [cat] });
        }
      }
      console.log(`  → ${meals.length} receitas`);
      await sleep(150);
    } catch (e: any) {
      console.error(`Erro ao listar categoria ${cat}:`, e.message);
    }
  }

  console.log(`\nTotal único no TheMealDB: ${mealIndex.size}`);
  const toProcess = [...mealIndex.values()].filter((m) => {
    const recipeNamePt = `${m.strMeal} (Importada)`;
    return !existing.mealIds.has(m.idMeal) && !existing.recipeNames.has(recipeNamePt);
  });

  console.log(`Novas receitas para importar: ${toProcess.length}`);
  console.log(`Duplicatas ignoradas: ${mealIndex.size - toProcess.length}\n`);

  let processed = 0;
  for (const summary of toProcess) {
    processed++;
    try {
      const meal = await fetchMealDetail(summary.idMeal);
      if (!meal) {
        console.warn(`[AVISO] Detalhe não encontrado para ID ${summary.idMeal}`);
        stats.errors++;
        continue;
      }

      if (mealContainsGinger(meal)) {
        console.log(`[Gengibre] Pulando "${meal.strMeal}"`);
        stats.skippedGinger++;
        await sleep(100);
        continue;
      }

      await importMeal(meal, summary.categories);
      existing.mealIds.add(summary.idMeal);
      existing.recipeNames.add(`${meal.strMeal} (Importada)`);
    } catch (e: any) {
      if (e.message?.includes('UNIQUE constraint failed') || e.message?.includes('unique')) {
        console.log(`[Duplicata] Pulando "${summary.strMeal}"`);
        stats.skippedDuplicate++;
      } else {
        console.error(`[ERRO] "${summary.strMeal}":`, e.message);
        stats.errors++;
      }
    }

    if (processed % 25 === 0) {
      console.log(`\n--- Progresso: ${processed}/${toProcess.length} ---\n`);
    }

    await sleep(120);
  }

  console.log('\n--- IMPORTAÇÃO CONCLUÍDA ---');
  console.log(`Importadas: ${stats.imported}`);
  console.log(`Puladas (duplicata): ${stats.skippedDuplicate}`);
  console.log(`Puladas (gengibre): ${stats.skippedGinger}`);
  console.log(`Erros: ${stats.errors}`);

  // After importing meals, push new records to Notion
  try {
    console.log('Iniciando sincronização com Notion...');
    const { syncNotionToSqlite } = await import('../notion/sync.js');
    const result = await syncNotionToSqlite();
    console.log('Sincronização Notion concluída:', result.status);
  } catch (e) {
    console.error('Erro ao sincronizar com Notion:', e);
  }
}

importFromMealDB().catch((err) => {
  console.error('Importação falhou:', err);
  process.exit(1);
});
