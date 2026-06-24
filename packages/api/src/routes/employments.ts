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
import { workers, employers, workerAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { z } from "zod";

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
  // Authenticated (any signed-in user). Body: { token: string }
  // Creates the workerAccount if it doesn't exist yet, then links the employment.
  fastify.post(
    "/claim",
    async (req, reply) => {
      const clerkUserId = (req as any).clerkUserId as string | null;
      if (!clerkUserId) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      // Reject employers trying to claim worker invites
      const clerkRole = (req as any).clerkRole as string | null;
      if (clerkRole === "employer") {
        return reply.status(403).send({ error: "Employer accounts cannot claim worker invites" });
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

      // Find or create the workerAccount for this Clerk user
      let workerAccountId: string;
      const [existing] = await db
        .select({ id: workerAccounts.id })
        .from(workerAccounts)
        .where(eq(workerAccounts.clerk_user_id, clerkUserId));

      if (existing) {
        workerAccountId = existing.id;
      } else {
        const [created] = await db
          .insert(workerAccounts)
          .values({ clerk_user_id: clerkUserId, full_name: worker.full_name })
          .returning({ id: workerAccounts.id });
        workerAccountId = created.id;
        // Stamp Clerk publicMetadata so the frontend knows the role
        if (fastify.clerkClient) {
          try {
            await fastify.clerkClient.users.updateUser(clerkUserId, {
              publicMetadata: { role: "worker" },
            });
          } catch (e) {
            fastify.log.warn({ err: e }, "Failed to set Clerk publicMetadata.role");
          }
        }
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
