import 'dotenv/config';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { env } from '#/config/env.ts';
import * as schema from './schema.ts';

export const sqlite = new Database(env.DB_FILE_NAME);
export const db = drizzle({ client: sqlite, schema });
