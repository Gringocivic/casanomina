/**
 * routes/auth.ts
 *
 * POST /api/auth/register-role  — called once after sign-up to create the
 *                                  employer or workerAccount DB row and stamp
 *                                  publicMetadata.role on the Clerk account.
 * GET  /api/auth/me             — returns the current user's role and row ID.
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { employers, workerAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { z } from "zod";

const RegisterRoleSchema = z.object({
  role:          z.enum(["employer", "worker"]),
  business_name: z.string().max(255).optional(),
  full_name:     z.string().max(255).optional(),
});

const plugin: FastifyPluginAsync = async (fastify) => {

  // GET /api/auth/me
  fastify.get("/me", async (req: any, reply) => {
    const clerkUserId = req.clerkUserId as string | null;
    if (!clerkUserId) {
      // Dev mode: return placeholder employer
      return { role: "employer", id: "00000000-0000-0000-0000-000000000001" };
    }

    const [employer] = await db
      .select({ id: employers.id })
      .from(employers)
      .where(eq(employers.clerk_user_id, clerkUserId));
    if (employer) return { role: "employer", id: employer.id };

    const [worker] = await db
      .select({ id: workerAccounts.id })
      .from(workerAccounts)
      .where(eq(workerAccounts.clerk_user_id, clerkUserId));
    if (worker) return { role: "worker", id: worker.id };

    return { role: null, id: null };
  });

  // POST /api/auth/register-role
  fastify.post("/register-role", async (req: any, reply) => {
    const clerkUserId = req.clerkUserId as string | null;
    if (!clerkUserId) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    const body = RegisterRoleSchema.parse(req.body);

    if (body.role === "employer") {
      // Upsert — idempotent if called twice.
      const existing = await db
        .select({ id: employers.id })
        .from(employers)
        .where(eq(employers.clerk_user_id, clerkUserId));

      if (existing.length > 0) {
        return { role: "employer", id: existing[0].id };
      }

      const [created] = await db
        .insert(employers)
        .values({ clerk_user_id: clerkUserId, business_name: body.business_name ?? null })
        .returning({ id: employers.id });

      // Stamp role in Clerk publicMetadata if the Management API is configured.
      await maybeSetClerkRole(fastify, clerkUserId, "employer");

      return reply.status(201).send({ role: "employer", id: created.id });
    }

    // role === "worker"
    if (!body.full_name) {
      return reply.status(400).send({ error: "full_name is required for worker role" });
    }

    const existing = await db
      .select({ id: workerAccounts.id })
      .from(workerAccounts)
      .where(eq(workerAccounts.clerk_user_id, clerkUserId));

    if (existing.length > 0) {
      return { role: "worker", id: existing[0].id };
    }

    const [created] = await db
      .insert(workerAccounts)
      .values({ clerk_user_id: clerkUserId, full_name: body.full_name })
      .returning({ id: workerAccounts.id });

    await maybeSetClerkRole(fastify, clerkUserId, "worker");

    return reply.status(201).send({ role: "worker", id: created.id });
  });
};

/** Sets publicMetadata.role on the Clerk user account if CLERK_SECRET_KEY is available. */
async function maybeSetClerkRole(fastify: any, clerkUserId: string, role: string) {
  if (!fastify.clerkClient) return;
  try {
    await fastify.clerkClient.users.updateUser(clerkUserId, {
      publicMetadata: { role },
    });
  } catch (e) {
    fastify.log.warn({ err: e }, "Failed to set Clerk publicMetadata.role — non-fatal");
  }
}

export default plugin;
