/**
 * routes/payroll.ts
 *
 * GET  /api/payroll/:workerId           — list payroll runs for a worker
 * POST /api/payroll/preview             — calculate (no DB write) — for the UI preview step
 * POST /api/payroll                     — create + save a payroll run (draft)
 * POST /api/payroll/:id/approve         — approve a draft run
 * POST /api/payroll/:id/mark-paid       — mark a run as paid
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { payrollRuns, rateConfigs, workers } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { calculatePayroll } from "@casanomina/calculator";
import type { RatesConfig, WorkerRecord, PayPeriod } from "@casanomina/calculator";
import { requireEmployer, ownsResource } from "../lib/auth-guard.js";

const PeriodSchema = z.object({
  worker_id:            z.string().uuid(),
  start_date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days_worked:          z.number().int().positive(),
  holiday_days_worked:  z.number().int().min(0).default(0),
  rest_days_worked:     z.number().int().min(0).default(0),
});

const plugin: FastifyPluginAsync = async (fastify) => {

  // POST /api/payroll/preview — pure calculation, no DB write
  fastify.post("/preview", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const body = PeriodSchema.parse(req.body);

    const [worker] = await db.select().from(workers).where(eq(workers.id, body.worker_id));
    if (!worker) return reply.status(404).send({ error: "Worker not found" });
    if (!ownsResource(req, worker.employer_id, reply)) return;

    const [config] = await db.select().from(rateConfigs).where(eq(rateConfigs.is_active, true));
    if (!config) return reply.status(500).send({ error: "No active config" });

    const workerRecord: WorkerRecord = {
      id:           worker.id,
      full_name:    worker.full_name,
      start_date:   worker.start_date,
      daily_salary: Number(worker.daily_salary),
      wage_zone:    worker.wage_zone,
      days_per_week: worker.days_per_week ?? 6,
    };

    const period: PayPeriod = {
      start_date:          body.start_date,
      end_date:            body.end_date,
      days_worked:         body.days_worked,
      holiday_days_worked: body.holiday_days_worked,
      rest_days_worked:    body.rest_days_worked,
    };

    const result = calculatePayroll(workerRecord, period, config.config_data as RatesConfig);
    return result;
  });

  // POST /api/payroll — save a payroll run as draft
  fastify.post("/", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const body = PeriodSchema.parse(req.body);

    const [worker] = await db.select().from(workers).where(eq(workers.id, body.worker_id));
    if (!worker) return reply.status(404).send({ error: "Worker not found" });
    if (!ownsResource(req, worker.employer_id, reply)) return;

    const [config] = await db.select().from(rateConfigs).where(eq(rateConfigs.is_active, true));
    if (!config) return reply.status(500).send({ error: "No active config" });

    const workerRecord: WorkerRecord = {
      id: worker.id, full_name: worker.full_name, start_date: worker.start_date,
      daily_salary: Number(worker.daily_salary), wage_zone: worker.wage_zone,
      days_per_week: worker.days_per_week ?? 6,
    };

    const period: PayPeriod = {
      start_date: body.start_date, end_date: body.end_date,
      days_worked: body.days_worked, holiday_days_worked: body.holiday_days_worked, rest_days_worked: body.rest_days_worked,
    };

    const result = calculatePayroll(workerRecord, period, config.config_data as RatesConfig);

    const [run] = await db.insert(payrollRuns).values({
      worker_id:    body.worker_id,
      config_id:    config.id,
      period_start: body.start_date,
      period_end:   body.end_date,
      days_worked:  body.days_worked,
      status:       "draft",
      gross_wages:               String(result.gross_wages),
      imss_worker_deduction:     String(result.imss.total_worker),
      imss_employer_contribution: String(result.imss.total_employer),
      infonavit_employer_contribution: String(result.infonavit_employer_contribution),
      isr_withholding:           String(result.isr.period_isr_withholding),
      net_pay:             String(result.net_pay),
      employer_total_cost: String(result.employer_total_cost),
      breakdown_json:      result as any,
    }).returning();

    return reply.status(201).send(run);
  });

  // GET /api/payroll/all — all runs for ALL of this employer's workers (joined with worker name)
  fastify.get("/all", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;

    const rows = await db
      .select({
        id:                   payrollRuns.id,
        worker_id:            payrollRuns.worker_id,
        worker_name:          workers.full_name,
        period_start:         payrollRuns.period_start,
        period_end:           payrollRuns.period_end,
        days_worked:          payrollRuns.days_worked,
        status:               payrollRuns.status,
        gross_wages:          payrollRuns.gross_wages,
        isr_withholding:      payrollRuns.isr_withholding,
        net_pay:              payrollRuns.net_pay,
        employer_total_cost:  payrollRuns.employer_total_cost,
        paid_at:              payrollRuns.paid_at,
        approved_at:          payrollRuns.approved_at,
        created_at:           payrollRuns.created_at,
      })
      .from(payrollRuns)
      .innerJoin(workers, eq(payrollRuns.worker_id, workers.id))
      .where(eq(workers.employer_id, employerId))
      .orderBy(desc(payrollRuns.period_start));

    return reply.send(rows);
  });

  // GET /api/payroll/:workerId
  fastify.get<{ Params: { workerId: string } }>("/:workerId", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;

    // Verify the worker belongs to this employer before returning their payroll history.
    const [worker] = await db
      .select({ employer_id: workers.employer_id })
      .from(workers)
      .where(eq(workers.id, req.params.workerId));
    if (!worker) return reply.status(404).send({ error: "Worker not found" });
    if (!ownsResource(req, worker.employer_id, reply)) return;

    return db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.worker_id, req.params.workerId))
      .orderBy(desc(payrollRuns.period_start));
  });

  // POST /api/payroll/:id/approve
  fastify.post<{ Params: { id: string } }>("/:id/approve", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;

    // Verify the payroll run belongs to a worker owned by this employer.
    const [run] = await db
      .select({ id: payrollRuns.id, employer_id: workers.employer_id })
      .from(payrollRuns)
      .innerJoin(workers, eq(payrollRuns.worker_id, workers.id))
      .where(eq(payrollRuns.id, req.params.id));
    if (!run) return reply.status(404).send({ error: "Payroll run not found" });
    if (!ownsResource(req, run.employer_id, reply)) return;

    const [updated] = await db
      .update(payrollRuns)
      .set({ status: "approved", approved_at: new Date(), approved_by: employerId })
      .where(eq(payrollRuns.id, req.params.id))
      .returning();

    return updated;
  });

  // POST /api/payroll/:id/mark-paid
  fastify.post<{ Params: { id: string } }>("/:id/mark-paid", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;

    // Verify ownership before marking paid.
    const [run] = await db
      .select({ id: payrollRuns.id, employer_id: workers.employer_id })
      .from(payrollRuns)
      .innerJoin(workers, eq(payrollRuns.worker_id, workers.id))
      .where(eq(payrollRuns.id, req.params.id));
    if (!run) return reply.status(404).send({ error: "Payroll run not found" });
    if (!ownsResource(req, run.employer_id, reply)) return;

    const [updated] = await db
      .update(payrollRuns)
      .set({ status: "paid", paid_at: new Date() })
      .where(eq(payrollRuns.id, req.params.id))
      .returning();

    return updated;
  });
};

export default plugin;
