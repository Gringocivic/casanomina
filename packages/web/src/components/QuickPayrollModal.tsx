/**
 * components/QuickPayrollModal.tsx
 *
 * "Run payroll" in a few clicks for one worker, launched from the
 * Workers list or the Dashboard worker card.
 *
 * Reuses the exact same endpoints as pages/Payroll.tsx (preview → create
 * → approve) and mirrors its period pre-fill logic (pay_frequency +
 * days_per_week → start/end date + suggested days worked). No new
 * calculation logic — all math still happens server-side via
 * POST /api/payroll/preview and POST /api/payroll.
 *
 * Cancel resets all local state so re-opening the modal starts fresh.
 */
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { MoneyAmount } from "./ui/MoneyAmount";
import { X, CheckCircle, Zap } from "lucide-react";

interface QuickPayrollModalProps {
  worker: any;
  onClose: () => void;
  /** Called after the run is successfully approved & saved, so the caller can refresh its data. */
  onSaved?: () => void;
}

/** Same pay-frequency → period-length mapping used in pages/Payroll.tsx. */
const FREQ_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, "semi-monthly": 15, monthly: 30 };

function suggestPeriod(worker: any) {
  const freq: string = worker.pay_frequency ?? "weekly";
  const periodLen = FREQ_DAYS[freq] ?? 7;

  const lastEnd = worker.last_run?.period_end;
  let startDate: Date;
  if (lastEnd) {
    const [y, mo, d] = lastEnd.split("-").map(Number);
    startDate = new Date(y, mo - 1, d + 1);
  } else {
    const [y, mo, d] = worker.start_date.split("-").map(Number);
    startDate = new Date(y, mo - 1, d);
  }
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + periodLen - 1);

  const iso = (d: Date) => d.toISOString().split("T")[0];
  const daysWorked = Math.round((worker.days_per_week ?? 6) * (periodLen / 7));

  return {
    start_date: iso(startDate),
    end_date: iso(endDate),
    days_worked: String(daysWorked),
    vacation_days: "0",
  };
}

export function QuickPayrollModal({ worker, onClose, onSaved }: QuickPayrollModalProps) {
  const { lang } = useLanguage();

  const [periodForm, setPeriodForm] = useState(() => suggestPeriod(worker));
  const [preview, setPreview] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRun, setSavedRun] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-derive the suggested period if a different worker is passed in
  // while the modal is already open (defensive — shouldn't normally happen).
  useEffect(() => {
    setPeriodForm(suggestPeriod(worker));
    setPreview(null);
    setSavedRun(null);
    setError(null);
  }, [worker.id]);

  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500";

  async function handlePreview() {
    if (!periodForm.start_date || !periodForm.days_worked) return;
    setPreviewing(true);
    setError(null);
    try {
      const result = await api.payroll.preview({
        worker_id: worker.id,
        ...periodForm,
        days_worked: Number(periodForm.days_worked),
        vacation_days: Number(periodForm.vacation_days ?? 0),
      });
      setPreview(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApproveAndSave() {
    setSaving(true);
    setError(null);
    try {
      const run = await api.payroll.create({
        worker_id: worker.id,
        ...periodForm,
        days_worked: Number(periodForm.days_worked),
        vacation_days: Number(periodForm.vacation_days ?? 0),
      });
      const approved = await api.payroll.approve(run.id);
      setSavedRun(approved);
      onSaved?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setPeriodForm(suggestPeriod(worker));
    setPreview(null);
    setSavedRun(null);
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={handleCancel}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <Card className="relative">
          <button
            onClick={handleCancel}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            aria-label={lang === "en" ? "Close" : "Cerrar"}
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <Zap size={18} className="text-terracotta-500" />
            <h2 className="text-lg font-bold text-gray-900">
              {lang === "en" ? "Run Payroll" : "Procesar Nómina"}
            </h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">{worker.full_name}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}

          {savedRun ? (
            <div className="p-5 bg-sage-50 border border-sage-100 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle size={22} className="text-sage-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sage-800">
                    {lang === "en" ? "Payroll approved!" : "¡Nómina aprobada!"}
                  </p>
                  <p className="text-sm text-sage-600">
                    {lang === "en" ? "Net pay: " : "Pago neto: "}
                    <MoneyAmount amount={savedRun.net_pay} size="sm" className="text-sage-700 font-semibold" />
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={handleCancel}>
                {lang === "en" ? "Done" : "Listo"}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {lang === "en" ? "Period Start" : "Inicio del Periodo"}
                    </label>
                    <input
                      type="date" className={fieldClass}
                      value={periodForm.start_date}
                      onChange={(e) => { setPeriodForm(f => ({ ...f, start_date: e.target.value })); setPreview(null); }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {lang === "en" ? "Period End" : "Fin del Periodo"}
                    </label>
                    <input
                      type="date" className={fieldClass}
                      value={periodForm.end_date}
                      onChange={(e) => { setPeriodForm(f => ({ ...f, end_date: e.target.value })); setPreview(null); }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {lang === "en" ? "Days Worked" : "Días Trabajados"}
                  </label>
                  <input
                    type="number" className={fieldClass} min="1" max="31"
                    value={periodForm.days_worked}
                    onChange={(e) => { setPeriodForm(f => ({ ...f, days_worked: e.target.value })); setPreview(null); }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {lang === "en" ? "Vacation Days This Run" : "Días de Vacaciones en esta Nómina"}
                  </label>
                  <input
                    type="number" className={fieldClass} min="0"
                    value={periodForm.vacation_days}
                    onChange={(e) => { setPeriodForm(f => ({ ...f, vacation_days: e.target.value })); setPreview(null); }}
                  />
                </div>

                <Button
                  onClick={handlePreview} loading={previewing}
                  disabled={!periodForm.start_date || !periodForm.days_worked}
                  className="w-full justify-center"
                >
                  {lang === "en" ? "Preview Payroll" : "Vista Previa de Nómina"}
                </Button>
              </div>

              {preview && (
                <div className="border-t border-gray-100 pt-5">
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="p-3 bg-gray-50 rounded-xl text-center">
                      <p className="text-xs text-gray-500 mb-1">{lang === "en" ? "Gross" : "Bruto"}</p>
                      <MoneyAmount amount={preview.gross_wages} size="md" />
                    </div>
                    <div className="p-3 bg-sage-50 rounded-xl text-center">
                      <p className="text-xs text-sage-600 mb-1">{lang === "en" ? "Net Pay" : "Pago Neto"}</p>
                      <MoneyAmount amount={preview.net_pay} size="md" className="text-sage-700" />
                    </div>
                    <div className="p-3 bg-terracotta-50 rounded-xl text-center">
                      <p className="text-xs text-terracotta-600 mb-1">{lang === "en" ? "Your Cost" : "Tu Costo"}</p>
                      <MoneyAmount amount={preview.employer_total_cost} size="md" className="text-terracotta-700" />
                    </div>
                  </div>

                  <div className="space-y-2 mb-5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{lang === "en" ? "Worker IMSS deduction" : "Descuento IMSS (trabajadora)"}</span>
                      <MoneyAmount amount={preview.total_deductions} size="sm" className="text-gray-900" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{lang === "en" ? "Employer IMSS contribution" : "Cuota IMSS patronal"}</span>
                      <MoneyAmount amount={preview.imss?.total_employer ?? 0} size="sm" className="text-gray-900" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">INFONAVIT</span>
                      <MoneyAmount amount={preview.infonavit_employer_contribution} size="sm" className="text-gray-900" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleApproveAndSave} loading={saving} variant="secondary" className="flex-1 justify-center">
                      <CheckCircle size={16} />
                      {lang === "en" ? "Approve & Save" : "Aprobar y Guardar"}
                    </Button>
                    <Button onClick={handleCancel} variant="ghost">
                      {lang === "en" ? "Cancel" : "Cancelar"}
                    </Button>
                  </div>
                </div>
              )}

              {!preview && (
                <Button onClick={handleCancel} variant="ghost" className="w-full justify-center">
                  {lang === "en" ? "Cancel" : "Cancelar"}
                </Button>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
