/**
 * routes/employer-profile.ts
 *
 * GET  /api/employers/me  — fetch the authenticated employer's profile
 * PATCH /api/employers/me — update business_name, rfc, phone, address, email
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { employers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireEmployer } from "../lib/auth-guard.js";

const UpdateProfileSchema = z.object({
  business_name: z.string().max(255).optional(),
  rfc:           z.string().max(13).optional().nullable(),
  phone:         z.string().max(20).optional().nullable(),
  address:       z.string().optional().nullable(),
  email:         z.string().email().max(255).optional().nullable(),
});

const plugin: FastifyPluginAsync = async (fastify) => {

  // GET /api/employers/me
  fastify.get("/me", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;

    const [emp] = await db
      .select()
      .from(employers)
      .where(eq(employers.id, employerId));

    if (!emp) return reply.status(404).send({ error: "Employer not found" });
    return reply.send(emp);
  });

  // PATCH /api/employers/me
  fastify.patch("/me", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const employerId = (req as any).employerId as string;

    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", issues: parsed.error.issues });
    }

    const [updated] = await db
      .update(employers)
      .set({ ...parsed.data, updated_at: new Date() })
      .where(eq(employers.id, employerId))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Employer not found" });
    return reply.send(updated);
  });
};

export default plugin;
