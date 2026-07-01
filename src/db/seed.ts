import * as recipeService from '../services/recipe.js';
import { db } from './client.js';

async function seed() {
  console.log('Seeding KitchenOS database with user profile defaults...');

  // 1. Cuisines
  const cuisines = ['Brasileira', 'Italiana', 'Francesa', 'Tailandesa', 'Mexicana', 'Japonesa'];
  for (const c of cuisines) {
    await recipeService.getOrCreateCuisine(c);
  }
  console.log('✔ Cuisines seeded.');

  // 2. Favorite Proteins & Ingredients from User Profile
  const ingredients = [
    // Proteins
    { name: 'Coxão mole', category: 'Proteínas', unit: 'g' },
    { name: 'Acém', category: 'Proteínas', unit: 'g' },
    { name: 'Bisteca suína', category: 'Proteínas', unit: 'g' },
    { name: 'Linguiça', category: 'Proteínas', unit: 'g' },
    { name: 'Peito de frango', category: 'Proteínas', unit: 'g' },

    // Aromatics & Vegetables
    { name: 'Cebola', category: 'Vegetais', unit: 'g', flavorProfile: JSON.stringify({ sweet: 2, salty: 0, sour: 0, bitter: 0, umami: 1, heat: 0, fat: 0 }) },
    { name: 'Alho', category: 'Vegetais', unit: 'g', flavorProfile: JSON.stringify({ sweet: 1, salty: 0, sour: 0, bitter: 1, umami: 1, heat: 1, fat: 0 }) },
    { name: 'Pimentões', category: 'Vegetais', unit: 'g' },
    { name: 'Tomate', category: 'Vegetais', unit: 'g' },
    
    // Dairy & Sauces
    { name: 'Creme de leite', category: 'Laticínios', unit: 'g', flavorProfile: JSON.stringify({ sweet: 1, salty: 0, sour: 0, bitter: 0, umami: 0, heat: 0, fat: 5 }) },
    { name: 'Extrato de tomate', category: 'Outros', unit: 'g', flavorProfile: JSON.stringify({ sweet: 1, salty: 0, sour: 2, bitter: 0, umami: 3, heat: 0, fat: 0 }) },
    { name: 'Manteiga', category: 'Laticínios', unit: 'g' },

    // Spices
    { name: 'Pimenta-do-reino', category: 'Temperos', unit: 'g', flavorProfile: JSON.stringify({ sweet: 0, salty: 0, sour: 0, bitter: 0, umami: 0, heat: 3, fat: 0 }) },
    { name: 'Sal', category: 'Temperos', unit: 'g', flavorProfile: JSON.stringify({ sweet: 0, salty: 5, sour: 0, bitter: 0, umami: 0, heat: 0, fat: 0 }) },
    { name: 'Azeite de Oliva', category: 'Temperos', unit: 'ml' },
  ];

  for (const ing of ingredients) {
    await recipeService.getOrCreateIngredient(ing.name, ing.category, ing.unit, false, ing.flavorProfile);
  }
  console.log('✔ Ingredients seeded.');

  // 3. Core Techniques
  const techniques = [
    { name: 'Refogar', description: 'Cozinhar vegetais ou aromáticos em pouca gordura quente até ficarem translúcidos ou dourados.', difficulty: 'Easy', flavorImpact: 'Concentração de sabor doce e caramelização suave.' },
    { name: 'Selar', description: 'Dourar a superfície de proteínas em fogo alto para criar uma crosta de sabor via Reação de Maillard.', difficulty: 'Easy', flavorImpact: 'Criação de notas tostadas profundas (Umami).' },
    { name: 'Brasear', description: 'Selar a carne e cozinhar lentamente em líquido em panela tampada.', difficulty: 'Medium', flavorImpact: 'Amaciamento de fibras colágenas e fusão de sabores no molho.' },
    { name: 'Deglaçar', description: 'Adicionar líquido (vinho, caldo, água) a uma panela quente onde carnes foram seladas para dissolver os resíduos caramelizados do fundo.', difficulty: 'Easy', flavorImpact: 'Recuperação de sabor Umami e adição de acidez equilibrada.' },
    { name: 'Reduzir', description: 'Cozinhar um molho ou caldo em fogo brando para evaporar a água e concentrar os sabores.', difficulty: 'Easy', flavorImpact: 'Intensificação de sal e acidez, engrossando a textura.' },
    { name: 'Grelhar', description: 'Cozinhar o alimento sob calor direto em grelha ou chapa quente.', difficulty: 'Easy', flavorImpact: 'Notas defumadas e crocância superficial.' }
  ];

  for (const t of techniques) {
    await recipeService.getOrCreateTechnique(t.name, t.description, t.difficulty, t.flavorImpact);
  }
  console.log('✔ Techniques seeded.');
  console.log('Seeding completed successfully!');
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
