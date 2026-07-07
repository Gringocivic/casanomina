/**
 * routes/documents.ts — PDF generation endpoints.
 *
 * POST /api/documents/payslip/:payrollRunId  — generate & save payslip PDF
 * GET  /api/documents/payslip/:payrollRunId  — download payslip PDF
 * POST /api/documents/contract/:workerId     — generate & save contract PDF
 * GET  /api/documents/contract/:workerId     — download most recent contract
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { payrollRuns, payslips, contracts, workers, rateConfigs } from "../db/schema.js";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createReadStream, existsSync } from "fs";
import { renderPayslipToBuffer, renderContractToBuffer } from "../services/pdfRenderer.js";
import { requireEmployer, ownsResource } from "../lib/auth-guard.js";

const DOCS_DIR = process.env.DOCS_DIR ?? "./data/documents";

const plugin: FastifyPluginAsync = async (fastify) => {

  // ─── POST /api/documents/payslip/:payrollRunId ──────────────────────────────
  // Stricter limit: generates a full PDF on every call (CPU/memory heavy).
  fastify.post<{ Params: { payrollRunId: string } }>(
    "/payslip/:payrollRunId",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireEmployer(req, reply)) return;

      const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, req.params.payrollRunId));
      if (!run) return reply.status(404).send({ error: "Payroll run not found" });

      const [worker] = await db.select().from(workers).where(eq(workers.id, run.worker_id));
      if (!worker) return reply.status(404).send({ error: "Worker not found" });
      if (!ownsResource(req, worker.employer_id, reply)) return;

      const [config] = await db.select().from(rateConfigs).where(eq(rateConfigs.id, run.config_id));
      if (!config) return reply.status(404).send({ error: "Rate config not found" });

      // Vacation days taken in this worker's current anniversary year
      // (LFT vacation entitlement resets on hire anniversary, not Jan 1)
      const hireDate = new Date(worker.start_date + "T00:00:00");
      const today    = new Date();
      // Cap hire day to last day of month so Feb-29 doesn't roll to March 1
      // in non-leap years (JS Date constructor silently overflows).
      const annivYear  = today.getFullYear();
      const lastDay    = new Date(annivYear, hireDate.getMonth() + 1, 0).getDate();
      const anniv      = new Date(annivYear, hireDate.getMonth(), Math.min(hireDate.getDate(), lastDay));
      if (anniv > today) anniv.setFullYear(annivYear - 1);
      const annivStart = anniv.toISOString().split("T")[0];
      const vacRows = await db.select({
        vacation_days: payrollRuns.vacation_days,
      }).from(payrollRuns).where(
        and(eq(payrollRuns.worker_id, run.worker_id),
            gte(payrollRuns.period_start, annivStart))
      );
      const vacationDaysTakenYTD = vacRows.reduce((sum, r) => sum + (r.vacation_days ?? 0), 0);

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
          vacation_days_taken_ytd: vacationDaysTakenYTD,
        },
        {
          config_key:  config.config_key,
          year:        config.year,
          config_data: config.config_data as Record<string, unknown>,
        }
      );

      const dir = join(DOCS_DIR, "payslips", worker.id);
      await mkdir(dir, { recursive: true });
      const fileName = `payslip_${run.period_start}_${run.id.slice(0, 8)}.pdf`;
      const filePath = join(dir, fileName);
      await writeFile(filePath, pdfBuffer);

      const [payslip] = await db
        .insert(payslips)
        .values({ payroll_run_id: run.id, worker_id: worker.id, file_path: filePath })
        .returning();

      req.log.info({ payslipId: payslip.id, filePath }, "Payslip generated");
      return reply.status(201).send({ payslip, file_path: filePath });
    }
  );

  // ─── GET /api/documents/payslip/:payrollRunId ───────────────────────────────
  fastify.get<{ Params: { payrollRunId: string } }>(
    "/payslip/:payrollRunId",
    async (req, reply) => {
      if (!requireEmployer(req, reply)) return;

      const [payslip] = await db.select().from(payslips)
        .where(eq(payslips.payroll_run_id, req.params.payrollRunId));
      if (!payslip) return reply.status(404).send({ error: "Payslip not found — POST first" });

      // Ownership check via worker — must find the worker AND own it.
      // A missing worker row (e.g. soft-deleted) must NOT skip the check.
      const [worker] = await db
        .select({ employer_id: workers.employer_id })
        .from(workers)
        .where(eq(workers.id, payslip.worker_id));
      if (!worker) return reply.status(404).send({ error: "Worker not found" });
      if (!ownsResource(req, worker.employer_id, reply)) return;

      if (!existsSync(payslip.file_path)) {
        return reply.status(404).send({ error: "PDF missing from disk — regenerate via POST" });
      }
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="payslip_${req.params.payrollRunId.slice(0, 8)}.pdf"`);
      return reply.send(createReadStream(payslip.file_path));
    }
  );

  // ─── POST /api/documents/contract/:workerId ─────────────────────────────────
  // Stricter limit: generates a full PDF on every call.
  fastify.post<{
    Params: { workerId: string };
    Body: { contract_date?: string };
  }>(
    "/contract/:workerId",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireEmployer(req, reply)) return;

      const [worker] = await db.select().from(workers).where(eq(workers.id, req.params.workerId));
      if (!worker) return reply.status(404).send({ error: "Worker not found" });
      if (!ownsResource(req, worker.employer_id, reply)) return;

      // Need active rate config for contract audit trail
      const [config] = await db.select().from(rateConfigs)
        .where(eq(rateConfigs.is_active, true)).limit(1);
      if (!config) return reply.status(500).send({ error: "No active rate config — run db:seed first" });

      const contractDate = (req.body as { contract_date?: string })?.contract_date
        ?? new Date().toISOString().slice(0, 10);

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
          vacation_days_taken_ytd: 0,
        },
        contractDate
      );

      const dir = join(DOCS_DIR, "contracts", worker.id);
      await mkdir(dir, { recursive: true });
      const fileName = `contract_${contractDate}_${worker.id.slice(0, 8)}.pdf`;
      const filePath = join(dir, fileName);
      await writeFile(filePath, pdfBuffer);

      const [contract] = await db
        .insert(contracts)
        .values({
          worker_id:     worker.id,
          config_id:     config.id,
          contract_date: contractDate,
          file_path:     filePath,
        })
        .returning();

      req.log.info({ contractId: contract.id, filePath }, "Contract generated");
      return reply.status(201).send({ contract, file_path: filePath });
    }
  );

  // ─── GET /api/documents/contract/:workerId ──────────────────────────────────
  fastify.get<{ Params: { workerId: string } }>(
    "/contract/:workerId",
    async (req, reply) => {
      if (!requireEmployer(req, reply)) return;

      // Ownership check
      const [worker] = await db
        .select({ employer_id: workers.employer_id })
        .from(workers)
        .where(eq(workers.id, req.params.workerId));
      if (!worker) return reply.status(404).send({ error: "Worker not found" });
      if (!ownsResource(req, worker.employer_id, reply)) return;

      const [contract] = await db.select().from(contracts)
        .where(eq(contracts.worker_id, req.params.workerId))
        .orderBy(desc(contracts.contract_date))
        .limit(1);
      if (!contract) return reply.status(404).send({ error: "No contract — generate via POST" });
      if (!existsSync(contract.file_path)) {
        return reply.status(404).send({ error: "PDF missing — regenerate via POST" });
      }
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="contract_${req.params.workerId.slice(0, 8)}.pdf"`);
      return reply.send(createReadStream(contract.file_path));
    }
  );
  // ─── GET /api/documents/sample-contract ────────────────────────────────────
  // Public endpoint — no auth required. Generates a sample contract PDF using
  // placeholder worker data so prospective users can see what the output looks like.
  // Public endpoint — limit abuse; PDF generation is expensive.
  fastify.get(
    "/sample-contract",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (_req, reply) => {
      const sampleContractDate = new Date().toISOString().slice(0, 10);

      const pdfBuffer = await renderContractToBuffer(
        {
          id:                 "00000000-0000-0000-0000-000000000000",
          full_name:          "María García López",
          start_date:         "2024-01-15",
          daily_salary:       "278.80",
          wage_zone:          "general",
          pay_frequency:      "weekly",
          days_per_week:      5,
          role:               "Trabajadora del Hogar",
          curp:               null,
          imss_nss:           null,
          is_imss_registered: false,
        },
        sampleContractDate
      );

      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", 'attachment; filename="sample-contract-casanomina.pdf"');
      return reply.send(pdfBuffer);
    }
  );


};

export default plugin;
