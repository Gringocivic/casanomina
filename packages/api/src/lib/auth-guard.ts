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
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";

/** Constant-time string comparison — prevents timing-based key enumeration. */
function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Guards an employer-only route.
 *
 * - In dev mode (no CLERK_SECRET_KEY, NODE_ENV !== "production"): passes through.
 * - In production with no CLERK_SECRET_KEY: 503 — misconfigured deployment.
 * - With Clerk configured:
 *   - No token / expired token → 401 Unauthorized
 *   - Authenticated but role !== "employer" → 403 Forbidden
 *   - Authenticated employer → returns true, route proceeds
 *
 * Returns true when the request is allowed, false when a response has
 * already been sent (caller should just `return` without sending anything).
 */
export function requireEmployer(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!process.env.CLERK_SECRET_KEY) {
    // Production with no Clerk key = misconfigured deployment. Fail closed.
    if (process.env.NODE_ENV === "production") {
      reply.status(503).send({ error: "Authentication not configured — set CLERK_SECRET_KEY" });
      return false;
    }
    // Dev passthrough: allow everything when Clerk is not set up locally.
    return true;
  }

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
  if (!process.env.CLERK_SECRET_KEY) {
    if (process.env.NODE_ENV === "production") {
      reply.status(503).send({ error: "Authentication not configured — set CLERK_SECRET_KEY" });
      return false;
    }
    return true;
  }

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
  if (!process.env.CLERK_SECRET_KEY) {
    // Production with no Clerk key = misconfigured deployment. Fail closed.
    if (process.env.NODE_ENV === "production") {
      reply.status(503).send({ error: "Authentication not configured — set CLERK_SECRET_KEY" });
      return false;
    }
    // Dev passthrough: allow everything when Clerk is not set up locally.
    return true;
  }

  const employerId = (req as any).employerId as string;
  if (!resourceEmployerId || employerId !== resourceEmployerId) {
    reply.status(403).send({ error: "Access denied" });
    return false;
  }
  return true;
}

/**
 * Guards an admin-only route using a static API key.
 *
 * Set ADMIN_API_KEY in your environment. Requests must include:
 *   Authorization: Bearer <ADMIN_API_KEY>
 *
 * If ADMIN_API_KEY is not set the route is blocked entirely — there is no
 * dev-mode fallback, because these routes modify global rate configs.
 */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    reply.status(503).send({ error: "Admin API not configured — set ADMIN_API_KEY env var" });
    return false;
  }

  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token || !safeCompare(token, adminKey)) {
    reply.status(401).send({ error: "Invalid or missing admin API key" });
    return false;
  }

  return true;
}
