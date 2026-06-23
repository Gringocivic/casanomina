/**
 * routes/employments.ts
 *
 * GET  /api/employments/invite/:token  — public peek at an invite (shows worker
 *                                        name + status so the claim page can
 *                                        display context before auth).
 * POST /api/employments/claim          — worker-only; links the calling worker
 *                                        account to the employer's worker row,
 *                                        marks invite as claimed and employment
 *                                        as active.
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { workers, employers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireWorker } from "../lib/auth-guard.js";

const plugin: FastifyPluginAsync = async (fastify) => {

  // ── GET /api/employments/invite/:token ───────────────────────────────────
  // Public — no auth required. Returns enough info to render the claim page
  // before the worker signs in.
  fastify.get<{ Params: { token: string } }>(
    "/invite/:token",
    async (req, reply) => {
      const [worker] = await db
        .select({
          id:            workers.id,
          full_name:     workers.full_name,
          invite_status: workers.invite_status,
          employer_id:   workers.employer_id,
        })
        .from(workers)
        .where(eq(workers.invite_token, req.params.token));

      if (!worker) return reply.status(404).send({ error: "Invite not found" });

      // Fetch employer name for display
      let employer_name: string | null = null;
      if (worker.employer_id) {
        const [emp] = await db
          .select({ business_name: employers.business_name })
          .from(employers)
          .where(eq(employers.id, worker.employer_id));
        employer_name = emp?.business_name ?? null;
      }

      return {
        worker_id:     worker.id,
        worker_name:   worker.full_name,
        invite_status: worker.invite_status,
        employer_name,
      };
    }
  );

  // ── POST /api/employments/claim ──────────────────────────────────────────
  // Worker-only. Body: { token: string }
  // Links the calling workerAccount to the worker row and activates the employment.
  fastify.post(
    "/claim",
    async (req, reply) => {
      if (!requireWorker(req, reply)) return;

      const workerAccountId = (req as any).workerAccountId as string | null;
      if (!workerAccountId) {
        return reply.status(403).send({ error: "Worker account not found — complete onboarding first" });
      }

      const body = z.object({ token: z.string().min(1) }).parse(req.body);

      const [worker] = await db
        .select()
        .from(workers)
        .where(eq(workers.invite_token, body.token));

      if (!worker) return reply.status(404).send({ error: "Invite not found" });

      if (worker.invite_status === "claimed") {
        return reply.status(409).send({ error: "This invite has already been claimed" });
      }

      const [updated] = await db
        .update(workers)
        .set({
          worker_account_id: workerAccountId,
          invite_status:     "claimed",
          employment_status: "active",
          updated_at:        new Date(),
        })
        .where(eq(workers.id, worker.id))
        .returning();

      return reply.status(200).send({
        worker_id:         updated.id,
        worker_name:       updated.full_name,
        employment_status: updated.employment_status,
        invite_status:     updated.invite_status,
      });
    }
  );
};

export default plugin;
