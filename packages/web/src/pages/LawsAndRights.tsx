/**
 * pages/LawsAndRights.tsx — Screen 5
 *
 * CMS-driven bilingual accordion with all LFT Chapter XIII obligations.
 * Content is fetched from /api/content/:lang (seeded in db/seed.ts).
 * Falls back to static content if the API is unavailable.
 */
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { ChevronDown, ChevronRight, BookOpen, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";

// Static fallback content (shown while the API loads or if it fails)
const STATIC_CONTENT: Record<string, { en: any; es: any }> = {
  "rights.aguinaldo": {
    en: { title: "Christmas Bonus (Aguinaldo)", legal_citation: "LFT Art. 87",
          body: "Every worker is entitled to an annual bonus of at least **15 days of salary**, paid by December 20th. Prorated for partial years." },
    es: { title: "Aguinaldo", legal_citation: "LFT Art. 87",
          body: "Todo trabajador tiene derecho a un aguinaldo de al menos **15 días de salario**, pagado antes del 20 de diciembre. Proporcional para años incompletos." },
  },
  "rights.vacaciones": {
    en: { title: "Paid Vacation (Vacaciones Dignas)", legal_citation: "LFT Art. 76",
          body: "After 1 year of service: **12 days minimum** (doubled from 6 by the 2023 reform). Increases by 2 days per year until 20 days, then +2 days every 5 years." },
    es: { title: "Vacaciones Pagadas (Vacaciones Dignas)", legal_citation: "LFT Art. 76",
          body: "Después de 1 año: **mínimo 12 días** (duplicado de 6 por la reforma 2023). Aumenta 2 días por año hasta 20, luego +2 días cada 5 años." },
  },
  "rights.prima_vacacional": {
    en: { title: "Vacation Premium (Prima Vacacional)", legal_citation: "LFT Art. 80",
          body: "Workers receive a vacation premium of at least **25% extra** on top of their regular vacation pay." },
    es: { title: "Prima Vacacional", legal_citation: "LFT Art. 80",
          body: "Los trabajadores reciben una prima vacacional de al menos el **25% adicional** sobre el salario durante las vacaciones." },
  },
  "rights.imss": {
    en: { title: "IMSS Registration (Required)", legal_citation: "LSS Art. 12",
          body: "As an employer, you are **legally required** to register domestic workers with IMSS. Covers medical care, maternity, disability, life insurance, and retirement." },
    es: { title: "Inscripción al IMSS (Obligatoria)", legal_citation: "LSS Art. 12",
          body: "Como patrón, estás **legalmente obligado** a inscribir a la trabajadora del hogar en el IMSS. Cubre salud, maternidad, invalidez, vida y retiro." },
  },
  "rights.dias_festivos": {
    en: { title: "Mandatory Rest Days", legal_citation: "LFT Arts. 74-75",
          body: "7 mandatory paid holidays in 2026. If the worker works on any of these days, they must receive **triple pay**." },
    es: { title: "Días de Descanso Obligatorio", legal_citation: "LFT Arts. 74-75",
          body: "7 días de descanso obligatorio en 2026. Si la trabajadora labora en estos días, tiene derecho a **pago triple**." },
  },
};

function AccordionItem({ item, defaultOpen = false }: { item: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} className="text-terracotta-500 flex-shrink-0" />
                : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
          <span className="font-semibold text-gray-900">{item.title}</span>
        </div>
        {item.legal_citation && (
          <span className="text-xs text-sage-600 bg-sage-50 border border-sage-100 px-2 py-1 rounded-lg flex-shrink-0 ml-4">
            {item.legal_citation}
          </span>
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-100">
          <div className="pt-4 prose prose-sm prose-gray max-w-none text-gray-700">
            <ReactMarkdown>{item.body}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export function LawsAndRights() {
  const { lang } = useLanguage();
  const { data: cmsItems, loading, error } = useApi(() => api.content.all(lang), [lang]);

  // Build display list: use CMS data if available, fall back to static
  const items: any[] = cmsItems?.length
    ? cmsItems
    : Object.values(STATIC_CONTENT).map((c) => c[lang]);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={20} className="text-terracotta-500" />
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === "en" ? "Laws & Rights" : "Leyes y Derechos"}
          </h1>
        </div>
        <p className="text-gray-500 text-sm">
          {lang === "en"
            ? "Your obligations as a household employer under Mexican law (LFT Chapter XIII)."
            : "Tus obligaciones como patrón doméstico bajo la ley mexicana (LFT Capítulo XIII)."}
        </p>
      </div>

      {/* Worker dignity notice */}
      <Card className="mb-6 bg-sage-50 border-sage-100">
        <p className="text-sage-800 text-sm">
          {lang === "en"
            ? "🌿 CasaNomina is built on the belief that domestic workers deserve the same legal protections as any other worker. These are not optional perks — they are rights guaranteed by Mexican law."
            : "🌿 CasaNomina se construyó con la convicción de que las trabajadoras del hogar merecen las mismas protecciones legales que cualquier otro trabajador. Estos no son beneficios opcionales — son derechos garantizados por la ley mexicana."}
        </p>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item: any, i: number) => (
            <AccordionItem key={item.content_key ?? item.title} item={item} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {/* External resources */}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <h2 className="font-semibold text-gray-700 mb-3 text-sm">
          {lang === "en" ? "Official Resources" : "Recursos Oficiales"}
        </h2>
        <div className="space-y-2">
          {[
            { label: "Ley Federal del Trabajo — DOF", url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf" },
            { label: "IMSS — Programa Trabajadoras del Hogar", url: "https://www.imss.gob.mx/patrones/trabajadoras-del-hogar" },
            { label: "CONASAMI — Salarios Mínimos 2026", url: "https://www.gob.mx/conasami" },
          ].map(({ label, url }) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-terracotta-600 hover:text-terracotta-800">
              <ExternalLink size={13} />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
