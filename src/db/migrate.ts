import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running migrations...');

try {
  migrate(db, { migrationsFolder: path.join(__dirname, '../../migrations') });
  console.log('Migrations completed successfully!');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
