/**
 * db/client.ts — Database connection pool.
 *
 * Uses the pg (node-postgres) driver under Drizzle ORM.
 * The DATABASE_URL environment variable is set by docker-compose for local
 * dev and must be set in your deployment environment for production.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
