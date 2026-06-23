/**
 * routes/worker-portal.ts — Worker-facing portal endpoints.
 *
 * All routes require a valid worker session (requireWorker guard).
 * The worker's linked `workers` row is resolved from workerAccountId on every
 * request — no worker_id URL param needed; workers can only see their own data.
 *
 * GET /api/worker-portal/me               — employment details + employer name
 * GET /api/worker-portal/payslips         — list payroll runs (all statuses)
 * GET /api/worker-portal/payslip/:runId   — stream payslip PDF (generate if missing)
 * GET /api/worker-portal/contract         — stream most recent contract PDF (generate if missing)
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import {
  workers, employers, payrollRuns, payslips, contracts, rateConfigs,
} from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { requireWorker } from "../lib/auth-guard.js";
import { createReadStream, existsSync } from "fs";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import {
  renderPayslipToBuffer,
  renderContractToBuffer,
} from "../services/pdfRenderer.js";

const DOCS_DIR = process.env.DOCS_DIR ?? "./data/documents";

const plugin: FastifyPluginAsync = async (fastify) => {

  /** Resolve the workers row for the authenticated worker account. */
  async function resolveWorker(req: any, reply: any) {
    const workerAccountId = req.workerAccountId as string | null;
    if (!workerAccountId) {
      reply.status(403).send({ error: "No worker account — complete onboarding first" });
      return null;
    }
    const [worker] = await db
      .select()
      .from(workers)
      .where(eq(workers.worker_account_id, workerAccountId));
    if (!worker) {
      reply.status(404).send({ error: "No employment found for this account" });
      return null;
    }
    return worker;
  }

  // ── GET /api/worker-portal/me ────────────────────────────────────────────
  fastify.get("/me", async (req, reply) => {
    if (!requireWorker(req, reply)) return;
    const worker = await resolveWorker(req, reply);
    if (!worker) return;

    let employer_name: string | null = null;
    if (worker.employer_id) {
      const [emp] = await db
        .select({ business_name: employers.business_name })
        .from(employers)
        .where(eq(employers.id, worker.employer_id));
      employer_name = emp?.business_name ?? null;
    }

    return {
      worker_id:          worker.id,
      full_name:          worker.full_name,
      start_date:         worker.start_date,
      daily_salary:       worker.daily_salary,
      wage_zone:          worker.wage_zone,
      pay_frequency:      worker.pay_frequency,
      days_per_week:      worker.days_per_week,
      role:               worker.role,
      employment_status:  worker.employment_status,
      is_imss_registered: worker.is_imss_registered,
      imss_nss:           worker.imss_nss,
      employer_name,
    };
  });

  // ── GET /api/worker-portal/payslips ──────────────────────────────────────
  fastify.get("/payslips", async (req, reply) => {
    if (!requireWorker(req, reply)) return;
    const worker = await resolveWorker(req, reply);
    if (!worker) return;

    return db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.worker_id, worker.id))
      .orderBy(desc(payrollRuns.period_start));
  });

  // ── GET /api/worker-portal/payslip/:runId ────────────────────────────────
  // Streams the payslip PDF. Generates + caches it on first request.
  fastify.get<{ Params: { runId: string } }>(
    "/payslip/:runId",
    async (req, reply) => {
      if (!requireWorker(req, reply)) return;
      const worker = await resolveWorker(req, reply);
      if (!worker) return;

      const [run] = await db
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.id, req.params.runId));
      if (!run) return reply.status(404).send({ error: "Payroll run not found" });
      if (run.worker_id !== worker.id) {
        return reply.status(403).send({ error: "Access denied" });
      }

      // Serve cached PDF if available
      const [existing] = await db
        .select()
        .from(payslips)
        .where(eq(payslips.payroll_run_id, run.id));

      if (existing && existsSync(existing.file_path)) {
        reply.header("Content-Type", "application/pdf");
        reply.header(
          "Content-Disposition",
          `attachment; filename="payslip_${run.period_start}.pdf"`,
        );
        return reply.send(createReadStream(existing.file_path));
      }

      // Generate on-the-fly
      const [config] = await db
        .select()
        .from(rateConfigs)
        .where(eq(rateConfigs.id, run.config_id));
      if (!config) return reply.status(500).send({ error: "Rate config not found" });

      const pdfBuffer = await renderPayslipToBuffer(
        {
          id:             run.id,
          worker_id:      run.worker_id,
          period_start:   run.period_start,
          period_end:     run.period_end,
          gross_pay:      run.gross_wages,
          net_pay:        run.net_pay,
          employer_cost:  run.employer_total_cost,
          status:         run.status,
          breakdown_json: run.breakdown_json as Record<string, unknown>,
          paid_at:        run.paid_at?.toISOString() ?? null,
        },
        {
          id:                 worker.id,
          full_name:          worker.full_name,
          start_date:         worker.start_date,
          daily_salary:       worker.daily_salary,
          wage_zone:          worker.wage_zone,
          pay_frequency:      worker.pay_frequency,
          days_per_week:      worker.days_per_week,
          role:               worker.role,
          curp:               worker.curp,
          imss_nss:           worker.imss_nss,
          is_imss_registered: worker.is_imss_registered,
        },
        {
          config_key:  config.config_key,
          year:        config.year,
          config_data: config.config_data as Record<string, unknown>,
        },
      );

      const dir = join(DOCS_DIR, "payslips", worker.id);
      await mkdir(dir, { recursive: true });
      const fileName = `payslip_${run.period_start}_${run.id.slice(0, 8)}.pdf`;
      const filePath = join(dir, fileName);
      await writeFile(filePath, pdfBuffer);

      // Cache in DB (only if not already there — avoid unique constraint violations)
      if (!existing) {
        await db.insert(payslips).values({
          payroll_run_id: run.id,
          worker_id:      worker.id,
          file_path:      filePath,
        });
      }

      reply.header("Content-Type", "application/pdf");
      reply.header(
        "Content-Disposition",
        `attachment; filename="payslip_${run.period_start}.pdf"`,
      );
      return reply.send(pdfBuffer);
    },
  );

  // ── GET /api/worker-portal/contract ─────────────────────────────────────
  // Serves the most recent contract, generating one on-the-fly if needed.
  fastify.get("/contract", async (req, reply) => {
    if (!requireWorker(req, reply)) return;
    const worker = await resolveWorker(req, reply);
    if (!worker) return;

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.worker_id, worker.id))
      .orderBy(desc(contracts.contract_date))
      .limit(1);

    if (contract && existsSync(contract.file_path)) {
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", 'attachment; filename="contract.pdf"');
      return reply.send(createReadStream(contract.file_path));
    }

    // Generate on-the-fly
    const [config] = await db
      .select()
      .from(rateConfigs)
      .where(eq(rateConfigs.is_active, true))
      .limit(1);
    if (!config) return reply.status(500).send({ error: "No active rate config" });

    const contractDate = new Date().toISOString().slice(0, 10);
    const pdfBuffer = await renderContractToBuffer(
      {
        id:                 worker.id,
        full_name:          worker.full_name,
        start_date:         worker.start_date,
        daily_salary:       worker.daily_salary,
        wage_zone:          worker.wage_zone,
        pay_frequency:      worker.pay_frequency,
        days_per_week:      worker.days_per_week,
        role:               worker.role,
        curp:               worker.curp,
        imss_nss:           worker.imss_nss,
        is_imss_registered: worker.is_imss_registered,
      },
      contractDate,
    );

    const dir = join(DOCS_DIR, "contracts", worker.id);
    await mkdir(dir, { recursive: true });
    const fileName = `contract_${contractDate}_${worker.id.slice(0, 8)}.pdf`;
    const filePath = join(dir, fileName);
    await writeFile(filePath, pdfBuffer);

    await db.insert(contracts).values({
      worker_id:     worker.id,
      config_id:     config.id,
      contract_date: contractDate,
      file_path:     filePath,
    });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", 'attachment; filename="contract.pdf"');
    return reply.send(pdfBuffer);
  });
};

export default plugin;
