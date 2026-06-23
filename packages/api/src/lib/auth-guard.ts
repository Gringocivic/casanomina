/**
 * lib/auth-guard.ts
 *
 * Shared authorization helpers for Fastify route handlers.
 *
 * Usage:
 *   import { requireEmployer } from "../lib/auth-guard.js";
 *
 *   fastify.get("/", async (req, reply) => {
 *     if (!requireEmployer(req, reply)) return;
 *     // ... employer-only logic
 *   });
 */
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Guards an employer-only route.
 *
 * - In dev mode (no CLERK_SECRET_KEY): always passes through.
 * - With Clerk configured:
 *   - No token / expired token → 401 Unauthorized
 *   - Authenticated but role !== "employer" → 403 Forbidden
 *   - Authenticated employer → returns true, route proceeds
 *
 * Returns true when the request is allowed, false when a response has
 * already been sent (caller should just `return` without sending anything).
 */
export function requireEmployer(req: FastifyRequest, reply: FastifyReply): boolean {
  // Dev mode — no Clerk configured, allow everything.
  if (!process.env.CLERK_SECRET_KEY) return true;

  const r = req as FastifyRequest & {
    clerkUserId: string | null;
    clerkRole: "employer" | "worker" | null;
  };

  if (!r.clerkUserId) {
    reply.status(401).send({ error: "Authentication required" });
    return false;
  }

  if (r.clerkRole !== "employer") {
    reply.status(403).send({ error: "Employer access required" });
    return false;
  }

  return true;
}

/**
 * Guards a worker-only route.
 * Mirrors requireEmployer but checks for the "worker" role.
 */
export function requireWorker(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!process.env.CLERK_SECRET_KEY) return true;

  const r = req as FastifyRequest & {
    clerkUserId: string | null;
    clerkRole: "employer" | "worker" | null;
  };

  if (!r.clerkUserId) {
    reply.status(401).send({ error: "Authentication required" });
    return false;
  }

  if (r.clerkRole !== "worker") {
    reply.status(403).send({ error: "Worker account required" });
    return false;
  }

  return true;
}

/**
 * Checks employer data ownership: returns true if the given resource
 * employer_id matches the requesting employer, or if running in dev mode.
 *
 * Call AFTER requireEmployer — this only handles the ownership assertion,
 * not the authentication/role check.
 */
export function ownsResource(
  req: FastifyRequest,
  resourceEmployerId: string | null,
  reply: FastifyReply,
): boolean {
  if (!process.env.CLERK_SECRET_KEY) return true;

  const employerId = (req as any).employerId as string;
  if (!resourceEmployerId || employerId !== resourceEmployerId) {
    reply.status(403).send({ error: "Access denied" });
    return false;
  }
  return true;
}
