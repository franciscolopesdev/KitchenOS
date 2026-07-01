import { db } from './client.js';
import * as schema from './schema.js';
import { eq } from 'drizzle-orm';

const defaultEquipments = [
  'Fogão',
  'Air Fryer',
  'Panela de Pressão',
  'Panela Inox',
  'Panela de Ferro',
  'Panela Antiaderente',
  'Liquidificador',
  'Mixer',
  'Processador'
];

async function seed() {
  console.log('Seeding user equipments...');
  for (const name of defaultEquipments) {
    const existing = await db.query.userEquipments.findFirst({
      where: eq(schema.userEquipments.name, name)
    });

    if (!existing) {
      await db.insert(schema.userEquipments).values({
        name,
        isAvailable: true
      });
      console.log(`✔ Seeded equipment: ${name}`);
    } else {
      console.log(`- Equipment already exists: ${name}`);
    }
  }
  console.log('Seeding user equipments completed successfully!');
}

seed().catch(err => {
  console.error('Error seeding equipments:', err);
  process.exit(1);
});
