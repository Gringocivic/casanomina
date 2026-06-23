/**
 * routes/misc.ts
 *
 * GET /api/holidays/:year      — Mandatory holidays from rate config
 * GET /api/cms/:lang           — All published CMS content for a language (en|es)
 * GET /api/cms/:lang/:key      — Single content item
 * POST /api/cms                — Admin: create/upsert a CMS entry
 */
import type { FastifyPluginAsync } from "fastify";
import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { rateConfigs, cmsContent } from "../db/schema.js";

export const miscRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/holidays/:year
  fastify.get<{ Params: { year: string } }>("/holidays/:year", async (req, reply) => {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) return reply.status(400).send({ error: "year must be a number" });

    const [config] = await db
      .select()
      .from(rateConfigs)
      .where(eq(rateConfigs.year, year))
      .orderBy(desc(rateConfigs.effective_date))
      .limit(1);

    if (!config) return reply.status(404).send({ error: `No config for year ${year}` });

    const data = config.config_data as Record<string, unknown>;
    const holidays = data["mandatory_holidays"] ?? [];

    return { year, holidays };
  });

  // GET /api/cms/:lang — all published content for a language
  fastify.get<{ Params: { lang: string } }>("/cms/:lang", async (req, reply) => {
    const lang = req.params.lang === "es" ? "es" : "en";
    const items = await db
      .select()
      .from(cmsContent)
      .where(and(eq(cmsContent.language, lang), eq(cmsContent.is_published, true)))
      .orderBy(asc(cmsContent.content_key));
    return { language: lang, items };
  });

  // GET /api/cms/:lang/:key — single content item
  fastify.get<{ Params: { lang: string; key: string } }>("/cms/:lang/:key", async (req, reply) => {
    const lang = req.params.lang === "es" ? "es" : "en";
    const [item] = await db
      .select()
      .from(cmsContent)
      .where(and(
        eq(cmsContent.language, lang),
        eq(cmsContent.content_key, req.params.key),
      ));
    if (!item) return reply.status(404).send({ error: "Content not found" });
    return { item };
  });

  // POST /api/cms — create or upsert (admin)
  fastify.post("/cms", async (req, reply) => {
    const body = req.body as {
      content_key: string;
      language: string;
      title: string;
      body: string;
      legal_citation?: string;
    };
    const [created] = await db
      .insert(cmsContent)
      .values({
        content_key:    body.content_key,
        language:       body.language,
        title:          body.title,
        body:           body.body,
        legal_citation: body.legal_citation ?? null,
      })
      .returning();
    return reply.status(201).send({ item: created });
  });
};
