import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_FILE_NAME || 'kitchen_os.db';
const sqlite = new Database(dbPath);

// Crucial: Enable foreign key constraints in SQLite
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
