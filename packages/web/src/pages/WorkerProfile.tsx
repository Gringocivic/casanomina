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
import { ArrowLeft, Save, User, Shield, DollarSign, Download, Send, Copy, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { RATES_2026 } from "@casanomina/calculator";

const MIN_SALARY = RATES_2026.minimum_daily_wage_general;

export function WorkerProfile() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [inviteContact, setInviteContact] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ claim_url: string; invite_contact: string; invite_status: string } | null>(null);
  const [copied, setCopied] = useState(false);
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
      });
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
                <select className={fieldClass} value={form.role} onChange={(e) => set("role", e.target.value)}>
                  <option value="">{lang === "en" ? "Select role" : "Seleccionar"}</option>
                  <option value="housekeeper">{lang === "en" ? "Housekeeper" : "Ama de llaves"}</option>
                  <option value="nanny">{lang === "en" ? "Nanny / Caregiver" : "Ninera / Cuidadora"}</option>
                  <option value="cook">{lang === "en" ? "Cook" : "Cocinera"}</option>
                  <option value="gardener">{lang === "en" ? "Gardener" : "Jardinero"}</option>
                  <option value="driver">{lang === "en" ? "Driver" : "Chofer"}</option>
                  <option value="caregiver">{lang === "en" ? "Elder Caregiver" : "Cuidadora de adultos"}</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>{lang === "en" ? "Start Date *" : "Fecha de Inicio *"}</label>
                <input type="date" className={fieldClass} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>CURP</label>
              <input className={fieldClass} value={form.curp} onChange={(e) => set("curp", e.target.value.toUpperCase())} maxLength={18} placeholder="GAML890101MDFRCR01" />
            </div>
          </div>
        </Card>

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
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-5">
            <Shield size={16} className="text-sage-500" />
            <h2 className="font-semibold text-gray-800">IMSS &amp; Social Security</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-sage-50 rounded-xl border border-sage-100">
              <input
                type="checkbox"
                id="imss"
                checked={form.is_imss_registered}
                onChange={(e) => set("is_imss_registered", e.target.checked)}
                className="w-4 h-4 text-sage-500 rounded"
              />
              <label htmlFor="imss" className="text-sm text-sage-800 cursor-pointer">
                {lang === "en"
                  ? "Worker is registered with IMSS (required by law)"
                  : "Trabajadora inscrita en el IMSS (obligatorio por ley)"}
              </label>
            </div>
            {form.is_imss_registered && (
              <div>
                <label className={labelClass}>NSS</label>
                <input className={fieldClass} value={form.imss_nss} onChange={(e) => set("imss_nss", e.target.value)} placeholder="00000000000" maxLength={11} />
              </div>
            )}
          </div>
        </Card>

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
                {/* QR code */}
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
