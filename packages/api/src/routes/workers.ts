/**
 * routes/workers.ts
 *
 * Full CRUD for workers, scoped to the authenticated employer.
 *
 * GET    /api/workers          — list all workers for the employer
 * GET    /api/workers/:id      — get one worker
 * POST   /api/workers          — create a new worker record
 * PATCH  /api/workers/:id      — update worker details
 * DELETE /api/workers/:id      — soft-delete (sets end_date, keeps records)
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { workers, employers } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireEmployer } from "../lib/auth-guard.js";
import { sendInviteEmail } from "../services/emailService.js";

const WorkerSchema = z.object({
  full_name:          z.string().min(1),
  start_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daily_salary:       z.union([z.string(), z.number()]).transform(String),
  wage_zone:          z.enum(["general", "northern_border"]).default("general"),
  pay_frequency:      z.enum(["daily", "weekly", "biweekly", "monthly"]).default("weekly"),
  days_per_week:      z.number().int().min(1).max(7).default(6),
  role:               z.string().optional().nullable(),
  curp:               z.string().optional().nullable(),
  employment_status:  z.enum(["proposed", "active"]).default("active"),
  is_imss_registered: z.boolean().default(false),
  imss_nss:           z.string().optional().nullable(),
});

const plugin: FastifyPluginAsync = async (fastify) => {

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
      .set({ employment_status: "terminated", end_date: new Date(), updated_at: new Date() })
      .where(and(eq(workers.id, req.params.id), eq(workers.employer_id, employerId)))
      .returning();
    if (!deleted) return reply.status(404).send({ error: "Worker not found" });
    return reply.status(200).send(deleted);
  });

  // POST /api/workers/:id/invite
  // Generates a claim token and stores the employer's contact info for the worker.
  // The invite link (/claim/:token) is returned so the employer can share it.
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

      // Resolve employer name for the email (best-effort)
      let employerName: string | null = null;
      try {
        const [emp] = await db
          .select({ business_name: employers.business_name })
          .from(employers)
          .where(eq(employers.id, employerId));
        employerName = emp?.business_name ?? null;
      } catch { /* non-fatal */ }

      // Send invite email if contact is an email address
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
