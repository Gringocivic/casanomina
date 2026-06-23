/**
 * routes/cms.ts
 *
 * GET  /api/content/:lang            — all published content in a language (public)
 * GET  /api/content/:lang/:key       — one content block (public)
 * POST /api/content                  — create/update a content block (employer/admin only)
 */
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { cmsContent } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireEmployer } from "../lib/auth-guard.js";

const plugin: FastifyPluginAsync = async (fastify) => {

  fastify.get<{ Params: { lang: string } }>("/:lang", async (req) => {
    const { lang } = req.params;
    return db.select().from(cmsContent).where(
      and(eq(cmsContent.language, lang), eq(cmsContent.is_published, true))
    );
  });

  fastify.get<{ Params: { lang: string; key: string } }>("/:lang/:key", async (req, reply) => {
    const { lang, key } = req.params;
    const [item] = await db.select().from(cmsContent).where(
      and(eq(cmsContent.language, lang), eq(cmsContent.content_key, key), eq(cmsContent.is_published, true))
    );
    if (!item) return reply.status(404).send({ error: "Content not found" });
    return item;
  });

  const ContentSchema = z.object({
    content_key:    z.string().min(3).max(200),
    language:       z.enum(["en", "es"]),
    title:          z.string().min(1),
    body:           z.string().min(1),
    legal_citation: z.string().optional(),
    is_published:   z.boolean().default(true),
  });

  // POST /api/content — employer/admin only
  fastify.post("/", async (req, reply) => {
    if (!requireEmployer(req, reply)) return;
    const body = ContentSchema.parse(req.body);
    const [created] = await db.insert(cmsContent).values(body).returning();
    return reply.status(201).send(created);
  });
};

export default plugin;
