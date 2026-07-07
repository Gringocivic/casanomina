/**
 * pages/WorkerProfile.tsx
 *
 * Add/Edit worker record. If :id is absent ("new"), creates; otherwise loads and edits.
 */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useLanguage } from "../hooks/useLanguage";
import {
  ArrowLeft, Save, User, Shield, DollarSign, Download, Send, Copy,
  CheckCircle2, ChevronDown, AlertTriangle, ExternalLink, Home, Sunset, Palmtree,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { RATES_2026, calculateVacationDays, calculateYearsOfService } from "@casanomina/calculator";
import { ROLES, isCustomRole } from "../lib/roles";

const MIN_SALARY = RATES_2026.minimum_daily_wage_general;

// ── Small helpers used in the IMSS guide ─────────────────────────────────────

function DataRow({ label, value }: { label: string; value: string }) {
  const missing = value.startsWith("⚠");
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${missing ? "text-amber-600" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function Step({
  n, text, link, linkText,
}: {
  n: number; text: string; link?: string; linkText?: string;
}) {
  return (
    <li className="flex gap-3 text-sm text-gray-700">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sage-500 text-white text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="leading-relaxed">
        {text}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1.5 inline-flex items-center gap-0.5 text-terracotta-600 hover:text-terracotta-700 font-medium"
          >
            {linkText ?? link}
            <ExternalLink size={11} />
          </a>
        )}
      </span>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function WorkerProfile() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [saving, setSaving] = useState(false);
  const [savingImss, setSavingImss] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [inviteContact, setInviteContact] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ claim_url: string; invite_contact: string; invite_status: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [imssGuideOpen, setImssGuideOpen] = useState(false);
  const [roleIsCustom, setRoleIsCustom] = useState(false);

  const [vacationTaken, setVacationTaken] = useState(0);

  const [form, setForm] = useState({
    full_name: "",
    start_date: new Date().toISOString().split("T")[0],
    daily_salary: String(MIN_SALARY),
    wage_zone: "general" as "general" | "northern_border",
    pay_frequency: "weekly" as "weekly" | "biweekly" | "monthly",
    days_per_week: "6",
    role: "",
    curp: "",
    imss_nss: "",
    is_imss_registered: false,
    live_in: false,
    notes: "",
  });

  useEffect(() => {
    if (!isNew && id) {
      api.workers.get(id).then((w) => {
        setForm({
          ...w,
          daily_salary: String(w.daily_salary),
          days_per_week: String(w.days_per_week ?? 6),
        } as any);
        // If the stored role is not in the predefined list, show custom input
        if (isCustomRole(w.role)) setRoleIsCustom(true);
      });
      // Load vacation_days_taken from the cards endpoint
      api.workers.cards().then((cards: any[]) => {
        const match = cards.find((c: any) => c.id === id);
        if (match) setVacationTaken(match.vacation_days_taken ?? 0);
      }).catch(() => {});
    }
  }, [id, isNew]);

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, daily_salary: Number(form.daily_salary), days_per_week: Number(form.days_per_week) };
      if (isNew) {
        const w = await api.workers.create(payload);
        navigate(`/workers/${w.id}`);
      } else {
        await api.workers.update(id!, payload);
        navigate(`/workers/${id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  /** Save only the IMSS fields immediately — without touching the rest of the form. */
  async function handleSaveImss() {
    if (isNew || !id) return;
    setSavingImss(true);
    setError(null);
    try {
      await api.workers.update(id, {
        is_imss_registered: form.is_imss_registered,
        imss_nss: form.imss_nss || null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingImss(false);
    }
  }

  async function handleDownloadContract() {
    if (isNew || !id) return;
    setDownloadingContract(true);
    setError(null);
    try {
      await api.documents.generateContract(id);
      window.open(api.documents.contractDownloadUrl(id), "_blank");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloadingContract(false);
    }
  }

  async function handleInvite() {
    if (!id || !inviteContact.trim()) return;
    setInviteLoading(true);
    setError(null);
    try {
      const result = await api.workers.invite(id, inviteContact.trim());
      setInviteResult(result);
      setForm((f) => ({ ...f, invite_status: result.invite_status, invite_contact: result.invite_contact } as any));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleCopyLink() {
    const url = inviteResult?.claim_url
      ? `${window.location.origin}${inviteResult.claim_url}`
      : `${window.location.origin}/claim/${(form as any).invite_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  const minForZone = form.wage_zone === "northern_border"
    ? RATES_2026.minimum_daily_wage_northern_border
    : RATES_2026.minimum_daily_wage_general;

  const belowMin = Number(form.daily_salary) < minForZone;

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew
              ? (lang === "en" ? "Add Worker" : "Agregar Trabajadora")
              : (lang === "en" ? "Worker Profile" : "Perfil de Trabajadora")}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lang === "en" ? "All monetary amounts in MXN" : "Todos los montos en pesos mexicanos (MXN)"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      <div className="space-y-6">
        {/* ── Personal Information ─────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <User size={16} className="text-terracotta-500" />
            <h2 className="font-semibold text-gray-800">
              {lang === "en" ? "Personal Information" : "Informacion Personal"}
            </h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>{lang === "en" ? "Full Name *" : "Nombre Completo *"}</label>
              <input className={fieldClass} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Maria Garcia Lopez" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{lang === "en" ? "Role" : "Puesto"}</label>
                <select
                  className={fieldClass}
                  value={roleIsCustom ? "__other__" : form.role}
                  onChange={(e) => {
                    if (e.target.value === "__other__") {
                      setRoleIsCustom(true);
                      set("role", "");
                    } else {
                      setRoleIsCustom(false);
                      set("role", e.target.value);
                    }
                  }}
                >
                  <option value="">{lang === "en" ? "Select role" : "Seleccionar"}</option>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r[lang]}</option>)}
                  <option value="__other__">{lang === "en" ? "Other (custom)…" : "Otro (personalizado)…"}</option>
                </select>
                {roleIsCustom && (
                  <input
                    type="text"
                    className={fieldClass + " mt-2"}
                    placeholder={lang === "en" ? "Enter role title…" : "Escribe el puesto…"}
                    value={form.role}
                    onChange={(e) => set("role", e.target.value)}
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Start Date *" : "Fecha de Inicio *"}</label>
                <input type="date" className={fieldClass} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>CURP</label>
              <input className={fieldClass} value={form.curp} onChange={(e) => set("curp", e.target.value.toUpperCase())} maxLength={18} placeholder="GAML890101MDFRCR01" />
              <p className="text-xs text-gray-400 mt-1">
                {lang === "en"
                  ? "Required for IMSS registration. 18 characters."
                  : "Necesario para el registro IMSS. 18 caracteres."}
              </p>
            </div>
          </div>
        </Card>

        {/* ── Compensation & Schedule ──────────────────────────── */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <DollarSign size={16} className="text-terracotta-500" />
            <h2 className="font-semibold text-gray-800">
              {lang === "en" ? "Compensation & Schedule" : "Compensacion y Horario"}
            </h2>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {lang === "en" ? "Daily Salary (MXN) *" : "Salario Diario (MXN) *"}
                </label>
                <input
                  type="number"
                  className={`${fieldClass} ${belowMin ? "border-red-300 focus:ring-red-500/40" : ""}`}
                  value={form.daily_salary}
                  min={minForZone}
                  step="0.01"
                  onChange={(e) => set("daily_salary", e.target.value)}
                />
                {belowMin && (
                  <p className="text-red-500 text-xs mt-1">
                    {lang === "en"
                      ? `Below the legal minimum of $${minForZone.toFixed(2)}/day.`
                      : `Por debajo del minimo legal de $${minForZone.toFixed(2)}/dia.`}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Wage Zone" : "Zona Salarial"}</label>
                <select className={fieldClass} value={form.wage_zone} onChange={(e) => set("wage_zone", e.target.value)}>
                  <option value="general">{lang === "en" ? "General (most of Mexico)" : "General (resto del pais)"}</option>
                  <option value="northern_border">{lang === "en" ? "Northern Border Zone (ZLFN)" : "Zona Libre Frontera Norte"}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{lang === "en" ? "Pay Frequency" : "Frecuencia de Pago"}</label>
                <select className={fieldClass} value={form.pay_frequency} onChange={(e) => set("pay_frequency", e.target.value)}>
                  <option value="weekly">{lang === "en" ? "Weekly" : "Semanal"}</option>
                  <option value="biweekly">{lang === "en" ? "Bi-weekly" : "Quincenal"}</option>
                  <option value="monthly">{lang === "en" ? "Monthly" : "Mensual"}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Days per Week" : "Dias por Semana"}</label>
                <select className={fieldClass} value={form.days_per_week} onChange={(e) => set("days_per_week", e.target.value)}>
                  {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{d} {lang === "en" ? "days" : "dias"}</option>)}
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
                  onClick={() => set("live_in", false)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    !(form as any).live_in
                      ? "border-terracotta-500 bg-terracotta-50 text-terracotta-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Sunset size={16} />
                  {lang === "en" ? "Live-out" : "Jornada"}
                </button>
                <button
                  type="button"
                  onClick={() => set("live_in", true)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    (form as any).live_in
                      ? "border-terracotta-500 bg-terracotta-50 text-terracotta-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Home size={16} />
                  {lang === "en" ? "Live-in" : "Casa habitación"}
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* ── IMSS Registration ────────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <Shield size={16} className="text-sage-500" />
            <h2 className="font-semibold text-gray-800">IMSS &amp; Seguro Social</h2>
            {form.is_imss_registered ? (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-sage-700 bg-sage-100 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={12} />
                {lang === "en" ? "Registered" : "Registrada"}
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                <AlertTriangle size={12} />
                {lang === "en" ? "Not registered" : "Sin registrar"}
              </span>
            )}
          </div>

          {!form.is_imss_registered ? (
            /* ── UNREGISTERED STATE ──────────────────────────────── */
            <div className="space-y-4">
              {/* Legal warning */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm font-medium text-amber-800 mb-1">
                  {lang === "en"
                    ? "Registration required within 5 business days (LSS Art. 12)"
                    : "Registro obligatorio en los primeros 5 dias habiles (LSS Art. 12)"}
                </p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  {lang === "en"
                    ? "Without IMSS registration the worker has no access to healthcare, pension, or disability benefits. Employers who fail to register face fines and back-payment of contributions."
                    : "Sin registro, la trabajadora no tiene acceso a atencion medica, pension ni incapacidades. El empleador puede recibir multas y recargos por omision."}
                </p>
              </div>

              {/* Guide toggle */}
              <button
                type="button"
                onClick={() => setImssGuideOpen(!imssGuideOpen)}
                className="flex items-center gap-1.5 text-sm text-terracotta-600 hover:text-terracotta-700 font-medium"
              >
                <ChevronDown
                  size={16}
                  className={`transition-transform ${imssGuideOpen ? "rotate-180" : ""}`}
                />
                {imssGuideOpen
                  ? (lang === "en" ? "Hide guide" : "Ocultar guia")
                  : (lang === "en" ? "How to register — step-by-step guide" : "Como registrar — guia paso a paso")}
              </button>

              {/* Step-by-step guide panel */}
              {imssGuideOpen && (
                <div className="border border-sage-200 bg-sage-50 rounded-xl p-5 space-y-4">
                  <h3 className="font-semibold text-sage-900 text-sm">
                    {lang === "en" ? "IMSS Registration Guide" : "Guia de Inscripcion al IMSS"}
                  </h3>

                  {/* Pre-filled data card */}
                  <div className="bg-white rounded-lg border border-sage-100 p-4 space-y-2.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {lang === "en" ? "Information you will need" : "Informacion que necesitaras"}
                    </p>
                    <DataRow
                      label={lang === "en" ? "Worker name" : "Nombre"}
                      value={form.full_name || (lang === "en" ? "— enter above" : "— ingresa arriba")}
                    />
                    <DataRow
                      label="CURP"
                      value={
                        form.curp
                          ? form.curp
                          : (lang === "en"
                              ? "⚠ Not entered — add it above first"
                              : "⚠ Sin CURP — agregalo arriba antes de registrar")
                      }
                    />
                    <DataRow
                      label={lang === "en" ? "Daily salary" : "Salario diario"}
                      value={`$${Number(form.daily_salary || 0).toFixed(2)} MXN`}
                    />
                    <DataRow
                      label={lang === "en" ? "Start date" : "Fecha de inicio"}
                      value={form.start_date}
                    />
                  </div>

                  {/* Steps */}
                  <ol className="space-y-3.5">
                    <Step
                      n={1}
                      text={
                        lang === "en"
                          ? "Go to the official IMSS portal for domestic workers:"
                          : "Entra al portal oficial del IMSS para trabajadoras del hogar:"
                      }
                      link="https://www.imss.gob.mx/personas-trabajadoras-hogar/inscripcion"
                      linkText={lang === "en" ? "Open IMSS portal →" : "Abrir portal IMSS →"}
                    />
                    <Step
                      n={2}
                      text={
                        lang === "en"
                          ? 'Select "Alta de trabajador del hogar" and sign in with your RFC or e.firma (digital certificate).'
                          : 'Selecciona "Alta de trabajador del hogar" e inicia sesion con tu RFC o e.firma.'
                      }
                    />
                    <Step
                      n={3}
                      text={
                        lang === "en"
                          ? "Enter the worker's data: full name, CURP, start date, and daily salary (shown above)."
                          : "Captura los datos de la trabajadora: nombre completo, CURP, fecha de inicio y salario diario (ver arriba)."
                      }
                    />
                    <Step
                      n={4}
                      text={
                        lang === "en"
                          ? "IMSS will assign an NSS (Numero de Seguridad Social). Write it down and return here to save it."
                          : "El IMSS asignara un NSS (Numero de Seguridad Social). Anotalo y regresa aqui para guardarlo."
                      }
                    />
                    <Step
                      n={5}
                      text={
                        lang === "en"
                          ? "Pay IMSS contributions every two months (bimestrally) via IDSE or SUA. CasaNomina shows the amounts on every payslip."
                          : "Paga las cuotas IMSS cada dos meses (bimestralmente) por IDSE o SUA. CasaNomina muestra los montos en cada recibo de nomina."
                      }
                    />
                  </ol>

                  <p className="text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
                    {lang === "en"
                      ? "💡 Tip: you can also use the IMSS mobile app \"IMSS Digital\" to register and manage contributions."
                      : "💡 Consejo: tambien puedes usar la app movil \"IMSS Digital\" para dar de alta y gestionar las cuotas."}
                  </p>
                </div>
              )}

              {/* Registration complete CTA */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="imss_registered"
                    checked={form.is_imss_registered}
                    onChange={(e) => set("is_imss_registered", e.target.checked)}
                    className="w-4 h-4 text-sage-500 rounded"
                  />
                  <label htmlFor="imss_registered" className="text-sm text-gray-700 cursor-pointer font-medium">
                    {lang === "en"
                      ? "I completed IMSS registration — enter the NSS now"
                      : "Ya complete el registro en el IMSS — ingresar el NSS"}
                  </label>
                </div>
              </div>
            </div>
          ) : (
            /* ── REGISTERED STATE ────────────────────────────────── */
            <div className="space-y-4">
              {/* Benefits summary */}
              <div className="p-4 bg-sage-50 border border-sage-100 rounded-xl">
                <p className="text-xs font-semibold text-sage-700 uppercase tracking-wide mb-2.5">
                  {lang === "en" ? "Worker benefits unlocked" : "Prestaciones activas"}
                </p>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-sage-800">
                  <span>✓ {lang === "en" ? "Medical care (IMSS)" : "Atencion medica"}</span>
                  <span>✓ {lang === "en" ? "Daycare (Guarderias)" : "Guarderias"}</span>
                  <span>✓ {lang === "en" ? "Retirement pension (AFORE)" : "Pension de retiro (AFORE)"}</span>
                  <span>✓ {lang === "en" ? "Disability & life insurance" : "Seguro de invalidez y vida"}</span>
                </div>
              </div>

              {/* NSS field */}
              <div>
                <label className={labelClass}>
                  NSS — {lang === "en" ? "Social Security Number" : "Numero de Seguridad Social"}
                </label>
                <input
                  className={fieldClass}
                  value={form.imss_nss}
                  onChange={(e) => set("imss_nss", e.target.value.replace(/\D/g, ""))}
                  placeholder="00000000000"
                  maxLength={11}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {lang === "en"
                    ? "11 digits, assigned by IMSS when you registered the worker."
                    : "11 digitos, asignado por el IMSS al dar de alta a la trabajadora."}
                </p>
              </div>

              {/* Quick-save IMSS fields */}
              {!isNew && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => set("is_imss_registered", false)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    {lang === "en" ? "Undo — mark as not registered" : "Deshacer — marcar como no registrada"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveImss}
                    disabled={savingImss}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sage-500 hover:bg-sage-600 text-white disabled:opacity-50 transition-colors"
                  >
                    <Save size={12} />
                    {savingImss
                      ? (lang === "en" ? "Saving..." : "Guardando...")
                      : (lang === "en" ? "Save IMSS data" : "Guardar IMSS")}
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Vacation Days ────────────────────────────────────── */}
        {!isNew && (form as any).start_date && (() => {
          const today = new Date().toISOString().split("T")[0];
          const years = calculateYearsOfService((form as any).start_date, today);
          const earned = Math.round(calculateVacationDays(years, RATES_2026) * ((form as any).days_per_week ?? 6) / 6);
          const remaining = Math.max(0, earned - vacationTaken);
          return earned > 0 ? (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Palmtree size={16} className="text-purple-500" />
                <h2 className="font-semibold text-gray-800">
                  {lang === "en" ? "Vacation Days" : "Días de Vacaciones"}
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-purple-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-purple-700">{earned}</p>
                  <p className="text-xs text-purple-600 mt-0.5">{lang === "en" ? "Earned this year" : "Ganados este año"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-gray-600">{vacationTaken}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{lang === "en" ? "Taken" : "Tomados"}</p>
                </div>
                <div className={`p-3 rounded-xl text-center ${remaining > 0 ? "bg-sage-50" : "bg-amber-50"}`}>
                  <p className={`text-2xl font-bold ${remaining > 0 ? "text-sage-700" : "text-amber-600"}`}>{remaining}</p>
                  <p className={`text-xs mt-0.5 ${remaining > 0 ? "text-sage-600" : "text-amber-600"}`}>{lang === "en" ? "Remaining" : "Disponibles"}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {lang === "en"
                  ? `Based on ${Math.floor(years)} year${Math.floor(years) !== 1 ? "s" : ""} of service (LFT Art. 76, 2023 reform). Pay vacation days from the Payroll page.`
                  : `Basado en ${Math.floor(years)} año${Math.floor(years) !== 1 ? "s" : ""} de servicio (LFT Art. 76, reforma 2023). Paga días de vacaciones desde la página de Nómina.`}
              </p>
            </Card>
          ) : null;
        })()}

        {/* ── Notes ───────────────────────────────────────────────── */}
        <Card>
          <label className={labelClass}>{lang === "en" ? "Notes (optional)" : "Notas (opcional)"}</label>
          <textarea
            className={`${fieldClass} h-24 resize-none`}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder={lang === "en" ? "Work schedule details..." : "Detalles del horario..."}
          />
        </Card>

        {/* ── Invite Worker ─────────────────────────────────── */}
        {!isNew && (
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <Send size={16} className="text-terracotta-500" />
              <h2 className="font-semibold text-gray-800">
                {lang === "en" ? "Invite Worker to CasaNomina" : "Invitar Trabajadora a CasaNomina"}
              </h2>
            </div>

            {/* Already claimed */}
            {(form as any).invite_status === "claimed" ? (
              <div className="flex items-center gap-3 p-4 bg-sage-50 border border-sage-100 rounded-xl">
                <CheckCircle2 size={20} className="text-sage-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sage-800 text-sm">
                    {lang === "en" ? "Worker has joined CasaNomina" : "La trabajadora ya se unio a CasaNomina"}
                  </p>
                  <p className="text-xs text-sage-600 mt-0.5">
                    {lang === "en"
                      ? "She can view payslips and contracts in the worker portal."
                      : "Puede ver sus recibos y contratos en el portal de trabajadora."}
                  </p>
                </div>
              </div>
            ) : (inviteResult || (form as any).invite_status === "pending") ? (
              /* Pending invite — show QR + link */
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <Send size={15} className="text-amber-500 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    {lang === "en"
                      ? `Invite sent to ${inviteResult?.invite_contact ?? (form as any).invite_contact}. Share the QR code or link below.`
                      : `Invitacion enviada a ${inviteResult?.invite_contact ?? (form as any).invite_contact}. Comparte el codigo QR o el enlace.`}
                  </p>
                </div>
                {(() => {
                  const claimUrl = inviteResult
                    ? `${window.location.origin}${inviteResult.claim_url}`
                    : `${window.location.origin}/claim/${(form as any).invite_token}`;
                  return (
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-white border border-gray-100 rounded-xl shrink-0">
                        <QRCodeSVG
                          value={claimUrl}
                          size={120}
                          bgColor="#ffffff"
                          fgColor="#1a1a1a"
                          level="M"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-2">
                          {lang === "en"
                            ? "Worker scans with their phone camera to join."
                            : "La trabajadora escanea con su camara para unirse."}
                        </p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-600 truncate"
                            value={claimUrl}
                          />
                          <button
                            onClick={handleCopyLink}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                          >
                            <Copy size={14} />
                            {copied
                              ? (lang === "en" ? "Copied!" : "Copiado!")
                              : (lang === "en" ? "Copy" : "Copiar")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Not yet invited */
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  {lang === "en"
                    ? "Share an invite link so the worker can view their payslips and contract."
                    : "Comparte un enlace de invitacion para que la trabajadora vea sus recibos y contrato."}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500"
                    placeholder={lang === "en" ? "Email or phone number" : "Correo o numero de telefono"}
                    value={inviteContact}
                    onChange={(e) => setInviteContact(e.target.value)}
                  />
                  <button
                    onClick={handleInvite}
                    disabled={!inviteContact.trim() || inviteLoading}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-terracotta-500 hover:bg-terracotta-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    <Send size={14} />
                    {inviteLoading
                      ? (lang === "en" ? "Sending..." : "Enviando...")
                      : (lang === "en" ? "Send Invite" : "Enviar")}
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── Action buttons ───────────────────────────────────── */}
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleSubmit} loading={saving}>
            <Save size={16} />
            {isNew ? (lang === "en" ? "Create Worker" : "Crear Trabajadora") : (lang === "en" ? "Save Changes" : "Guardar Cambios")}
          </Button>
          {!isNew && (
            <Button variant="ghost" onClick={handleDownloadContract} loading={downloadingContract}>
              <Download size={16} />
              {lang === "en" ? "Download Contract (PDF)" : "Descargar Contrato (PDF)"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate(-1)}>
            {lang === "en" ? "Cancel" : "Cancelar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
