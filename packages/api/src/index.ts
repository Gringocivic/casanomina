/**
 * index.ts — Entry point. Runs DB migrations then starts the Fastify server.
 */
import { buildServer } from "./server.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT ?? "3001", 10);

async function main() {
  // Run pending migrations on every startup (idempotent — safe to run repeatedly).
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle(pool);
    const migrationsFolder = join(__dirname, "../drizzle");
    console.log("Running DB migrations…");
    await migrate(db, { migrationsFolder });
    console.log("Migrations complete.");
    await pool.end();
  }

  const fastify = await buildServer();
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`🌮 CasaNomina API running at http://localhost:${port}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
