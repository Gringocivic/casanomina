/**
 * routes/config.ts
 *
 * GET  /api/config/current  — returns the currently active RatesConfig (public)
 * GET  /api/config/history  — all configs with effective dates (public)
 * POST /api/config          — (admin only) create a new config version
 *
 * Admin routes require:  Authorization: Bearer <ADMIN_API_KEY>
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { rateConfigs } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../lib/auth-guard.js";

// ── Zod schema for the config_data payload ────────────────────────────────────
// Validates the critical fields that every calculation depends on.
// Uses .passthrough() so new/country-specific fields are accepted without error.
const ImssBranchRateSchema = z.object({
  employer_pct: z.number().nonnegative(),
  worker_pct:   z.number().nonnegative(),
}).passthrough();

const RatesConfigSchema = z.object({
  year:                             z.number().int().min(2020).max(2100),
  currency:                         z.string().min(1),
  minimum_daily_wage_general:       z.number().positive(),
  minimum_daily_wage_northern_border: z.number().positive(),
  uma_daily_value:                  z.number().positive(),
  sbc_integration_factor:           z.number().positive(),
  imss_rates: z.object({
    enfermedad_maternidad: z.object({
      cuota_fija_employer_pct_of_uma:        z.number().nonnegative(),
      excedente_three_uma_employer_pct:      z.number().nonnegative(),
      excedente_three_uma_worker_pct:        z.number().nonnegative(),
      prestaciones_dinero_employer_pct:      z.number().nonnegative(),
      prestaciones_dinero_worker_pct:        z.number().nonnegative(),
      gastos_medicos_pensionados_employer_pct: z.number().nonnegative(),
      gastos_medicos_pensionados_worker_pct: z.number().nonnegative(),
    }).passthrough(),
    invalidez_vida:                    ImssBranchRateSchema,
    retiro:                            ImssBranchRateSchema,
    cesantia_vejez:                    ImssBranchRateSchema,
    guarderias_prestaciones_sociales:  ImssBranchRateSchema,
    riesgos_trabajo:                   ImssBranchRateSchema,
  }).passthrough(),
  infonavit_employer_pct:           z.number().nonnegative(),
  vacation_accrual_table: z.array(z.object({
    year_of_service: z.number().int().positive(),
    days:            z.number().int().positive(),
  })).min(1),
  vacation_accrual_rule: z.object({
    extrapolation_step_years: z.number().int().positive(),
    extrapolation_step_days:  z.number().int().positive(),
    table_max_year:           z.number().int().positive(),
  }),
  aguinaldo_minimum_days:                    z.number().positive(),
  prima_vacacional_minimum_pct:              z.number().nonnegative(),
  liquidacion_constitutional_indemnity_months: z.number().positive(),
  liquidacion_seniority_premium_days_per_year: z.number().positive(),
  seniority_premium_cap_multiplier_of_min_wage: z.number().positive(),
  seniority_premium_days_per_year:           z.number().positive(),
}).passthrough();

// ── Route plugin ──────────────────────────────────────────────────────────────
const plugin: FastifyPluginAsync = async (fastify) => {

  // GET /api/config/current — public, read-only
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

  // GET /api/config/history — public, read-only
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

  // POST /api/config — admin only
  const CreateConfigSchema = z.object({
    config_key:     z.string().min(3).max(100),
    year:           z.number().int().min(2020).max(2100),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    config_data:    RatesConfigSchema,
    make_active:    z.boolean().default(false),
  });

  fastify.post("/", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const parsed = CreateConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid config", issues: parsed.error.issues });
    }
    const body = parsed.data;

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
