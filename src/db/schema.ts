import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const cuisines = sqliteTable('cuisines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  notionPageId: text('notion_page_id'),
});

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  cuisineId: integer('cuisine_id').references(() => cuisines.id),
  currentVersionId: integer('current_version_id'), // Reference to the active recipe_versions.id
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false).notNull(),
  history: text('history'),
  objective: text('objective'),
  preferredEquipment: text('preferred_equipment'),
  preferredVersionId: integer('preferred_version_id'),
  preferenceReason: text('preference_reason'),
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const recipeVersions = sqliteTable('recipe_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }).notNull(),
  versionNumber: text('version_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  yieldPortions: integer('yield_portions').default(2).notNull(),
  isFreezerFriendly: integer('is_freezer_friendly', { mode: 'boolean' }).default(true).notNull(),
  estimatedTimeMinutes: integer('estimated_time_minutes'),
  difficulty: text('difficulty').default('Easy').notNull(), // 'Easy', 'Medium', 'Hard'
  calories: integer('calories'),
  proteinGrams: real('protein_grams'),
  carbsGrams: real('carbs_grams'),
  fatGrams: real('fat_grams'),
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const ingredients = sqliteTable('ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  category: text('category').notNull(), // e.g., 'Proteínas', 'Vegetais', 'Temperos', 'Laticínios'
  defaultUnit: text('default_unit').default('g').notNull(),
  shelfLifeDays: integer('shelf_life_days'),
  isFreezerFriendly: integer('is_freezer_friendly', { mode: 'boolean' }).default(true).notNull(),
  avoidsGinger: integer('avoids_ginger', { mode: 'boolean' }).default(false).notNull(),
  flavorProfile: text('flavor_profile'), // JSON string: { sweet: number, salty: number, sour: number, bitter: number, umami: number, heat: number, fat: number }
  pricePerUnit: real('price_per_unit'),
  priceUnit: text('price_unit').default('R$').notNull(),
  notionPageId: text('notion_page_id'),
});

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  ingredientId: integer('ingredient_id').references(() => ingredients.id).notNull(),
  amount: real('amount').notNull(),
  unit: text('unit').notNull(),
  notes: text('notes'),
  isOptional: integer('is_optional', { mode: 'boolean' }).default(false).notNull(),
  notionPageId: text('notion_page_id'),
});

export const techniques = sqliteTable('techniques', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  difficulty: text('difficulty').default('Easy').notNull(), // 'Easy', 'Medium', 'Hard'
  flavorImpact: text('flavor_impact'), // JSON string: description of taste impact
  masteryLevel: integer('mastery_level').default(1).notNull(),
  notionPageId: text('notion_page_id'),
});

export const recipeTechniques = sqliteTable('recipe_techniques', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  techniqueId: integer('technique_id').references(() => techniques.id).notNull(),
  stepOrder: integer('step_order').notNull(),
  notes: text('notes'),
  notionPageId: text('notion_page_id'),
});

export const experiments = sqliteTable('experiments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  cookedAt: text('cooked_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  servingsCooked: integer('servings_cooked').default(2).notNull(),
  proteinWeightGrams: real('protein_weight_grams').default(300.0).notNull(),
  rating: integer('rating').notNull(), // 1 to 5 stars
  outcomeNotes: text('outcome_notes').notNull(),
  deltaNotes: text('delta_notes'), // what the user changed during cooking this time
  nextVersionSuggestions: text('next_version_suggestions'), // suggestions generated by AI
  notionPageId: text('notion_page_id'),
});

export const inventories = sqliteTable('inventories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ingredientId: integer('ingredient_id').references(() => ingredients.id, { onDelete: 'cascade' }).notNull().unique(),
  amount: real('amount').notNull(),
  unit: text('unit').notNull(),
  location: text('location').notNull(), // 'Pantry', 'Fridge', 'Freezer'
  expirationDate: text('expiration_date'),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  notionPageId: text('notion_page_id'),
});

export const shoppingLists = sqliteTable('shopping_lists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ingredientId: integer('ingredient_id').references(() => ingredients.id, { onDelete: 'cascade' }).notNull(),
  amountNeeded: real('amount_needed').notNull(),
  unit: text('unit').notNull(),
  isPurchased: integer('is_purchased', { mode: 'boolean' }).default(false).notNull(),
  addedByMealPlanId: integer('added_by_meal_plan_id'),
  notionPageId: text('notion_page_id'),
});

export const mealPlans = sqliteTable('meal_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // 'YYYY-MM-DD'
  mealType: text('meal_type').notNull(), // 'Lunch', 'Dinner', 'MealPrep'
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  servings: integer('servings').default(2).notNull(),
  isCooked: integer('is_cooked', { mode: 'boolean' }).default(false).notNull(),
  notionPageId: text('notion_page_id'),
});

export const cookingSessions = sqliteTable('cooking_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  durationMinutes: integer('duration_minutes'),
  location: text('location'),
  mood: text('mood'),
  chef: text('chef'),
  participants: text('participants'),
  overallRating: real('overall_rating'),
  learnings: text('learnings'),
  errors: text('errors'),
  successes: text('successes'),
  neverAgain: text('never_again'),
  whyWorked: text('why_worked'),
  nextAttemptSuggestions: text('next_attempt_suggestions'),
  generalNotes: text('general_notes'),
  equipmentUsed: text('equipment_used'),
  notionPageId: text('notion_page_id'),
});

export const cookingSessionRecipes = sqliteTable('cooking_session_recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cookingSessionId: integer('cooking_session_id').references(() => cookingSessions.id, { onDelete: 'cascade' }).notNull(),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  notionPageId: text('notion_page_id'),
});

export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cookingSessionId: integer('cooking_session_id').references(() => cookingSessions.id, { onDelete: 'cascade' }).notNull(),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  reviewerName: text('reviewer_name').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  wouldEatAgain: integer('would_eat_again', { mode: 'boolean' }).default(true).notNull(),
  suggestedChanges: text('suggested_changes'),
  notionPageId: text('notion_page_id'),
});

export const priceHistories = sqliteTable('price_histories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ingredientId: integer('ingredient_id').references(() => ingredients.id, { onDelete: 'cascade' }).notNull(),
  pricePerUnit: real('price_per_unit').notNull(),
  priceUnit: text('price_unit').default('R$').notNull(),
  recordedAt: text('recorded_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'set null' }),
  experimentId: integer('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),
  cookingSessionId: integer('cooking_session_id').references(() => cookingSessions.id, { onDelete: 'set null' }),
  caption: text('caption'),
  notes: text('notes'),
  localPath: text('local_path'),
  notionUrl: text('notion_url'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const recipeTags = sqliteTable('recipe_tags', {
  recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }).notNull(),
  tagId: integer('tag_id').references(() => tags.id, { onDelete: 'cascade' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.recipeId, t.tagId] })
}));

export const objectives = sqliteTable('objectives', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('Active').notNull(), // 'Active', 'Completed', 'Paused'
  targetCount: integer('target_count').default(0).notNull(),
  currentCount: integer('current_count').default(0).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  notionPageId: text('notion_page_id'),
});

export const missions = sqliteTable('missions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  objectiveId: integer('objective_id').references(() => objectives.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  techniqueId: integer('technique_id').references(() => techniques.id).notNull(),
  status: text('status').default('Active').notNull(), // 'Active', 'Completed'
  completedAt: text('completed_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  notionPageId: text('notion_page_id'),
});

export const healthGoals = sqliteTable('health_goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  goalType: text('goal_type').default('Maintenance').notNull(), // 'WeightLoss', 'WeightGain', 'Maintenance', 'Hypertrophy'
  targetWeightKg: real('target_weight_kg'),
  targetCalories: integer('target_calories'),
  targetProtein: integer('target_protein'),
  targetCarbs: integer('target_carbs'),
  targetFat: integer('target_fat'),
  targetWaterMl: integer('target_water_ml').default(2000).notNull(),
  status: text('status').default('Active').notNull(), // 'Active', 'Achieved', 'Paused'
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const nutritionLogs = sqliteTable('nutrition_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  calories: integer('calories').default(0).notNull(),
  protein: integer('protein').default(0).notNull(),
  carbs: integer('carbs').default(0).notNull(),
  fat: integer('fat').default(0).notNull(),
  waterIntakeMl: integer('water_intake_ml').default(0).notNull(),
  weightKg: real('weight_kg'),
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const userEquipments = sqliteTable('user_equipments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isAvailable: integer('is_available', { mode: 'boolean' }).default(true).notNull(),
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const recipeAdaptations = sqliteTable('recipe_adaptations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cookingSessionId: integer('cooking_session_id').references(() => cookingSessions.id, { onDelete: 'set null' }),
  recipeVersionId: integer('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'cascade' }).notNull(),
  sourceEquipment: text('source_equipment').notNull(),
  targetEquipment: text('target_equipment').notNull(),
  adaptationsApplied: text('adaptations_applied').notNull(), // JSON string representing adaptation steps
  confidence: real('confidence').notNull(),
  feedbackRating: text('feedback_rating'), // 'Excelente', 'Boa', 'Regular', 'Ruim'
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
