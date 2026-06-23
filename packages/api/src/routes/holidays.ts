/**
 * routes/holidays.ts
 *
 * GET /api/holidays/:year — returns official mandatory holidays for a year
 * from the rate config for that year (so the source is always the same
 * versioned config, not a separate hardcoded list).
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { rateConfigs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { RatesConfig } from "@casanomina/calculator";

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { year: string } }>("/:year", async (req, reply) => {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) return reply.status(400).send({ error: "Invalid year" });

    const [config] = await db.select().from(rateConfigs).where(eq(rateConfigs.year, year));
    if (!config) return reply.status(404).send({ error: `No config found for year ${year}` });

    const data = config.config_data as RatesConfig;
    const holidays = data.mandatory_holidays_2026 ?? data.mandatory_holidays_2025 ?? [];

    return { year, holidays };
  });
};

export default plugin;
