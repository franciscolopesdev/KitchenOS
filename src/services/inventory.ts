import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and, sql, isNotNull, lte } from 'drizzle-orm';

/**
 * Manage inventory: Add, update or subtract stock
 */
export async function manageInventory(
  ingredientId: number,
  amount: number,
  unit: string,
  location: 'Pantry' | 'Fridge' | 'Freezer',
  expirationDate?: string
) {
  const existing = await db.query.inventories.findFirst({
    where: eq(schema.inventories.ingredientId, ingredientId),
  });

  if (existing) {
    const newAmount = Math.max(0, existing.amount + amount);
    if (newAmount === 0) {
      await db.delete(schema.inventories).where(eq(schema.inventories.id, existing.id));
      return { action: 'deleted', amount: 0 };
    } else {
      const [updated] = await db
        .update(schema.inventories)
        .set({
          amount: newAmount,
          unit,
          location,
          expirationDate: expirationDate ?? existing.expirationDate,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(schema.inventories.id, existing.id))
        .returning();
      return { action: 'updated', data: updated };
    }
  } else {
    // If amount is negative, don't create a negative inventory record
    if (amount <= 0) {
      return { action: 'ignored', amount: 0 };
    }

    const [inserted] = await db
      .insert(schema.inventories)
      .values({
        ingredientId,
        amount,
        unit,
        location,
        expirationDate,
      })
      .returning();
    return { action: 'inserted', data: inserted };
  }
}

/**
 * Get full stock list, optionally filtered by location
 */
export async function getInventoryList(location?: 'Pantry' | 'Fridge' | 'Freezer') {
  const query = db
    .select({
      id: schema.inventories.id,
      ingredientId: schema.ingredients.id,
      name: schema.ingredients.name,
      category: schema.ingredients.category,
      amount: schema.inventories.amount,
      unit: schema.inventories.unit,
      location: schema.inventories.location,
      expirationDate: schema.inventories.expirationDate,
      updatedAt: schema.inventories.updatedAt,
    })
    .from(schema.inventories)
    .innerJoin(schema.ingredients, eq(schema.inventories.ingredientId, schema.ingredients.id));

  if (location) {
    return await query.where(eq(schema.inventories.location, location));
  }
  return await query;
}

/**
 * Add items directly to the shopping list
 */
export async function addToShoppingList(ingredientId: number, amountNeeded: number, unit: string, addedByMealPlanId?: number) {
  const existing = await db.query.shoppingLists.findFirst({
    where: and(
      eq(schema.shoppingLists.ingredientId, ingredientId),
      eq(schema.shoppingLists.isPurchased, false)
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(schema.shoppingLists)
      .set({
        amountNeeded: existing.amountNeeded + amountNeeded,
        unit,
      })
      .where(eq(schema.shoppingLists.id, existing.id))
      .returning();
    return updated;
  } else {
    const [inserted] = await db
      .insert(schema.shoppingLists)
      .values({
        ingredientId,
        amountNeeded,
        unit,
        addedByMealPlanId,
        isPurchased: false,
      })
      .returning();
    return inserted;
  }
}

/**
 * Get active shopping list
 */
export async function getShoppingList() {
  return await db
    .select({
      id: schema.shoppingLists.id,
      ingredientId: schema.ingredients.id,
      name: schema.ingredients.name,
      category: schema.ingredients.category,
      amountNeeded: schema.shoppingLists.amountNeeded,
      unit: schema.shoppingLists.unit,
      isPurchased: schema.shoppingLists.isPurchased,
    })
    .from(schema.shoppingLists)
    .innerJoin(schema.ingredients, eq(schema.shoppingLists.ingredientId, schema.ingredients.id))
    .where(eq(schema.shoppingLists.isPurchased, false));
}

/**
 * Mark item as purchased, automatically routing it to the appropriate inventory section based on the ingredient category
 */
export async function purchaseShoppingListItem(itemId: number) {
  const item = await db.query.shoppingLists.findFirst({
    where: eq(schema.shoppingLists.id, itemId),
  });

  if (!item) throw new Error('Shopping list item not found.');

  // Update purchased flag
  await db
    .update(schema.shoppingLists)
    .set({ isPurchased: true })
    .where(eq(schema.shoppingLists.id, itemId));

  // Resolve ingredient category to determine inventory location
  const ingredient = await db.query.ingredients.findFirst({
    where: eq(schema.ingredients.id, item.ingredientId),
  });

  if (!ingredient) throw new Error('Associated ingredient not found.');

  let location: 'Pantry' | 'Fridge' | 'Freezer' = 'Pantry';

  switch (ingredient.category) {
    case 'Proteínas':
      location = 'Freezer';
      break;
    case 'Vegetais':
    case 'Laticínios':
      location = 'Fridge';
      break;
    default:
      location = 'Pantry';
  }

  // Add to inventory
  const inventoryResult = await manageInventory(
    item.ingredientId,
    item.amountNeeded,
    item.unit,
    location
  );

  return {
    shoppingListItemId: itemId,
    ingredientName: ingredient.name,
    amount: item.amountNeeded,
    unit: item.unit,
    inventoryLocation: location,
    inventoryResult,
  };
}

/**
 * Deplete ingredients in inventory based on a cooked recipe version
 */
export async function autoDepleteInventory(recipeVersionId: number, portionsCooked: number) {
  const rIngredients = await db
    .select({
      ingredientId: schema.recipeIngredients.ingredientId,
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      name: schema.ingredients.name,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeVersionId, recipeVersionId));

  const version = await db.query.recipeVersions.findFirst({
    where: eq(schema.recipeVersions.id, recipeVersionId),
  });

  if (!version) throw new Error('Recipe version not found.');

  const scaleFactor = portionsCooked / version.yieldPortions;
  const depletionResults = [];

  for (const ing of rIngredients) {
    const amountToDeplete = ing.amount * scaleFactor;
    // We only deplete numerical ingredients (e.g. g, ml, units), ignoring qualitative units like "pinch"
    const isQualitative = ['pinch', 'to taste', 'pitada', 'a gosto'].some(u => ing.unit.toLowerCase().includes(u));
    
    if (!isQualitative) {
      // Manage inventory with negative amount
      const result = await manageInventory(
        ing.ingredientId,
        -amountToDeplete,
        ing.unit,
        'Pantry' // fallback location, if it exists it will maintain the same location anyway
      );
      depletionResults.push({
        ingredientName: ing.name,
        amountDepleted: amountToDeplete,
        unit: ing.unit,
        action: result.action,
      });
    }
  }

  return depletionResults;
}

/**
 * Retrieve items in inventory that are close to their expiration date
 */
export async function getExpirationAlerts(daysThreshold = 3) {
  const today = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(today.getDate() + daysThreshold);

  const thresholdStr = thresholdDate.toISOString().split('T')[0];

  return await db
    .select({
      id: schema.inventories.id,
      ingredientName: schema.ingredients.name,
      amount: schema.inventories.amount,
      unit: schema.inventories.unit,
      location: schema.inventories.location,
      expirationDate: schema.inventories.expirationDate,
    })
    .from(schema.inventories)
    .innerJoin(schema.ingredients, eq(schema.inventories.ingredientId, schema.ingredients.id))
    .where(
      and(
        isNotNull(schema.inventories.expirationDate),
        lte(schema.inventories.expirationDate, thresholdStr)
      )
    )
    .orderBy(schema.inventories.expirationDate);
}

/**
 * Clears/removes all unpurchased items from the shopping list in both SQLite and Notion.
 */
export async function clearShoppingList() {
  const activeItems = await db
    .select({
      id: schema.shoppingLists.id,
      notionPageId: schema.shoppingLists.notionPageId,
    })
    .from(schema.shoppingLists)
    .where(eq(schema.shoppingLists.isPurchased, false));

  // 1. Delete from Notion if synced
  for (const item of activeItems) {
    if (item.notionPageId) {
      try {
        const { notion } = await import('../notion/client.js');
        await notion.pages.update({
          page_id: item.notionPageId,
          archived: true,
        });
      } catch (e: any) {
        console.error(`[Notion] Failed to archive shopping item page ${item.notionPageId}:`, e.message);
      }
    }
  }

  // 2. Delete from SQLite
  await db
    .delete(schema.shoppingLists)
    .where(eq(schema.shoppingLists.isPurchased, false));

  console.log(`[Inventory Service] Cleared ${activeItems.length} active items from shopping list.`);
  return { clearedCount: activeItems.length };
}
