/**
 * routes/calculate.ts
 *
 * Stateless calculator endpoints — useful for the Calculators screen in
 * the UI. Returns results without saving to the database.
 *
 * POST /api/calculate/sbc
 * POST /api/calculate/imss
 * POST /api/calculate/finiquito
 * POST /api/calculate/liquidacion
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { rateConfigs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  calculateSBC, calculateIMSSContributions, calculateINFONAVIT,
  calculateFiniquito, calculateLiquidacion,
} from "@casanomina/calculator";
import type { RatesConfig, WorkerRecord } from "@casanomina/calculator";

const plugin: FastifyPluginAsync = async (fastify) => {
  async function getActiveConfig() {
    const [config] = await db.select().from(rateConfigs).where(eq(rateConfigs.is_active, true));
    return config?.config_data as RatesConfig | undefined;
  }

  fastify.post("/sbc", async (req, reply) => {
    const { daily_salary } = z.object({ daily_salary: z.number().positive() }).parse(req.body);
    const config = await getActiveConfig();
    if (!config) return reply.status(500).send({ error: "No active config" });
    const sbc = calculateSBC(daily_salary, config);
    return { daily_salary, sbc, integration_factor: config.sbc_integration_factor };
  });

  fastify.post("/imss", async (req, reply) => {
    const { daily_salary } = z.object({ daily_salary: z.number().positive() }).parse(req.body);
    const config = await getActiveConfig();
    if (!config) return reply.status(500).send({ error: "No active config" });
    const sbc = calculateSBC(daily_salary, config);
    const imss = calculateIMSSContributions(sbc, config);
    const infonavit = calculateINFONAVIT(sbc, config);
    return { daily_salary, sbc, imss, infonavit_employer: infonavit };
  });

  const TerminationSchema = z.object({
    worker_id:        z.string().uuid().optional(),
    daily_salary:     z.number().positive(),
    start_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    termination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    wage_zone:        z.enum(["general", "northern_border"]).default("general"),
  });

  fastify.post("/finiquito", async (req, reply) => {
    const body = TerminationSchema.parse(req.body);
    const config = await getActiveConfig();
    if (!config) return reply.status(500).send({ error: "No active config" });

    const worker: WorkerRecord = {
      id: body.worker_id ?? "estimate",
      full_name: "Estimate",
      start_date: body.start_date,
      daily_salary: body.daily_salary,
      wage_zone: body.wage_zone,
    };

    return calculateFiniquito(worker, new Date(body.termination_date), config);
  });

  fastify.post("/liquidacion", async (req, reply) => {
    const body = TerminationSchema.parse(req.body);
    const config = await getActiveConfig();
    if (!config) return reply.status(500).send({ error: "No active config" });

    const worker: WorkerRecord = {
      id: body.worker_id ?? "estimate",
      full_name: "Estimate",
      start_date: body.start_date,
      daily_salary: body.daily_salary,
      wage_zone: body.wage_zone,
    };

    return calculateLiquidacion(worker, new Date(body.termination_date), config);
  });
};

export default plugin;
