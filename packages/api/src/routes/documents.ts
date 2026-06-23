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
import { eq, desc } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createReadStream, existsSync } from "fs";
import { renderPayslipToBuffer, renderContractToBuffer } from "../services/pdfRenderer.js";
import { requireEmployer, ownsResource } from "../lib/auth-guard.js";

const DOCS_DIR = process.env.DOCS_DIR ?? "./data/documents";

const plugin: FastifyPluginAsync = async (fastify) => {

  // ─── POST /api/documents/payslip/:payrollRunId ──────────────────────────────
  fastify.post<{ Params: { payrollRunId: string } }>(
    "/payslip/:payrollRunId",
    async (req, reply) => {
      if (!requireEmployer(req, reply)) return;

      const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, req.params.payrollRunId));
      if (!run) return reply.status(404).send({ error: "Payroll run not found" });

      const [worker] = await db.select().from(workers).where(eq(workers.id, run.worker_id));
      if (!worker) return reply.status(404).send({ error: "Worker not found" });
      if (!ownsResource(req, worker.employer_id, reply)) return;

      const [config] = await db.select().from(rateConfigs).where(eq(rateConfigs.id, run.config_id));
      if (!config) return reply.status(404).send({ error: "Rate config not found" });

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

      // Ownership check via worker
      const [worker] = await db
        .select({ employer_id: workers.employer_id })
        .from(workers)
        .where(eq(workers.id, payslip.worker_id));
      if (worker && !ownsResource(req, worker.employer_id, reply)) return;

      if (!existsSync(payslip.file_path)) {
        return reply.status(404).send({ error: "PDF missing from disk — regenerate via POST" });
      }
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="payslip_${req.params.payrollRunId.slice(0, 8)}.pdf"`);
      return reply.send(createReadStream(payslip.file_path));
    }
  );

  // ─── POST /api/documents/contract/:workerId ─────────────────────────────────
  fastify.post<{
    Params: { workerId: string };
    Body: { contract_date?: string };
  }>(
    "/contract/:workerId",
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
  fastify.get(
    "/sample-contract",
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
