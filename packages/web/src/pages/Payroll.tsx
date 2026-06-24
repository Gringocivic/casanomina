/**
 * pages/Payroll.tsx — Screen 3
 *
 * Preview → Approve → Mark Paid payroll flow.
 * Shows full itemized breakdown so the employer can verify every number
 * before approving. Includes payroll history for the selected worker.
 */
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import { api, BASE } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import { ChevronDown, ChevronRight, Receipt, CheckCircle, DollarSign, Download, Clock, Loader2, AlertTriangle, CalendarX2 } from "lucide-react";
import { RATES_2026 } from "@casanomina/calculator";

function IMSSBreakdownTable({ imss, lang }: { imss: any; lang: "en" | "es" }) {
  const [open, setOpen] = useState(false);
  const branches: Array<[string, string]> = [
    ["enfermedad_maternidad", lang === "en" ? "Sickness & Maternity" : "Enf. y Maternidad"],
    ["invalidez_vida",        lang === "en" ? "Disability & Life" : "Invalidez y Vida"],
    ["retiro",                lang === "en" ? "Retirement" : "Retiro"],
    ["cesantia_vejez",        lang === "en" ? "Old Age & Unemployment" : "Cesantia y Vejez"],
    ["guarderias_prestaciones_sociales", lang === "en" ? "Daycare & Social" : "Guarderias"],
    ["riesgos_trabajo",       lang === "en" ? "Occupational Risk" : "Riesgos de Trabajo"],
  ];

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-2"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {lang === "en" ? "Show IMSS branch detail" : "Ver detalle por ramo IMSS"}
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b">
              <th className="pb-2">{lang === "en" ? "Branch" : "Ramo"}</th>
              <th className="pb-2 text-right">{lang === "en" ? "Employer" : "Patron"}</th>
              <th className="pb-2 text-right">{lang === "en" ? "Worker" : "Trabajadora"}</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(([key, label]) => (
              <tr key={key} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-600">{label}</td>
                <td className="py-1.5 text-right text-gray-800">
                  <MoneyAmount amount={imss.branches[key]?.employer ?? 0} size="sm" />
                </td>
                <td className="py-1.5 text-right text-gray-800">
                  <MoneyAmount amount={imss.branches[key]?.worker ?? 0} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-gray-900">
              <td className="pt-2">{lang === "en" ? "Total IMSS" : "Total IMSS"}</td>
              <td className="pt-2 text-right"><MoneyAmount amount={imss.total_employer} size="sm" /></td>
              <td className="pt-2 text-right"><MoneyAmount amount={imss.total_worker} size="sm" /></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function statusVariant(status: string): "success" | "warning" | "neutral" | "error" {
  if (status === "paid") return "success";
  if (status === "approved") return "warning";
  if (status === "draft") return "neutral";
  return "neutral";
}

function statusLabel(status: string, lang: "en" | "es") {
  const map: Record<string, { en: string; es: string }> = {
    draft:    { en: "Draft",    es: "Borrador" },
    approved: { en: "Approved", es: "Aprobado" },
    paid:     { en: "Paid",     es: "Pagado"   },
  };
  return map[status]?.[lang] ?? status;
}

export function Payroll() {
  const { lang } = useLanguage();
  const { getToken } = useAuth();
  const { data: workers } = useApi(async () => {
    try { return await api.workers.cards(); }
    catch { return api.workers.list(); }
  }, []);

  // Pre-select worker if ?worker=<id> is in the URL (from dashboard "Run" CTA)
  const preselectedWorker = new URLSearchParams(window.location.search).get("worker") ?? "";

  const [selectedWorker, setSelectedWorker] = useState<string>(preselectedWorker);
  const [periodForm, setPeriodForm] = useState({
    start_date: "",
    end_date: "",
    days_worked: "",
  });

  const [preview, setPreview] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRun, setSavedRun] = useState<any>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  /** Derive suggested period dates from a worker's cadence and last run. */
  const selectedWorkerObj = useMemo(
    () => workers?.find((w: any) => w.id === selectedWorker),
    [workers, selectedWorker]
  );

  useEffect(() => {
    if (!selectedWorkerObj) return;
    const w = selectedWorkerObj;
    const freq: string = w.pay_frequency ?? "weekly";
    const freqDays: Record<string, number> = { weekly: 7, biweekly: 14, "semi-monthly": 15, monthly: 30 };
    const periodLen = freqDays[freq] ?? 7;

    // period_start = day after last period_end, or start_date if no runs
    const lastEnd = w.last_run?.period_end;
    let startDate: Date;
    if (lastEnd) {
      const [y, mo, d] = lastEnd.split("-").map(Number);
      startDate = new Date(y, mo - 1, d + 1);
    } else {
      const [y, mo, d] = w.start_date.split("-").map(Number);
      startDate = new Date(y, mo - 1, d);
    }
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + periodLen - 1);

    const iso = (d: Date) => d.toISOString().split("T")[0];
    const daysWorked = Math.round((w.days_per_week ?? 6) * (periodLen / 7));

    setPeriodForm({
      start_date: iso(startDate),
      end_date:   iso(endDate),
      days_worked: String(daysWorked),
    });
    setPreview(null);
    setSavedRun(null);
  }, [selectedWorkerObj]);

  const [historyKey, setHistoryKey] = useState(0);

  // Holiday check: decisions for each holiday detected in the period
  // "paid_off" = took day off but still paid (default), "worked" = triple pay, "unpaid" = deduct
  const [holidayDecisions, setHolidayDecisions] = useState<Record<string, "paid_off" | "worked">>({});
  const [restDaysWorked, setRestDaysWorked] = useState(0);

  const detectedHolidays = useMemo(() => {
    if (!periodForm.start_date || !periodForm.end_date) return [];
    const start = new Date(periodForm.start_date + "T12:00:00");
    const end   = new Date(periodForm.end_date   + "T12:00:00");
    return (RATES_2026.mandatory_holidays_2026 ?? []).filter((h) => {
      const d = new Date(h.date + "T12:00:00");
      return d >= start && d <= end;
    });
  }, [periodForm.start_date, periodForm.end_date]);

  const { data: history, loading: historyLoading } = useApi(
    () => selectedWorker ? api.payroll.list(selectedWorker) : Promise.resolve([] as any[]),
    [selectedWorker, historyKey]
  );

  async function handlePreview() {
    if (!selectedWorker || !periodForm.start_date || !periodForm.days_worked) return;
    const workedHolidays = detectedHolidays.filter((h) => (holidayDecisions[h.date] ?? "paid_off") === "worked").length;
    setPreviewing(true);
    try {
      const result = await api.payroll.preview({
        worker_id:           selectedWorker,
        ...periodForm,
        days_worked:         Number(periodForm.days_worked),
        holiday_days_worked: workedHolidays,
        rest_days_worked:    restDaysWorked,
      });
      setPreview(result);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApproveAndSave() {
    setSaving(true);
    const workedHolidays2 = detectedHolidays.filter((h) => (holidayDecisions[h.date] ?? "paid_off") === "worked").length;
    try {
      const run = await api.payroll.create({
        worker_id:           selectedWorker,
        ...periodForm,
        days_worked:         Number(periodForm.days_worked),
        holiday_days_worked: workedHolidays2,
        rest_days_worked:    restDaysWorked,
      });
      const approved = await api.payroll.approve(run.id);
      setSavedRun(approved);
      setHistoryKey(k => k + 1);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(run?: any) {
    const target = run ?? savedRun;
    if (!target) return;
    setMarkingPaid(true);
    try {
      const updated = await api.payroll.markPaid(target.id);
      if (!run) setSavedRun(updated);
      setHistoryKey(k => k + 1);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setMarkingPaid(false);
    }
  }

  /** Generate then download a payslip PDF with the Bearer token attached. */
  async function handleDownloadPayslip(run?: any) {
    const target = run ?? savedRun;
    if (!target) return;
    const key = target.id;
    setDownloadingId(key);
    try {
      // 1. Generate (POST) — uses api.req() which already injects the token
      await api.documents.generatePayslip(target.id);

      // 2. Download (GET) with Bearer token via fetch → blob
      const clerkToken = await getToken();
      const res = await fetch(`${BASE}/api/documents/payslip/${target.id}`, {
        headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip_${target.period_start ?? target.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  function handleNewRun() {
    setPreview(null);
    setSavedRun(null);
    setPeriodForm({ start_date: "", end_date: "", days_worked: "" });
  }

  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500";

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Receipt size={20} className="text-terracotta-500" />
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === "en" ? "Run Payroll" : "Procesar Nomina"}
          </h1>
        </div>
        <p className="text-gray-500 text-sm">
          {lang === "en"
            ? "Preview and approve a pay period. All amounts calculated from official 2026 rates."
            : "Vista previa y aprobacion de periodo de pago. Montos calculados con tarifas oficiales 2026."}
        </p>
      </div>

      {/* ── Success banner ─────────────────────────────────────── */}
      {savedRun && (
        <div className="mb-6 p-5 bg-sage-50 border border-sage-100 rounded-2xl flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle size={22} className="text-sage-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sage-800">
                {lang === "en" ? "Payroll approved!" : "Nomina aprobada!"}
              </p>
              <p className="text-sm text-sage-600">
                {lang === "en" ? "Net pay: " : "Pago neto: "}
                <MoneyAmount amount={savedRun.net_pay} size="sm" className="text-sage-700 font-semibold" />
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {savedRun.status !== "paid" && (
              <Button variant="secondary" size="sm" onClick={() => handleMarkPaid()} loading={markingPaid}>
                <DollarSign size={14} />
                {lang === "en" ? "Mark Paid" : "Marcar Pagado"}
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              onClick={() => handleDownloadPayslip()}
              loading={downloadingId === savedRun.id}
            >
              {downloadingId === savedRun.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {lang === "en" ? "Download Payslip" : "Descargar Recibo"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNewRun}>
              {lang === "en" ? "New Run" : "Nueva Nomina"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 1: worker + period ────────────────────────────── */}
      <Card className="mb-4">
        <h2 className="font-semibold text-gray-800 mb-4">
          {lang === "en" ? "1. Select Worker & Period" : "1. Seleccionar Trabajadora y Periodo"}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {lang === "en" ? "Worker" : "Trabajadora"}
            </label>
            <select className={fieldClass} value={selectedWorker}
              onChange={(e) => { setSelectedWorker(e.target.value); setHolidayDecisions({}); setRestDaysWorked(0); setPreview(null); setSavedRun(null); }}>
              <option value="">{lang === "en" ? "Choose worker..." : "Elegir trabajadora..."}</option>
              {workers?.map((w: any) => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {lang === "en" ? "Period Start" : "Inicio del Periodo"}
              </label>
              <input type="date" className={fieldClass}
                value={periodForm.start_date}
                onChange={(e) => { setPeriodForm(f => ({ ...f, start_date: e.target.value })); setHolidayDecisions({}); setRestDaysWorked(0); setPreview(null); }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {lang === "en" ? "Period End" : "Fin del Periodo"}
              </label>
              <input type="date" className={fieldClass}
                value={periodForm.end_date}
                onChange={(e) => { setPeriodForm(f => ({ ...f, end_date: e.target.value })); setHolidayDecisions({}); setRestDaysWorked(0); setPreview(null); }}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {lang === "en" ? "Days Worked This Period" : "Dias Trabajados en el Periodo"}
            </label>
            <input type="number" className={fieldClass} min="1" max="31"
              value={periodForm.days_worked}
              onChange={(e) => setPeriodForm(f => ({ ...f, days_worked: e.target.value }))}
              placeholder="7"
            />
          </div>

          {/* ── Holiday check ─────────────────────────────────── */}
          {detectedHolidays.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <CalendarX2 size={16} className="text-amber-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-amber-800">
                  {detectedHolidays.length === 1
                    ? (lang === "en" ? "1 mandatory holiday in this period" : "1 día festivo obligatorio en este periodo")
                    : (lang === "en" ? `${detectedHolidays.length} mandatory holidays in this period` : `${detectedHolidays.length} días festivos en este periodo`)}
                </p>
              </div>
              <p className="text-xs text-amber-700">
                {lang === "en"
                  ? "Mandatory holidays are always paid. Did the worker come in anyway?"
                  : "Los días festivos siempre son pagados. ¿La trabajadora fue de todas formas?"}
              </p>
              {detectedHolidays.map((h) => {
                const decision = holidayDecisions[h.date] ?? "paid_off";
                const btn = (val: "paid_off" | "worked", label: string, note: string) => (
                  <button
                    type="button"
                    onClick={() => { setHolidayDecisions(d => ({ ...d, [h.date]: val })); setPreview(null); }}
                    className={`flex-1 text-center px-3 py-2.5 rounded-xl border-2 text-xs font-medium transition-colors ${
                      decision === val
                        ? "border-terracotta-500 bg-terracotta-50 text-terracotta-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div>{label}</div>
                    <div className="text-gray-400 font-normal mt-0.5">{note}</div>
                  </button>
                );
                return (
                  <div key={h.date} className="bg-white rounded-xl p-3 border border-amber-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">{h.name}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(h.date + "T12:00:00").toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {btn("paid_off",
                        lang === "en" ? "Day off (paid)" : "Descanso pagado",
                        lang === "en" ? "No change" : "Sin cambio")}
                      {btn("worked",
                        lang === "en" ? "Worked it" : "Trabajó",
                        lang === "en" ? "+triple pay" : "+pago triple")}
                    </div>
                  </div>
                );
              })}
              {detectedHolidays.some((h) => (holidayDecisions[h.date] ?? "paid_off") === "worked") && (
                <div className="flex items-start gap-2 p-2 bg-terracotta-50 border border-terracotta-100 rounded-lg">
                  <AlertTriangle size={14} className="text-terracotta-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-terracotta-700">
                    {lang === "en"
                      ? "Triple pay applies: 2x daily salary bonus added per holiday worked (LFT Art. 75)."
                      : "Aplica pago triple: bono de 2x salario diario por festivo trabajado (LFT Art. 75)."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Rest days worked ───────────────────────────────── */}
          <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {lang === "en" ? "Rest days worked" : "Días de descanso trabajados"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lang === "en"
                    ? "Days the worker came in on their scheduled day off — earns double pay (LFT Art. 73)."
                    : "Días que la trabajadora vino en su día de descanso — genera pago doble (LFT Art. 73)."}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setRestDaysWorked(n => Math.max(0, n - 1)); setPreview(null); }}
                  className="w-8 h-8 rounded-full border-2 border-gray-200 text-gray-500 hover:border-gray-400 flex items-center justify-center font-bold text-lg"
                >−</button>
                <span className="w-6 text-center font-semibold text-gray-800">{restDaysWorked}</span>
                <button
                  type="button"
                  onClick={() => { setRestDaysWorked(n => n + 1); setPreview(null); }}
                  className="w-8 h-8 rounded-full border-2 border-gray-200 text-gray-500 hover:border-gray-400 flex items-center justify-center font-bold text-lg"
                >+</button>
              </div>
            </div>
          </div>

          {/* ── Absence note ───────────────────────────────────── */}
          <p className="text-xs text-gray-400">
            {lang === "en"
              ? "If the worker missed a scheduled day (not a holiday), reduce the days worked number above."
              : "Si la trabajadora faltó un día ordinario (que no sea festivo), reduce el número de días trabajados."}
          </p>

          <Button onClick={handlePreview} loading={previewing}
            disabled={!selectedWorker || !periodForm.start_date || !periodForm.days_worked}>
            {lang === "en" ? "Preview Payroll" : "Vista Previa de Nomina"}
          </Button>
        </div>
      </Card>

      {/* ── Step 2: breakdown + approve ───────────────────────── */}
      {preview && (
        <Card className="mb-4 border-terracotta-100">
          <h2 className="font-semibold text-gray-800 mb-5">
            {lang === "en" ? "2. Payroll Breakdown" : "2. Desglose de Nomina"}
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-gray-50 rounded-xl text-center">
              <p className="text-xs text-gray-500 mb-1">{lang === "en" ? "Gross Wages" : "Salario Bruto"}</p>
              <MoneyAmount amount={preview.gross_wages} size="lg" />
              {preview.holiday_bonus > 0 && (
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  {lang === "en" ? `incl. $${preview.holiday_bonus.toFixed(2)} holiday bonus` : `incl. $${preview.holiday_bonus.toFixed(2)} bono festivo`}
                </p>
              )}
              {preview.rest_day_bonus > 0 && (
                <p className="text-xs text-blue-500 mt-1 font-medium">
                  {lang === "en" ? `incl. $${preview.rest_day_bonus.toFixed(2)} rest day bonus` : `incl. $${preview.rest_day_bonus.toFixed(2)} bono descanso`}
                </p>
              )}
            </div>
            <div className="p-4 bg-sage-50 rounded-xl text-center">
              <p className="text-xs text-sage-600 mb-1">{lang === "en" ? "Worker Net Pay" : "Pago Neto (Trabajadora)"}</p>
              <MoneyAmount amount={preview.net_pay} size="lg" className="text-sage-700" />
            </div>
            <div className="p-4 bg-terracotta-50 rounded-xl text-center">
              <p className="text-xs text-terracotta-600 mb-1">{lang === "en" ? "Your Total Cost" : "Costo Total del Patron"}</p>
              <MoneyAmount amount={preview.employer_total_cost} size="lg" className="text-terracotta-700" />
            </div>
          </div>

          <div className="space-y-3 mb-5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{lang === "en" ? "Worker IMSS deduction" : "Descuento IMSS (trabajadora)"}</span>
              <MoneyAmount amount={preview.total_deductions} size="sm" className="text-gray-900" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{lang === "en" ? "Employer IMSS contribution" : "Cuota IMSS patronal"}</span>
              <MoneyAmount amount={preview.imss?.total_employer ?? 0} size="sm" className="text-gray-900" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">INFONAVIT</span>
              <MoneyAmount amount={preview.infonavit_employer_contribution} size="sm" className="text-gray-900" />
            </div>
          </div>

          {preview.imss && <IMSSBreakdownTable imss={preview.imss} lang={lang} />}

          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-4">
              {lang === "en"
                ? "All amounts verified against official 2026 IMSS and LFT rates."
                : "Montos verificados con tarifas oficiales IMSS y LFT 2026."}
            </p>
            <Button onClick={handleApproveAndSave} loading={saving} variant="secondary">
              <CheckCircle size={16} />
              {lang === "en" ? "Approve & Save" : "Aprobar y Guardar"}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Payroll History ───────────────────────────────────── */}
      {selectedWorker && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-800">
              {lang === "en" ? "Payment History" : "Historial de Pagos"}
            </h2>
            {history && history.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {history.length}
              </span>
            )}
          </div>

          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : history && history.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">
                      {lang === "en" ? "Period" : "Periodo"}
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                      {lang === "en" ? "Status" : "Estado"}
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      {lang === "en" ? "Net Pay" : "Neto"}
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                      {lang === "en" ? "Employer Cost" : "Costo Patron"}
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">
                      {lang === "en" ? "Actions" : "Acciones"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 px-5">
                  {history.map((run: any) => (
                    <tr key={run.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-5">
                        <p className="text-sm font-medium text-gray-900">
                          {run.period_start} → {run.period_end}
                        </p>
                        <p className="text-xs text-gray-400">{run.days_worked} {lang === "en" ? "days" : "días"}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={statusVariant(run.status)}>{statusLabel(run.status, lang)}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <MoneyAmount amount={run.net_pay} size="sm" className="text-sage-700 font-semibold" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <MoneyAmount amount={run.employer_total_cost} size="sm" className="text-terracotta-600 font-semibold" />
                      </td>
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {run.status === "approved" && (
                            <button
                              onClick={() => handleMarkPaid(run)}
                              className="text-xs text-sage-600 hover:text-sage-700 font-medium flex items-center gap-1"
                            >
                              <DollarSign size={13} />
                              {lang === "en" ? "Mark Paid" : "Marcar Pagado"}
                            </button>
                          )}
                          <button
                            onClick={() => handleDownloadPayslip(run)}
                            disabled={downloadingId === run.id}
                            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 flex items-center gap-1"
                          >
                            {downloadingId === run.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Download size={13} />}
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <Receipt size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {lang === "en" ? "No payroll runs yet for this worker." : "Sin registros de nomina para esta trabajadora."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
