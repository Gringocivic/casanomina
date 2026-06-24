/**
 * pages/WorkerOnboarding.tsx
 *
 * 5-step wizard for adding a new worker:
 *   1 Info     — name, CURP, role, start date
 *   2 Terms    — salary, schedule, live-in/out  →  creates worker in DB
 *   3 Contract — summary of agreed terms (PDF available from profile later)
 *   4 IMSS     — guided registration or skip
 *   5 Invite   — send app invite or skip
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useLanguage } from "../hooks/useLanguage";
import { RATES_2026 } from "@casanomina/calculator";
import {
  User, DollarSign, FileText, Shield, Send,
  CheckCircle2, ChevronRight, ExternalLink, ArrowLeft,
  Home, Sunset, ChevronDown, Save, Copy,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_WAGE_GENERAL = RATES_2026.minimum_daily_wage_general;
const MIN_WAGE_BORDER  = RATES_2026.minimum_daily_wage_northern_border;

const ROLES = [
  { value: "housekeeper", en: "Housekeeper",       es: "Ama de llaves" },
  { value: "nanny",       en: "Nanny / Caregiver", es: "Niñera / Cuidadora" },
  { value: "cook",        en: "Cook",               es: "Cocinera" },
  { value: "gardener",    en: "Gardener",            es: "Jardinero" },
  { value: "driver",      en: "Driver",              es: "Chofer" },
  { value: "caregiver",   en: "Elder Caregiver",    es: "Cuidadora de adultos" },
];

const STEPS = [
  { icon: User,     en: "Info",     es: "Datos" },
  { icon: DollarSign, en: "Terms", es: "Términos" },
  { icon: FileText, en: "Contract", es: "Contrato" },
  { icon: Shield,   en: "IMSS",    es: "IMSS" },
  { icon: Send,     en: "Invite",  es: "Invitar" },
];

// ── Step progress indicator ───────────────────────────────────────────────────

function StepBar({ current, lang }: { current: number; lang: "en" | "es" }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done    = n < current;
        const active  = n === current;
        const Icon    = s.icon;
        return (
          <div key={n} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                done   ? "bg-sage-500 text-white" :
                active ? "bg-terracotta-500 text-white ring-4 ring-terracotta-100" :
                         "bg-gray-100 text-gray-400"
              }`}>
                {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </div>
              <span className={`text-xs mt-1.5 font-medium truncate max-w-[56px] text-center ${
                active ? "text-terracotta-600" : done ? "text-sage-600" : "text-gray-400"
              }`}>
                {s[lang]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-5 transition-colors ${done ? "bg-sage-300" : "bg-gray-100"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Term row (used in step 3 summary) ────────────────────────────────────────

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function WorkerOnboarding() {
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [step, setStep]           = useState(1);
  const [workerId, setWorkerId]   = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Step 1 — Info
  const [info, setInfo] = useState({
    full_name:  "",
    role:       "",
    start_date: new Date().toISOString().split("T")[0],
    curp:       "",
  });

  // Step 2 — Terms
  const [terms, setTerms] = useState({
    daily_salary:  String(MIN_WAGE_GENERAL),
    wage_zone:     "general" as "general" | "northern_border",
    pay_frequency: "weekly" as "weekly" | "biweekly" | "monthly",
    days_per_week: "6",
    live_in:       false,
  });

  // Step 4 — IMSS
  const [imssGuideOpen, setImssGuideOpen]     = useState(false);
  const [imssRegistered, setImssRegistered]   = useState(false);
  const [imssNss, setImssNss]                 = useState("");
  const [savingImss, setSavingImss]           = useState(false);

  // Step 5 — Invite
  const [inviteContact, setInviteContact]     = useState("");
  const [inviteLoading, setInviteLoading]     = useState(false);
  const [inviteResult, setInviteResult]       = useState<{ claim_url: string } | null>(null);
  const [copied, setCopied]                   = useState(false);

  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  const minForZone = terms.wage_zone === "northern_border" ? MIN_WAGE_BORDER : MIN_WAGE_GENERAL;
  const belowMin   = Number(terms.daily_salary) < minForZone;

  // ── Step transitions ──────────────────────────────────────────────────────

  function canAdvanceStep1() {
    return info.full_name.trim().length > 0 && info.start_date.length > 0;
  }

  function canAdvanceStep2() {
    return Number(terms.daily_salary) >= minForZone && Number(terms.days_per_week) > 0;
  }

  /** Called when advancing from Step 2 → 3. Creates the worker in the DB. */
  async function createWorker() {
    setSaving(true);
    setError(null);
    try {
      const w = await api.workers.create({
        ...info,
        daily_salary:  Number(terms.daily_salary),
        wage_zone:     terms.wage_zone,
        pay_frequency: terms.pay_frequency,
        days_per_week: Number(terms.days_per_week),
        live_in:       terms.live_in,
      });
      setWorkerId(w.id);
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveImssAndContinue() {
    if (!workerId) return;
    setSavingImss(true);
    setError(null);
    try {
      await api.workers.update(workerId, {
        is_imss_registered: true,
        imss_nss: imssNss || null,
      });
      setStep(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingImss(false);
    }
  }

  async function sendInvite() {
    if (!workerId || !inviteContact.trim()) return;
    setInviteLoading(true);
    setError(null);
    try {
      const result = await api.workers.invite(workerId, inviteContact.trim());
      setInviteResult({ claim_url: result.claim_url });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  function finish() {
    navigate(workerId ? `/workers/${workerId}` : "/workers");
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function freqLabel(f: string) {
    const map: Record<string, Record<string, string>> = {
      weekly:   { en: "Weekly",   es: "Semanal" },
      biweekly: { en: "Bi-weekly", es: "Quincenal" },
      monthly:  { en: "Monthly",  es: "Mensual" },
    };
    return map[f]?.[lang] ?? f;
  }

  const claimUrl = inviteResult
    ? `${window.location.origin}${inviteResult.claim_url}`
    : "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => (step > 1 ? setStep(step - 1) : navigate("/workers"))} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {lang === "en" ? "Add New Worker" : "Alta de Trabajadora"}
          </h1>
          <p className="text-gray-400 text-sm">
            {lang === "en" ? `Step ${step} of ${STEPS.length}` : `Paso ${step} de ${STEPS.length}`}
          </p>
        </div>
      </div>

      {/* Step progress */}
      <StepBar current={step} lang={lang} />

      {/* Error banner */}
      {error && (
        <div className="mb-5 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {/* ── STEP 1: Info ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <User size={16} className="text-terracotta-500" />
            <h2 className="font-semibold text-gray-800">
              {lang === "en" ? "Worker Information" : "Datos de la Trabajadora"}
            </h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>{lang === "en" ? "Full Name *" : "Nombre Completo *"}</label>
              <input
                className={fieldClass}
                placeholder="María García López"
                value={info.full_name}
                onChange={(e) => setInfo({ ...info, full_name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{lang === "en" ? "Role" : "Puesto"}</label>
                <select className={fieldClass} value={info.role} onChange={(e) => setInfo({ ...info, role: e.target.value })}>
                  <option value="">{lang === "en" ? "Select…" : "Seleccionar…"}</option>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r[lang]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Start Date *" : "Fecha de Inicio *"}</label>
                <input type="date" className={fieldClass} value={info.start_date} onChange={(e) => setInfo({ ...info, start_date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelClass}>CURP</label>
              <input
                className={fieldClass}
                placeholder="GAML890101MDFRCR01"
                maxLength={18}
                value={info.curp}
                onChange={(e) => setInfo({ ...info, curp: e.target.value.toUpperCase() })}
              />
              <p className="text-xs text-gray-400 mt-1">
                {lang === "en"
                  ? "Required for IMSS registration (Step 4)."
                  : "Necesario para el registro IMSS (Paso 4)."}
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!canAdvanceStep1()}>
              {lang === "en" ? "Continue" : "Continuar"}
              <ChevronRight size={16} />
            </Button>
          </div>
        </Card>
      )}

      {/* ── STEP 2: Terms ─────────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <DollarSign size={16} className="text-terracotta-500" />
            <h2 className="font-semibold text-gray-800">
              {lang === "en" ? "Employment Terms" : "Condiciones de Trabajo"}
            </h2>
          </div>
          <div className="space-y-4">
            {/* Salary + zone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{lang === "en" ? "Daily Salary (MXN) *" : "Salario Diario (MXN) *"}</label>
                <input
                  type="number"
                  className={`${fieldClass} ${belowMin ? "border-red-300" : ""}`}
                  value={terms.daily_salary}
                  min={minForZone}
                  step="0.01"
                  onChange={(e) => setTerms({ ...terms, daily_salary: e.target.value })}
                />
                {belowMin && (
                  <p className="text-red-500 text-xs mt-1">
                    {lang === "en" ? `Min $${minForZone.toFixed(2)}/day` : `Mín $${minForZone.toFixed(2)}/día`}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Wage Zone" : "Zona Salarial"}</label>
                <select className={fieldClass} value={terms.wage_zone} onChange={(e) => setTerms({ ...terms, wage_zone: e.target.value as any })}>
                  <option value="general">{lang === "en" ? "General (most of Mexico)" : "General (resto del país)"}</option>
                  <option value="northern_border">{lang === "en" ? "Northern Border (ZLFN)" : "Zona Libre Frontera Norte"}</option>
                </select>
              </div>
            </div>

            {/* Frequency + days */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{lang === "en" ? "Pay Frequency" : "Frecuencia de Pago"}</label>
                <select className={fieldClass} value={terms.pay_frequency} onChange={(e) => setTerms({ ...terms, pay_frequency: e.target.value as any })}>
                  <option value="weekly">{lang === "en" ? "Weekly" : "Semanal"}</option>
                  <option value="biweekly">{lang === "en" ? "Bi-weekly" : "Quincenal"}</option>
                  <option value="monthly">{lang === "en" ? "Monthly" : "Mensual"}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Days per Week" : "Días por Semana"}</label>
                <select className={fieldClass} value={terms.days_per_week} onChange={(e) => setTerms({ ...terms, days_per_week: e.target.value })}>
                  {[1,2,3,4,5,6,7].map((d) => (
                    <option key={d} value={d}>{d} {lang === "en" ? "days" : "días"}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live-in / Live-out */}
            <div>
              <label className={labelClass}>
                {lang === "en" ? "Accommodation" : "Alojamiento"}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTerms({ ...terms, live_in: false })}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    !terms.live_in
                      ? "border-terracotta-500 bg-terracotta-50 text-terracotta-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Sunset size={16} />
                  {lang === "en" ? "Live-out" : "Jornada"}
                </button>
                <button
                  type="button"
                  onClick={() => setTerms({ ...terms, live_in: true })}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    terms.live_in
                      ? "border-terracotta-500 bg-terracotta-50 text-terracotta-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Home size={16} />
                  {lang === "en" ? "Live-in" : "Casa habitación"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {terms.live_in
                  ? (lang === "en"
                      ? "Worker resides in the household. Meals and lodging are provided."
                      : "La trabajadora vive en el domicilio. Se proporcionan alimentos y hospedaje.")
                  : (lang === "en"
                      ? "Worker commutes daily and does not reside in the household."
                      : "La trabajadora acude diariamente y no vive en el domicilio.")}
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={16} />
              {lang === "en" ? "Back" : "Atrás"}
            </Button>
            <Button onClick={createWorker} loading={saving} disabled={!canAdvanceStep2() || saving}>
              {lang === "en" ? "Agree & Continue" : "Acordar y Continuar"}
              <ChevronRight size={16} />
            </Button>
          </div>
        </Card>
      )}

      {/* ── STEP 3: Contract ──────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <FileText size={16} className="text-terracotta-500" />
              <h2 className="font-semibold text-gray-800">
                {lang === "en" ? "Agreed Terms" : "Condiciones Acordadas"}
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {lang === "en"
                ? "Review these terms with your worker. Both parties should agree before starting work."
                : "Revisa estos términos con tu trabajadora. Ambas partes deben acordar antes de iniciar."}
            </p>
            <div className="bg-gray-50 rounded-xl p-4">
              <TermRow label={lang === "en" ? "Worker" : "Trabajadora"} value={info.full_name} />
              {info.role && (
                <TermRow
                  label={lang === "en" ? "Role" : "Puesto"}
                  value={ROLES.find((r) => r.value === info.role)?.[lang] ?? info.role}
                />
              )}
              <TermRow label={lang === "en" ? "Start date" : "Fecha de inicio"} value={info.start_date} />
              <TermRow
                label={lang === "en" ? "Daily salary" : "Salario diario"}
                value={`$${Number(terms.daily_salary).toFixed(2)} MXN`}
              />
              <TermRow label={lang === "en" ? "Pay frequency" : "Frecuencia de pago"} value={freqLabel(terms.pay_frequency)} />
              <TermRow
                label={lang === "en" ? "Days per week" : "Días por semana"}
                value={`${terms.days_per_week} ${lang === "en" ? "days" : "días"}`}
              />
              <TermRow
                label={lang === "en" ? "Accommodation" : "Alojamiento"}
                value={terms.live_in
                  ? (lang === "en" ? "Live-in (casa habitación)" : "Casa habitación")
                  : (lang === "en" ? "Live-out (daily commute)" : "Jornada (sin hospedaje)")}
              />
              {info.curp && (
                <TermRow label="CURP" value={info.curp} />
              )}
            </div>
          </Card>

          <div className="p-4 bg-sage-50 border border-sage-100 rounded-xl text-sm text-sage-800">
            <p className="font-medium mb-1">
              {lang === "en" ? "About the employment contract" : "Sobre el contrato laboral"}
            </p>
            <p className="text-sage-700 leading-relaxed">
              {lang === "en"
                ? "Once onboarding is complete, download the employment contract PDF from the worker's profile. Both parties should sign and keep a copy."
                : "Al terminar el alta, descarga el contrato laboral en PDF desde el perfil de la trabajadora. Ambas partes deben firmarlo y conservar una copia."}
            </p>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={16} />
              {lang === "en" ? "Back" : "Atrás"}
            </Button>
            <Button onClick={() => setStep(4)}>
              {lang === "en" ? "Confirm & Continue" : "Confirmar y Continuar"}
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: IMSS ──────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <Shield size={16} className="text-sage-500" />
              <h2 className="font-semibold text-gray-800">IMSS &amp; Seguro Social</h2>
            </div>

            {/* Legal notice */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
              <p className="text-sm font-medium text-amber-800 mb-1">
                {lang === "en"
                  ? "Registration required within 5 business days (LSS Art. 12)"
                  : "Registro obligatorio en los primeros 5 días hábiles (LSS Art. 12)"}
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                {lang === "en"
                  ? "Without IMSS the worker has no healthcare, pension, or disability coverage. Fines apply to employers who fail to register."
                  : "Sin IMSS la trabajadora no tiene cobertura médica, pensión ni incapacidades. El empleador puede recibir multas."}
              </p>
            </div>

            {/* Guide toggle */}
            <button
              type="button"
              onClick={() => setImssGuideOpen(!imssGuideOpen)}
              className="flex items-center gap-1.5 text-sm text-terracotta-600 hover:text-terracotta-700 font-medium mb-4"
            >
              <ChevronDown size={16} className={`transition-transform ${imssGuideOpen ? "rotate-180" : ""}`} />
              {imssGuideOpen
                ? (lang === "en" ? "Hide guide" : "Ocultar guía")
                : (lang === "en" ? "How to register — step-by-step" : "Cómo registrar — paso a paso")}
            </button>

            {/* Guide panel */}
            {imssGuideOpen && (
              <div className="border border-sage-200 bg-sage-50 rounded-xl p-4 mb-4 space-y-3">
                {/* Pre-filled data */}
                <div className="bg-white rounded-lg border border-sage-100 p-3 space-y-2 text-xs">
                  <p className="font-semibold text-gray-500 uppercase tracking-wide">
                    {lang === "en" ? "Information you will need" : "Información necesaria"}
                  </p>
                  <div className="flex justify-between"><span className="text-gray-500">{lang === "en" ? "Name" : "Nombre"}</span><span className="font-medium">{info.full_name}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">CURP</span>
                    <span className={`font-medium ${!info.curp ? "text-amber-600" : ""}`}>
                      {info.curp || (lang === "en" ? "⚠ Not entered" : "⚠ No ingresado")}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">{lang === "en" ? "Salary" : "Salario"}</span><span className="font-medium">${Number(terms.daily_salary).toFixed(2)}/día</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{lang === "en" ? "Start date" : "Inicio"}</span><span className="font-medium">{info.start_date}</span></div>
                </div>
                <ol className="space-y-2.5">
                  {[
                    { text: lang === "en" ? "Go to the IMSS domestic workers portal:" : "Accede al portal del IMSS para trabajadoras del hogar:", link: "https://www.imss.gob.mx/personas-trabajadoras-hogar/inscripcion", linkText: lang === "en" ? "Open portal →" : "Abrir portal →" },
                    { text: lang === "en" ? "Sign in with your RFC or e.firma and select \"Alta de trabajador del hogar\"." : "Inicia sesión con tu RFC o e.firma y selecciona \"Alta de trabajador del hogar\"." },
                    { text: lang === "en" ? "Enter the worker's data (shown above)." : "Captura los datos de la trabajadora (ver arriba)." },
                    { text: lang === "en" ? "IMSS will assign an NSS. Enter it below and click Save." : "El IMSS asignará un NSS. Ingrésalo abajo y guarda." },
                  ].map((item, idx) => (
                    <li key={idx} className="flex gap-2.5 text-sm text-gray-700">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage-500 text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                      <span>{item.text}{item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-terracotta-600 font-medium">
                          {item.linkText}<ExternalLink size={11} />
                        </a>
                      )}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Toggle: already registered */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="imss_done"
                  checked={imssRegistered}
                  onChange={(e) => setImssRegistered(e.target.checked)}
                  className="w-4 h-4 rounded text-sage-500"
                />
                <label htmlFor="imss_done" className="text-sm text-gray-700 cursor-pointer font-medium">
                  {lang === "en"
                    ? "I completed IMSS registration — enter NSS"
                    : "Ya completé el registro — ingresar NSS"}
                </label>
              </div>
              {imssRegistered && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">NSS</label>
                  <input
                    className={fieldClass + " w-48"}
                    placeholder="00000000000"
                    maxLength={11}
                    value={imssNss}
                    onChange={(e) => setImssNss(e.target.value.replace(/\D/g, ""))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {lang === "en" ? "11 digits, assigned by IMSS." : "11 dígitos, asignado por el IMSS."}
                  </p>
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-between flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep(3)}>
              <ArrowLeft size={16} />
              {lang === "en" ? "Back" : "Atrás"}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(5)}>
                {lang === "en" ? "Skip for now" : "Omitir por ahora"}
              </Button>
              {imssRegistered ? (
                <Button onClick={saveImssAndContinue} loading={savingImss}>
                  <Save size={15} />
                  {lang === "en" ? "Save & Continue" : "Guardar y Continuar"}
                </Button>
              ) : (
                <Button onClick={() => setStep(5)}>
                  {lang === "en" ? "Continue" : "Continuar"}
                  <ChevronRight size={16} />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 5: Invite ────────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <Send size={16} className="text-terracotta-500" />
              <h2 className="font-semibold text-gray-800">
                {lang === "en" ? "Invite to CasaNomina" : "Invitar a CasaNomina"}
              </h2>
            </div>

            {!inviteResult ? (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  {lang === "en"
                    ? `Share an invite link with ${info.full_name} so they can view their payslips and contract.`
                    : `Comparte un enlace con ${info.full_name} para que pueda ver sus recibos y contrato.`}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500"
                    placeholder={lang === "en" ? "Email or phone number" : "Correo o número de teléfono"}
                    value={inviteContact}
                    onChange={(e) => setInviteContact(e.target.value)}
                    autoFocus
                  />
                  <Button onClick={sendInvite} loading={inviteLoading} disabled={!inviteContact.trim()}>
                    <Send size={14} />
                    {lang === "en" ? "Send" : "Enviar"}
                  </Button>
                </div>
              </>
            ) : (
              /* Invite sent — show QR */
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-sage-50 border border-sage-100 rounded-xl">
                  <CheckCircle2 size={16} className="text-sage-500" />
                  <p className="text-sm text-sage-800 font-medium">
                    {lang === "en" ? "Invite sent!" : "¡Invitación enviada!"}
                  </p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-white border border-gray-100 rounded-xl shrink-0">
                    <QRCodeSVG value={claimUrl} size={108} bgColor="#ffffff" fgColor="#1a1a1a" level="M" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-2">
                      {lang === "en"
                        ? "Worker scans with phone camera or opens the link."
                        : "La trabajadora escanea con su cámara o abre el enlace."}
                    </p>
                    <div className="flex gap-2">
                      <input readOnly className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs bg-gray-50 text-gray-600 truncate" value={claimUrl} />
                      <button
                        onClick={() => { navigator.clipboard.writeText(claimUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50 transition-colors shrink-0"
                      >
                        <Copy size={12} />
                        {copied ? (lang === "en" ? "Copied!" : "Copiado!") : (lang === "en" ? "Copy" : "Copiar")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Completion card */}
          <div className="p-5 bg-sage-50 border border-sage-100 rounded-xl text-center space-y-3">
            <CheckCircle2 size={32} className="text-sage-500 mx-auto" />
            <div>
              <p className="font-semibold text-sage-900">
                {lang === "en"
                  ? `${info.full_name} has been added!`
                  : `¡${info.full_name} ha sido dada de alta!`}
              </p>
              <p className="text-sm text-sage-700 mt-1">
                {lang === "en"
                  ? "Download the contract PDF and run the first payroll from the worker profile."
                  : "Descarga el contrato en PDF y corre la primera nómina desde el perfil de la trabajadora."}
              </p>
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              <Button onClick={finish}>
                {lang === "en" ? "View Worker Profile" : "Ver Perfil"}
                <ChevronRight size={16} />
              </Button>
              {!inviteResult && (
                <Button variant="ghost" onClick={finish}>
                  {lang === "en" ? "Skip invite for now" : "Omitir invitación"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
