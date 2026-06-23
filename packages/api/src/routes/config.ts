/**
 * routes/config.ts
 *
 * GET  /api/config/current  — returns the currently active RatesConfig
 * GET  /api/config/history  — all configs with effective dates
 * POST /api/config          — (admin) create a new config version
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { rateConfigs } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const plugin: FastifyPluginAsync = async (fastify) => {

  // GET /api/config/current
  fastify.get("/current", async (_req, reply) => {
    const [config] = await db
      .select()
      .from(rateConfigs)
      .where(eq(rateConfigs.is_active, true))
      .limit(1);

    if (!config) {
      return reply.status(404).send({ error: "No active configuration found. Run db:seed first." });
    }
    return config;
  });

  // GET /api/config/history
  fastify.get("/history", async () => {
    return db
      .select({
        id:             rateConfigs.id,
        config_key:     rateConfigs.config_key,
        year:           rateConfigs.year,
        effective_date: rateConfigs.effective_date,
        is_active:      rateConfigs.is_active,
        created_at:     rateConfigs.created_at,
      })
      .from(rateConfigs)
      .orderBy(desc(rateConfigs.year));
  });

  // POST /api/config  (admin only — add preHandler: [fastify.authenticate] in prod)
  const CreateConfigSchema = z.object({
    config_key:     z.string().min(3).max(100),
    year:           z.number().int().min(2020).max(2100),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    config_data:    z.record(z.unknown()),
    make_active:    z.boolean().default(false),
  });

  fastify.post("/", async (req, reply) => {
    const body = CreateConfigSchema.parse(req.body);

    // If we're activating the new config, deactivate the current one first.
    if (body.make_active) {
      await db
        .update(rateConfigs)
        .set({ is_active: false })
        .where(eq(rateConfigs.is_active, true));
    }

    const [created] = await db
      .insert(rateConfigs)
      .values({
        config_key:     body.config_key,
        year:           body.year,
        effective_date: body.effective_date,
        config_data:    body.config_data,
        is_active:      body.make_active,
      })
      .returning();

    return reply.status(201).send(created);
  });
};

export default plugin;
