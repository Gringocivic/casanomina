/**
 * server.ts — Fastify server setup.
 *
 * Registers global plugins (CORS, Helmet) and all route plugins.
 * Auth is handled via Clerk token verification (see Phase 1 in
 * docs/ACCOUNTS_AND_PORTALS_PLAN.md).
 *
 * When CLERK_SECRET_KEY is set in the environment, incoming Bearer tokens
 * are verified with Clerk's backend SDK. When it is NOT set (local dev
 * without Clerk configured), the auth hook is a no-op and every route
 * falls back to the DEV_EMPLOYER_ID placeholder.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createClerkClient, verifyToken } from "@clerk/backend";

import configRoutes from "./routes/config.js";
import workerRoutes from "./routes/workers.js";
import payrollRoutes from "./routes/payroll.js";
import cmsRoutes from "./routes/cms.js";
import calculateRoutes from "./routes/calculate.js";
import documentsRoutes from "./routes/documents.js";
import holidaysRoutes from "./routes/holidays.js";
import authRoutes from "./routes/auth.js";
import employmentsRoutes from "./routes/employments.js";
import workerPortalRoutes from "./routes/worker-portal.js";
import employerProfileRoutes from "./routes/employer-profile.js";
import { db } from "./db/client.js";
import { employers, workerAccounts } from "./db/schema.js";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyInstance {
    /** Clerk Management API client — only present when CLERK_SECRET_KEY is set. */
    clerkClient: ReturnType<typeof createClerkClient> | null;
  }
  interface FastifyRequest {
    /** The verified Clerk user ID, or null in dev mode / unauthenticated requests. */
    clerkUserId: string | null;
    /**
     * "employer" | "worker" | null.
     * Set by the auth preHandler after resolving the Clerk user against DB rows.
     * null means the user is authenticated but has not completed onboarding yet.
     * In dev mode (no CLERK_SECRET_KEY) this is always null.
     */
    clerkRole: "employer" | "worker" | null;
    /**
     * Resolved employer UUID from the employers table, or the dev placeholder.
     * Only valid when clerkRole === "employer" (or dev mode).
     * Set by the auth preHandler; use this in route handlers instead of
     * querying employers by clerk_user_id every time.
     */
    employerId: string;
    /**
     * Resolved workerAccount UUID — only set when clerkRole === "worker".
     * Null for employers and unauthenticated requests.
     */
    workerAccountId: string | null;
  }
}

const DEV_EMPLOYER_ID = "00000000-0000-0000-0000-000000000001";

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty" }
        : undefined,
    },
  });

  // ── Security ─────────────────────────────────────────────────────────────
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });
  await fastify.register(cors, {
    origin: (origin, cb) => {
      const allowed = (process.env.FRONTEND_URL ?? "http://localhost:5173")
        .split(",")
        .map((s) => s.trim());
      // Allow requests with no origin (curl, server-to-server)
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
  });

  // ── Clerk client (Management API) ─────────────────────────────────────────
  const secretKey = process.env.CLERK_SECRET_KEY;
  fastify.decorate(
    "clerkClient",
    secretKey ? createClerkClient({ secretKey }) : null
  );

  // ── Request decorators ───────────────────────────────────────────────────
  fastify.decorateRequest("clerkUserId", null);
  fastify.decorateRequest("clerkRole", null);
  fastify.decorateRequest("employerId", DEV_EMPLOYER_ID);
  fastify.decorateRequest("workerAccountId", null);

  // ── Auth preHandler hook ──────────────────────────────────────────────────
  // Runs on every request. Extracts and verifies the Clerk Bearer token (when
  // CLERK_SECRET_KEY is configured), then resolves the employer or worker UUID
  // so route handlers can gate access without extra DB round-trips.
  fastify.addHook("preHandler", async (request, _reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      // No token → dev fallback (clerkUserId stays null, employerId stays DEV)
      return;
    }

    const token = authHeader.slice(7);

    let clerkUserId: string | null = null;

    if (!secretKey) {
      // Dev mode without CLERK_SECRET_KEY: skip signature verification.
      // Decode the JWT payload as plain JSON (no crypto check — localhost only).
      try {
        const payloadB64 = token.split(".")[1];
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
        clerkUserId = payload.sub ?? null;
      } catch {
        // Malformed token — leave clerkUserId null.
      }
    } else {
      try {
        const payload = await verifyToken(token, { secretKey });
        clerkUserId = payload.sub;
      } catch {
        // Invalid/expired token — leave clerkUserId null.
        return;
      }
    }

    request.clerkUserId = clerkUserId;
    if (!clerkUserId) return;

    // ── Resolve role from DB ─────────────────────────────────────────────
    // Check employer table first.
    try {
      const [empRow] = await db
        .select({ id: employers.id })
        .from(employers)
        .where(eq(employers.clerk_user_id, clerkUserId));

      if (empRow) {
        request.employerId = empRow.id;
        request.clerkRole = "employer";
        return;
      }

      // Not an employer — check worker table.
      const [wrkRow] = await db
        .select({ id: workerAccounts.id })
        .from(workerAccounts)
        .where(eq(workerAccounts.clerk_user_id, clerkUserId));

      if (wrkRow) {
        request.clerkRole = "worker";
        request.workerAccountId = wrkRow.id;
        // employerId stays as DEV placeholder; requireEmployer guard will
        // reject worker requests before they touch employer-scoped data.
        return;
      }

      // Authenticated but onboarding not yet complete — clerkRole stays null.
    } catch (e) {
      fastify.log.warn({ err: e }, "Failed to resolve role from clerk_user_id");
    }
  });

  // ── Health check ─────────────────────────────────────────────────────────
  fastify.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  // ── Route plugins ─────────────────────────────────────────────────────────
  await fastify.register(authRoutes,      { prefix: "/api/auth"      });
  await fastify.register(configRoutes,    { prefix: "/api/config"    });
  await fastify.register(workerRoutes,    { prefix: "/api/workers"   });
  await fastify.register(payrollRoutes,   { prefix: "/api/payroll"   });
  await fastify.register(cmsRoutes,       { prefix: "/api/content"   });
  await fastify.register(calculateRoutes, { prefix: "/api/calculate" });
  await fastify.register(documentsRoutes, { prefix: "/api/documents" });
  await fastify.register(holidaysRoutes,    { prefix: "/api/holidays"    });
  await fastify.register(employmentsRoutes,   { prefix: "/api/employments"    });
  await fastify.register(workerPortalRoutes,    { prefix: "/api/worker-portal" });
  await fastify.register(employerProfileRoutes, { prefix: "/api/employers"    });

  return fastify;
}
