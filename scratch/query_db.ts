import { db } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';

async function main() {
  console.log("=== Recipe Adaptations ===");
  const adaptations = await db.select().from(schema.recipeAdaptations);
  console.log(JSON.stringify(adaptations, null, 2));
}

main().catch(console.error);
