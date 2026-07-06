/**
 * routes/workers.ts
 *
 * Full CRUD for workers, scoped to the authenticated employer.
 *
 * GET    /api/workers/cards    — workers with YTD aggregates + last run (for the cards UI)
 * GET    /api/workers          — list all workers for the employer
 * GET    /api/workers/:id      — get one worker
 * POST   /api/workers          — create a new worker record
 * PATCH  /api/workers/:id      — update worker details
 * DELETE /api/workers/:id      — soft-delete (sets end_date, keeps records)
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { workers, employers, payrollRuns, contracts } from "../db/schema.js";
import { eq, and, inArray, gte, lte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireEmployer } from "../lib/auth-guard.js";
import { sendInviteEmail } from "../services/emailService.js";

const WorkerSchema = z.object({
  full_name:          z.string().min(1),
  start_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daily_salary:       z.union([z.string(), z.number()]).transform(String),
  wage_zone:          z.enum(["general", "northern_border"]).default("general"),
  pay_frequency:      z.enum(["daily", "weekly", "biweekly", "semi-monthly", "monthly"]).default("weekly"),
  days_per_week:      z.number().int().min(1).max(7).default(6),
  role:               z.string().optional().nullable(),
  curp:               z.string().optional().nullable(),
  employment_status:  z.enum(["proposed", "active"]).default("active"),
  is_imss_registered: z.boolean().default(false),
  imss_nss:           z.string().optional().nullable(),
  live_in:            z.boolean().default(false),
  payroll_day:        z.number().int().min(0).max(31).optional().nullable(),
});

const plugin: FastifyPluginAsync = async (fastify) => {

  // GET /api/workers/cards — workers + YTD aggregates + last payroll run + contract flag.
  // Used by the workers list UI to populate the rich worker cards.
  // Must be registered BEFORE /:id so Fastify doesn't treat "cards" as a UUID param.
  fastify.get("/cards", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;

    const allWorkers = await db
      .select()
      .from(workers)
      .where(eq(workers.employer_id, employerId));

    if (allWorkers.length === 0) return reply.send([]);

    const ids = allWorkers.map((w) => w.id);
    const year      = new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    // YTD aggregates (current calendar year, any status)
    const ytdRows = await db
      .select({
        worker_id:         payrollRuns.worker_id,
        ytd_gross:         sql<string>`cast(sum(${payrollRuns.gross_wages}) as text)`,
        ytd_isr:           sql<string>`cast(sum(${payrollRuns.isr_withholding}) as text)`,
        ytd_employer_cost: sql<string>`cast(sum(${payrollRuns.employer_total_cost}) as text)`,
        ytd_net_pay:       sql<string>`cast(sum(${payrollRuns.net_pay}) as text)`,
        ytd_days_worked:   sql<number>`cast(sum(${payrollRuns.days_worked}) as integer)`,
        run_count:         sql<number>`cast(count(*) as integer)`,
      })
      .from(payrollRuns)
      .where(
        and(
          inArray(payrollRuns.worker_id, ids),
          gte(payrollRuns.period_start, yearStart),
          lte(payrollRuns.period_end, yearEnd),
        )
      )
      .groupBy(payrollRuns.worker_id);

    // Current-month ISR per worker
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split("T")[0];

    const monthIsrRows = await db
      .select({
        worker_id:          payrollRuns.worker_id,
        current_month_isr:  sql<string>`cast(sum(${payrollRuns.isr_withholding}) as text)`,
      })
      .from(payrollRuns)
      .where(
        and(
          inArray(payrollRuns.worker_id, ids),
          gte(payrollRuns.period_start, monthStart),
          lte(payrollRuns.period_end, monthEnd),
        )
      )
      .groupBy(payrollRuns.worker_id);

    const monthIsrMap = new Map(monthIsrRows.map((r) => [r.worker_id, parseFloat(r.current_month_isr ?? "0")]));

    // Most recent payroll run per worker (any time, not just this year)
    const allRuns = await db
      .select({
        worker_id:  payrollRuns.worker_id,
        period_end: payrollRuns.period_end,
        net_pay:    payrollRuns.net_pay,
        status:     payrollRuns.status,
      })
      .from(payrollRuns)
      .where(inArray(payrollRuns.worker_id, ids))
      .orderBy(desc(payrollRuns.period_end));

    // Pick first (most recent) per worker
    const lastRunMap = new Map<string, (typeof allRuns)[number]>();
    for (const run of allRuns) {
      if (!lastRunMap.has(run.worker_id)) lastRunMap.set(run.worker_id, run);
    }

    // Contract existence
    const contractRows = await db
      .select({ worker_id: contracts.worker_id })
      .from(contracts)
      .where(inArray(contracts.worker_id, ids));
    const contractSet = new Set(contractRows.map((c) => c.worker_id));

    const ytdMap = new Map(ytdRows.map((r) => [r.worker_id, r]));

    return reply.send(
      allWorkers.map((w) => ({
        ...w,
        has_contract: contractSet.has(w.id),
        last_run:     lastRunMap.get(w.id) ?? null,
        ytd:          ytdMap.get(w.id) ?? null,
        current_month_isr: monthIsrMap.get(w.id) ?? 0,
      }))
    );
  });

  // GET /api/workers — list employer's workers
  fastify.get("/", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;
    const rows = await db
      .select()
      .from(workers)
      .where(eq(workers.employer_id, employerId));
    return reply.status(200).send(rows);
  });

  // GET /api/workers/:id
  fastify.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.id, req.params.id), eq(workers.employer_id, employerId)));
    if (!worker) return reply.status(404).send({ error: "Worker not found" });
    return reply.status(200).send(worker);
  });

  // POST /api/workers — create
  fastify.post("/", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;
    const parsed = WorkerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", issues: parsed.error.issues });
    }
    const [created] = await db
      .insert(workers)
      .values({
        ...parsed.data,
        employer_id:       employerId,
        initiated_by:      "employer",
        employment_status: "active",
      })
      .returning();
    return reply.status(201).send(created);
  });

  // PATCH /api/workers/:id — update
  fastify.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;
    const parsed = WorkerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", issues: parsed.error.issues });
    }
    const [updated] = await db
      .update(workers)
      .set({ ...parsed.data, updated_at: new Date() })
      .where(and(eq(workers.id, req.params.id), eq(workers.employer_id, employerId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: "Worker not found" });
    return reply.status(200).send(updated);
  });

  // DELETE /api/workers/:id — soft delete
  fastify.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;
    const [deleted] = await db
      .update(workers)
      .set({ employment_status: "terminated" as any, end_date: new Date().toISOString().split("T")[0], updated_at: new Date() })
      .where(and(eq(workers.id, req.params.id), eq(workers.employer_id, employerId)))
      .returning();
    if (!deleted) return reply.status(404).send({ error: "Worker not found" });
    return reply.status(200).send(deleted);
  });

  // POST /api/workers/:id/invite
  fastify.post<{ Params: { id: string }; Body: { contact: string } }>(
    "/:id/invite",
    async (req, reply) => {
      if (!requireEmployer(req, reply)) return;
      const employerId = (req as any).employerId as string;

      const [worker] = await db
        .select()
        .from(workers)
        .where(and(eq(workers.id, req.params.id), eq(workers.employer_id, employerId)));
      if (!worker) return reply.status(404).send({ error: "Worker not found" });
      if (worker.invite_status === "claimed") {
        return reply.status(409).send({ error: "Worker has already claimed this profile" });
      }

      const body = req.body as { contact: string };
      if (!body?.contact?.trim()) {
        return reply.status(400).send({ error: "contact (email or phone) is required" });
      }

      const token = crypto.randomUUID();

      const [updated] = await db
        .update(workers)
        .set({
          invite_contact: body.contact.trim(),
          invite_status:  "pending",
          invite_token:   token,
          invited_at:     new Date(),
          updated_at:     new Date(),
        })
        .where(eq(workers.id, req.params.id))
        .returning();

      let employerName: string | null = null;
      try {
        const [emp] = await db
          .select({ business_name: employers.business_name })
          .from(employers)
          .where(eq(employers.id, employerId));
        employerName = emp?.business_name ?? null;
      } catch { /* non-fatal */ }

      const appUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
      await sendInviteEmail({
        to:           body.contact.trim(),
        workerName:   worker.full_name,
        employerName,
        claimUrl:     `${appUrl}/claim/${token}`,
        log:          req.log,
      });

      return reply.status(200).send({
        invite_token:   updated.invite_token,
        invite_contact: updated.invite_contact,
        invite_status:  updated.invite_status,
        claim_url:      `/claim/${token}`,
      });
    }
  );
};

export default plugin;
