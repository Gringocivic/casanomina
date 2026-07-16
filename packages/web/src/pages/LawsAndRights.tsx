/**
 * pages/LawsAndRights.tsx — Screen 5
 *
 * Two tabs: "Laws & Rights" (CMS-driven accordion) + "Glossary" (bilingual term dictionary).
 */
import { useState, useMemo } from "react";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { ChevronDown, ChevronRight, BookOpen, ExternalLink, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";

// ─── Laws & Rights content ────────────────────────────────────────────────────

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

// ─── Glossary data ────────────────────────────────────────────────────────────

interface GlossaryEntry {
  term: string;
  full: { en: string; es: string } | null;  // null if not an acronym
  explanation: { en: string; es: string };
  citation?: string;
}

const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Aguinaldo",
    full: null,
    explanation: {
      en: "Mandatory annual Christmas bonus of at least 15 days of salary, paid no later than December 20th. Prorated if the worker hasn't completed a full year.",
      es: "Bono navideño obligatorio de al menos 15 días de salario, pagado a más tardar el 20 de diciembre. Proporcional si no se ha completado el año.",
    },
    citation: "LFT Art. 87",
  },
  {
    term: "CURP",
    full: { en: "Unique Population Registry Code", es: "Clave Única de Registro de Población" },
    explanation: {
      en: "18-character national identity code assigned to every person born in or residing in Mexico. Required to register a worker with IMSS.",
      es: "Código de identidad nacional de 18 caracteres asignado a toda persona nacida o residente en México. Obligatorio para inscribir a una trabajadora en el IMSS.",
    },
  },
  {
    term: "Finiquito",
    full: null,
    explanation: {
      en: "Final settlement paid when a worker leaves voluntarily or is terminated with justified cause. Includes proportional aguinaldo, unused vacation days, and prima vacacional. Does not include severance pay.",
      es: "Liquidación final pagada cuando la trabajadora renuncia o es despedida con causa justificada. Incluye aguinaldo proporcional, vacaciones no gozadas y prima vacacional. No incluye indemnización.",
    },
    citation: "LFT Arts. 76, 80, 87",
  },
  {
    term: "IDSE",
    full: { en: "IMSS Online Employer Portal", es: "IMSS Desde Su Empresa" },
    explanation: {
      en: "The IMSS online portal where employers register workers, update their SBC, and pay bimestral IMSS contributions.",
      es: "Portal en línea del IMSS donde los patrones inscriben trabajadoras, actualizan el SBC y pagan las cuotas bimestrales.",
    },
  },
  {
    term: "IMSS",
    full: { en: "Mexican Social Security Institute", es: "Instituto Mexicano del Seguro Social" },
    explanation: {
      en: "Mexico's public social security system. Provides health care, maternity, disability, life insurance, and retirement benefits. Employers of domestic workers are legally required to enroll them.",
      es: "Sistema público de seguridad social de México. Cubre salud, maternidad, invalidez, vida y retiro. Los patrones de trabajadoras del hogar están obligados a inscribirlas.",
    },
    citation: "LSS Art. 12",
  },
  {
    term: "INFONAVIT",
    full: { en: "National Workers' Housing Fund", es: "Instituto del Fondo Nacional de la Vivienda para los Trabajadores" },
    explanation: {
      en: "Housing fund to which employers contribute 5% of the worker's SBC each month. Domestic workers have been included since 2019.",
      es: "Fondo de vivienda al que el patrón aporta el 5% del SBC de la trabajadora cada mes. Las trabajadoras del hogar están incluidas desde 2019.",
    },
  },
  {
    term: "ISR",
    full: { en: "Income Tax", es: "Impuesto Sobre la Renta" },
    explanation: {
      en: "Federal income tax withheld by the employer from the worker's wages each pay period and remitted to SAT by the 17th of the following month via SIPARE.",
      es: "Impuesto sobre ingresos que el patrón retiene del salario de la trabajadora en cada periodo y remite al SAT antes del día 17 del mes siguiente via SIPARE.",
    },
    citation: "LISR Art. 96",
  },
  {
    term: "LFT",
    full: { en: "Federal Labor Law", es: "Ley Federal del Trabajo" },
    explanation: {
      en: "Mexico's primary labor law. Chapter XIII specifically covers domestic workers and establishes their rights to aguinaldo, vacation, prima vacacional, IMSS, and more.",
      es: "Principal ley laboral de México. El Capítulo XIII regula específicamente a las trabajadoras del hogar y establece sus derechos a aguinaldo, vacaciones, prima vacacional, IMSS y más.",
    },
  },
  {
    term: "LISR",
    full: { en: "Income Tax Law", es: "Ley del Impuesto Sobre la Renta" },
    explanation: {
      en: "Mexico's income tax law. Art. 96 establishes the employer's obligation to withhold and remit ISR on behalf of workers.",
      es: "Ley del impuesto sobre la renta en México. El Art. 96 establece la obligación del patrón de retener y enterar el ISR a nombre de las trabajadoras.",
    },
  },
  {
    term: "Liquidación",
    full: null,
    explanation: {
      en: "Full severance package owed when an employer fires a worker without justified cause. Includes 3 months of salary, 20 days per year of service, and the seniority premium. Higher than finiquito.",
      es: "Indemnización completa que se debe cuando el patrón despide sin causa justificada. Incluye 3 meses de salario, 20 días por año trabajado y prima de antigüedad. Mayor que el finiquito.",
    },
    citation: "LFT Arts. 50, 162",
  },
  {
    term: "LSS",
    full: { en: "Social Security Law", es: "Ley del Seguro Social" },
    explanation: {
      en: "The law that establishes the Mexican social security system (IMSS) and defines employer contribution obligations.",
      es: "Ley que establece el sistema de seguridad social (IMSS) y define las obligaciones de los patrones.",
    },
  },
  {
    term: "NSS",
    full: { en: "Social Security Number", es: "Número de Seguridad Social" },
    explanation: {
      en: "The 11-digit IMSS affiliation number assigned to a worker when first registered with IMSS. Required for all future IMSS transactions.",
      es: "Número de afiliación de 11 dígitos asignado al inscribir a la trabajadora en el IMSS. Requerido en todos los trámites posteriores.",
    },
  },
  {
    term: "Prima Vacacional",
    full: { en: "Vacation Premium", es: "Prima Vacacional" },
    explanation: {
      en: "An additional payment of at least 25% of the worker's regular salary during their vacation period. Paid on top of vacation wages, not instead of them.",
      es: "Pago adicional de al menos el 25% del salario durante las vacaciones. Se paga además del salario vacacional, no en lugar de él.",
    },
    citation: "LFT Art. 80",
  },
  {
    term: "RFC",
    full: { en: "Federal Taxpayer Registry Code", es: "Registro Federal de Contribuyentes" },
    explanation: {
      en: "Tax identification code issued by SAT. Employers need an RFC to file ISR declarations. Workers may also have one.",
      es: "Código de identificación fiscal emitido por el SAT. Los patrones necesitan RFC para presentar declaraciones de ISR. Las trabajadoras también pueden tenerlo.",
    },
  },
  {
    term: "SAT",
    full: { en: "Tax Administration Service", es: "Servicio de Administración Tributaria" },
    explanation: {
      en: "Mexico's federal tax authority. Receives ISR remittances from employers via SIPARE. Also administers RFC registrations.",
      es: "Autoridad fiscal federal de México. Recibe las retenciones de ISR de los patrones vía SIPARE. También administra los RFC.",
    },
  },
  {
    term: "SBC",
    full: { en: "Contribution Base Salary", es: "Salario Base de Cotización" },
    explanation: {
      en: "The integrated daily salary used to calculate IMSS and INFONAVIT contributions. Slightly higher than the daily wage because it incorporates a factor for proportional aguinaldo, vacation, and prima vacacional.",
      es: "El salario diario integrado usado para calcular las cuotas del IMSS e INFONAVIT. Ligeramente superior al salario diario porque incorpora un factor proporcional de aguinaldo, vacaciones y prima vacacional.",
    },
    citation: "LSS Art. 27",
  },
  {
    term: "Séptimo Día",
    full: { en: "Seventh Day (Weekly Rest Premium)", es: "Séptimo Día" },
    explanation: {
      en: "For every 6 days worked, the worker earns a paid rest day. This is sometimes called the 'seventh day premium' and is built into the weekly salary structure.",
      es: "Por cada 6 días trabajados, la trabajadora tiene derecho a un día de descanso pagado. A veces se llama 'séptimo día' y se incorpora en la estructura del salario semanal.",
    },
    citation: "LFT Art. 69",
  },
  {
    term: "SIPARE",
    full: { en: "Referenced Payment System", es: "Sistema de Pago Referenciado" },
    explanation: {
      en: "SAT's online payment reference platform used for monthly ISR declarations and also accepted for IMSS bimestral contributions.",
      es: "Plataforma de pagos referenciados del SAT usada para declaraciones mensuales de ISR y también aceptada para cuotas bimestrales del IMSS.",
    },
  },
  {
    term: "UMA",
    full: { en: "Unit of Measurement and Update", es: "Unidad de Medida y Actualización" },
    explanation: {
      en: "An annual index value set by INEGI, used as a reference unit for certain legal and financial calculations including IMSS contribution caps. Separated from the minimum wage in 2016 — they are not the same number.",
      es: "Valor de referencia anual fijado por el INEGI, usado en cálculos legales y financieros como los topes de cuotas del IMSS. Se separó del salario mínimo en 2016 — no son el mismo valor.",
    },
  },
  {
    term: "Vacaciones Dignas",
    full: { en: "Dignified Vacation (2023 LFT Reform)", es: "Vacaciones Dignas (Reforma LFT 2023)" },
    explanation: {
      en: "The 2023 reform that doubled minimum vacation entitlement from 6 to 12 days in the first year of service. Named to reflect that dignity means adequate rest, not just a token break.",
      es: "Reforma de 2023 que duplicó el mínimo vacacional de 6 a 12 días en el primer año de servicio. El nombre refleja que la dignidad incluye descanso suficiente, no solo unos días simbólicos.",
    },
    citation: "LFT Art. 76",
  },
];

function GlossaryTab({ lang }: { lang: "en" | "es" }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return GLOSSARY;
    const q = query.toLowerCase();
    return GLOSSARY.filter((e) =>
      e.term.toLowerCase().includes(q) ||
      e.full?.[lang].toLowerCase().includes(q) ||
      e.explanation[lang].toLowerCase().includes(q)
    );
  }, [query, lang]);

  // Group by first letter
  const groups = useMemo(() => {
    const map = new Map<string, GlossaryEntry[]>();
    for (const entry of filtered) {
      const letter = entry.term[0].toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(entry);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === "en" ? "Search terms..." : "Buscar términos..."}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500"
        />
        {query && (
          <button onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
            ×
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-400 py-12 text-sm">
          {lang === "en" ? "No terms match your search." : "Ningún término coincide con tu búsqueda."}
        </p>
      )}

      <div className="space-y-8">
        {groups.map(([letter, entries]) => (
          <div key={letter}>
            <div className="text-xs font-bold text-terracotta-500 uppercase tracking-widest mb-3 pb-1 border-b border-terracotta-100">
              {letter}
            </div>
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.term} className="flex gap-4">
                  <div className="w-36 flex-shrink-0 pt-0.5">
                    <span className="font-bold text-gray-900 text-sm">{entry.term}</span>
                    {entry.citation && (
                      <div className="mt-1">
                        <span className="text-xs text-sage-600 bg-sage-50 border border-sage-100 px-1.5 py-0.5 rounded-lg">
                          {entry.citation}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {entry.full && (
                      <p className="text-xs text-gray-400 mb-1">{entry.full[lang]}</p>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{entry.explanation[lang]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-10 text-center">
        {lang === "en"
          ? `${GLOSSARY.length} terms · LFT Chapter XIII & related legislation`
          : `${GLOSSARY.length} términos · LFT Capítulo XIII y legislación relacionada`}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LawsAndRights() {
  const { lang } = useLanguage();
  const { data: cmsItems, loading } = useApi(() => api.content.all(lang), [lang]);
  const [tab, setTab] = useState<"laws" | "glossary">("laws");

  const items: any[] = cmsItems?.length
    ? cmsItems
    : Object.values(STATIC_CONTENT).map((c) => c[lang]);

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-6">
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

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setTab("laws")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "laws" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {lang === "en" ? "Laws & Rights" : "Leyes y Derechos"}
        </button>
        <button
          onClick={() => setTab("glossary")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "glossary" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {lang === "en" ? "Glossary" : "Glosario"}
        </button>
      </div>

      {tab === "laws" && (
        <>
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
        </>
      )}

      {tab === "glossary" && <GlossaryTab lang={lang} />}
    </div>
  );
}
