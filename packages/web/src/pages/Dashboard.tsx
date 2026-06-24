/**
 * pages/Dashboard.tsx — Employer home screen
 *
 * Layout:
 *   1. Stats bar (active workers, total monthly outlay, next deadline)
 *   2. Payment obligations (worker payroll + IMSS bimestral + ISR monthly + Aguinaldo)
 *   3. Two columns: Pending onboarding | Upcoming holidays
 *   4. Rotating "Did you know" card
 */
import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import { Button } from "../components/ui/Button";
import {
  Users, AlertTriangle, CalendarX2, ChevronDown, ChevronRight,
  Play, CheckCircle2, Circle, Info, Plus, TrendingUp, RefreshCw,
  Clock, AlertCircle,
} from "lucide-react";
import {
  RATES_2026,
  calculateSBC,
  calculateIMSSContributions,
  calculateINFONAVIT,
  calculateAguinaldo,
  calculateYearsOfService,
  daysBetweenInclusive,
} from "@casanomina/calculator";

// ─── Types ────────────────────────────────────────────────────────────────────

type ObligationType = "worker_payroll" | "imss" | "isr" | "aguinaldo";

interface Obligation {
  id: string;
  type: ObligationType;
  label: string;
  sublabel?: string;
  dueDate: Date;
  daysUntil: number;
  amount: number;
  isEstimate: boolean;
  isOverdue: boolean;
  workerId?: string;
  workerName?: string;
  detail?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function fmtDate(d: Date, lang: "en" | "es"): string {
  return d.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

/** Next IMSS bimestral due date (17th of month after bimester closes). */
function nextImssDue(today: Date): { due: Date; period: string } {
  // Bimesters and their due month (1-indexed):
  //   Jan-Feb → Mar 17  | Mar-Apr → May 17  | May-Jun → Jul 17
  //   Jul-Aug → Sep 17  | Sep-Oct → Nov 17  | Nov-Dec → Jan 17 (next year)
  const schedule: Array<{ closeMonth: number; dueMonth: number; label: string }> = [
    { closeMonth: 2,  dueMonth: 3,  label: "Ene-Feb" },
    { closeMonth: 4,  dueMonth: 5,  label: "Mar-Abr" },
    { closeMonth: 6,  dueMonth: 7,  label: "May-Jun" },
    { closeMonth: 8,  dueMonth: 9,  label: "Jul-Ago" },
    { closeMonth: 10, dueMonth: 11, label: "Sep-Oct" },
    { closeMonth: 12, dueMonth: 1,  label: "Nov-Dic" },
  ];
  const yr = today.getFullYear();
  for (const s of schedule) {
    const dueYear = s.dueMonth === 1 ? yr + 1 : yr;
    const due = new Date(dueYear, s.dueMonth - 1, 17);
    if (due >= today) return { due, period: s.label };
  }
  return { due: new Date(yr + 1, 0, 17), period: "Nov-Dic" };
}

/** Next ISR monthly due date (17th of following month). */
function nextIsrDue(today: Date): { due: Date; period: string } {
  const yr = today.getFullYear();
  const mo = today.getMonth(); // 0-indexed
  let dueYear = yr;
  let dueMo = mo + 1; // month after current
  if (dueMo > 11) { dueMo = 0; dueYear++; }
  const due = new Date(dueYear, dueMo, 17);
  if (due < today) {
    // already past: next month
    dueMo++;
    if (dueMo > 11) { dueMo = 0; dueYear++; }
    return { due: new Date(dueYear, dueMo, 17), period: new Date(yr, mo + 1, 1).toLocaleDateString("es-MX", { month: "long" }) };
  }
  const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return { due, period: MONTHS_ES[mo] };
}

/** Next worker payroll due date based on pay_frequency and last period end. */
function nextWorkerPayDate(worker: any): Date {
  const freq = worker.pay_frequency ?? "weekly";
  const freqDays: Record<string, number> = {
    weekly: 7,
    biweekly: 14,
    "semi-monthly": 15,
    monthly: 30,
  };
  const days = freqDays[freq] ?? 7;
  const lastEnd = worker.last_run?.period_end;
  if (lastEnd) {
    return addDays(isoToDate(lastEnd), days);
  }
  // No runs yet: from start_date
  return addDays(isoToDate(worker.start_date), days);
}

/** Employer monthly IMSS cost for one worker (×30 days). */
function monthlyImssEmployer(worker: any): number {
  const sbc = calculateSBC(parseFloat(worker.daily_salary), RATES_2026);
  const imss = calculateIMSSContributions(sbc, RATES_2026);
  return imss.total_employer * 30;
}

/** Employer bimestral IMSS estimate (×60 days). */
function bimestralImssEmployer(worker: any): number {
  return monthlyImssEmployer(worker) * 2;
}

/** ISR withheld estimate per month from salary (rough: daily × 30 days monthly ISR). */
function monthlyIsrEstimate(worker: any): number {
  const ytdIsr = parseFloat(worker.ytd?.ytd_isr ?? "0");
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const monthsElapsed = Math.max(1,
    (today.getFullYear() - startOfYear.getFullYear()) * 12 +
    today.getMonth() - startOfYear.getMonth() + 1
  );
  if (ytdIsr > 0) return ytdIsr / monthsElapsed;
  return 0;
}

/** Total monthly employer outlay estimate for one worker. */
function monthlyEmployerCost(worker: any): number {
  const dailySalary = parseFloat(worker.daily_salary ?? "0");
  const daysPerWeek = worker.days_per_week ?? 6;
  const monthlyWage = dailySalary * daysPerWeek * (52 / 12);
  const sbc = calculateSBC(dailySalary, RATES_2026);
  const imss = calculateIMSSContributions(sbc, RATES_2026);
  const infonavit = calculateINFONAVIT(sbc, RATES_2026);
  const monthlyImss = imss.total_employer * 30;
  return monthlyWage + monthlyImss + infonavit * 30;
}

/** Aguinaldo deadline: Dec 20 of current year; next year if already past. */
function aguinaldoDue(today: Date): Date {
  const d = new Date(today.getFullYear(), 11, 20); // Dec 20
  if (d < today) return new Date(today.getFullYear() + 1, 11, 20);
  return d;
}

/** Aguinaldo owed across all workers to date (proportional by days worked this year). */
function totalAguinaldoAccrued(workers: any[]): number {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const yearStart = `${today.getFullYear()}-01-01`;
  return workers.reduce((sum, w) => {
    const dailySalary = parseFloat(w.daily_salary ?? "0");
    // Days worked in the current calendar year (from max(start_date, Jan 1) to today)
    const effectiveStart = w.start_date > yearStart ? w.start_date : yearStart;
    const daysThisYear = Math.max(1, daysBetweenInclusive(effectiveStart, todayStr));
    return sum + calculateAguinaldo(dailySalary, daysThisYear, RATES_2026);
  }, 0);
}

// ─── Obligation builder ────────────────────────────────────────────────────────

function buildObligations(workers: any[], today: Date): Obligation[] {
  const obligations: Obligation[] = [];
  const imssWorkers = workers.filter((w) => w.is_imss_registered);

  // Worker payrolls
  for (const w of workers) {
    const due = nextWorkerPayDate(w);
    const daysUntil = diffDays(today, due);
    const lastNet = parseFloat(w.last_run?.net_pay ?? "0");
    const daysPerWeek = w.days_per_week ?? 6;
    const freqDays: Record<string, number> = {
      weekly: 7, biweekly: 14, "semi-monthly": 15, monthly: 30,
    };
    const periodDays = freqDays[w.pay_frequency ?? "weekly"] ?? 7;
    const estimatedNet = lastNet > 0
      ? lastNet
      : parseFloat(w.daily_salary ?? "0") * daysPerWeek * (periodDays / 7) * 0.85; // rough deduction estimate
    obligations.push({
      id: `payroll-${w.id}`,
      type: "worker_payroll",
      label: w.full_name,
      sublabel: w.pay_frequency ?? "weekly",
      dueDate: due,
      daysUntil,
      amount: estimatedNet,
      isEstimate: lastNet === 0,
      isOverdue: daysUntil < 0,
      workerId: w.id,
      workerName: w.full_name,
    });
  }

  // IMSS bimestral (only if any workers are registered)
  if (imssWorkers.length > 0) {
    const { due: imssDue, period } = nextImssDue(today);
    const daysUntil = diffDays(today, imssDue);
    const totalImss = imssWorkers.reduce((s, w) => s + bimestralImssEmployer(w), 0);
    obligations.push({
      id: "imss-bimestral",
      type: "imss",
      label: "IMSS Bimestral",
      sublabel: period,
      dueDate: imssDue,
      daysUntil,
      amount: totalImss,
      isEstimate: true,
      isOverdue: daysUntil < 0,
      detail: "Pagar en IDSE / SIPARE. Aplica a trabajadoras inscritas en IMSS.",
    });
  }

  // ISR monthly (only if any worker has ISR)
  const totalIsrMonthly = workers.reduce((s, w) => s + monthlyIsrEstimate(w), 0);
  if (totalIsrMonthly > 0 || workers.length > 0) {
    const { due: isrDue, period } = nextIsrDue(today);
    const daysUntil = diffDays(today, isrDue);
    obligations.push({
      id: "isr-monthly",
      type: "isr",
      label: "ISR Mensual → SAT",
      sublabel: period,
      dueDate: isrDue,
      daysUntil,
      amount: totalIsrMonthly,
      isEstimate: true,
      isOverdue: daysUntil < 0,
      detail: "Declarar y pagar vía SIPARE o declaración mensual en el SAT.",
    });
  }

  // Aguinaldo
  if (workers.length > 0) {
    const due = aguinaldoDue(today);
    const daysUntil = diffDays(today, due);
    const accrued = totalAguinaldoAccrued(workers);
    obligations.push({
      id: "aguinaldo",
      type: "aguinaldo",
      label: "Aguinaldo",
      sublabel: due.getFullYear().toString(),
      dueDate: due,
      daysUntil,
      amount: accrued,
      isEstimate: true,
      isOverdue: daysUntil < 0,
      detail: "Vence el 20 de diciembre. Mínimo 15 días de salario (LFT Art. 87).",
    });
  }

  // Sort: overdue first, then by date
  return obligations.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────

function urgencyColor(days: number, overdue: boolean) {
  if (overdue) return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" };
  if (days <= 3) return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" };
  if (days <= 10) return { bg: "bg-yellow-50", border: "border-yellow-100", text: "text-yellow-700", badge: "bg-yellow-50 text-yellow-700" };
  return { bg: "bg-white", border: "border-gray-100", text: "text-gray-500", badge: "bg-gray-100 text-gray-500" };
}

function dueBadge(days: number, overdue: boolean, lang: "en" | "es"): string {
  if (overdue) return lang === "es" ? `Vencido hace ${Math.abs(days)}d` : `${Math.abs(days)}d overdue`;
  if (days === 0) return lang === "es" ? "Hoy" : "Today";
  if (days === 1) return lang === "es" ? "Mañana" : "Tomorrow";
  if (days <= 7) return lang === "es" ? `En ${days} días` : `In ${days} days`;
  return lang === "es" ? `${days} días` : `${days}d`;
}

function typeIcon(type: ObligationType) {
  const cls = "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold";
  switch (type) {
    case "worker_payroll": return <div className={`${cls} bg-terracotta-100 text-terracotta-600`}>👤</div>;
    case "imss":           return <div className={`${cls} bg-sage-100 text-sage-700`}>🏥</div>;
    case "isr":            return <div className={`${cls} bg-blue-50 text-blue-600`}>🧾</div>;
    case "aguinaldo":      return <div className={`${cls} bg-amber-100 text-amber-700`}>🎁</div>;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBar({ workers, obligations, lang }: {
  workers: any[];
  obligations: Obligation[];
  lang: "en" | "es";
}) {
  const totalMonthly = workers.reduce((s, w) => s + monthlyEmployerCost(w), 0);
  const nextDue = obligations[0];
  const overdueCount = obligations.filter((o) => o.isOverdue).length;

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <Card className="bg-terracotta-50 border-terracotta-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-terracotta-100 flex items-center justify-center">
            <Users size={18} className="text-terracotta-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-terracotta-600">
              {lang === "es" ? "Trabajadoras activas" : "Active workers"}
            </p>
            <p className="text-2xl font-bold text-terracotta-700">{workers.length}</p>
          </div>
        </div>
      </Card>

      <Card className="bg-sage-50 border-sage-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center">
            <TrendingUp size={18} className="text-sage-700" />
          </div>
          <div>
            <p className="text-xs font-medium text-sage-600">
              {lang === "es" ? "Costo total mensual ~" : "Est. monthly outlay ~"}
            </p>
            <MoneyAmount amount={totalMonthly} size="lg" className="text-sage-700 font-bold" />
          </div>
        </div>
      </Card>

      <Card className={overdueCount > 0 ? "bg-red-50 border-red-100" : "bg-white border-gray-100"}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${overdueCount > 0 ? "bg-red-100" : "bg-gray-100"}`}>
            <Clock size={18} className={overdueCount > 0 ? "text-red-600" : "text-gray-500"} />
          </div>
          <div>
            {overdueCount > 0 ? (
              <>
                <p className="text-xs font-medium text-red-600">
                  {lang === "es" ? "Obligaciones vencidas" : "Overdue obligations"}
                </p>
                <p className="text-2xl font-bold text-red-700">{overdueCount}</p>
              </>
            ) : nextDue ? (
              <>
                <p className="text-xs font-medium text-gray-500">
                  {lang === "es" ? "Próximo vencimiento" : "Next deadline"}
                </p>
                <p className="text-sm font-semibold text-gray-800">{fmtDate(nextDue.dueDate, lang)}</p>
                <p className="text-xs text-gray-400">{nextDue.label}</p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-gray-500">
                  {lang === "es" ? "Próximo vencimiento" : "Next deadline"}
                </p>
                <p className="text-sm text-gray-400">{lang === "es" ? "Sin obligaciones" : "None"}</p>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ObligationRow({ ob, lang }: { ob: Obligation; lang: "en" | "es" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const c = urgencyColor(ob.daysUntil, ob.isOverdue);

  return (
    <div className={`border rounded-xl ${c.border} ${c.bg} overflow-hidden`}>
      <div className="flex items-center gap-3 p-4">
        {typeIcon(ob.type)}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{ob.label}</span>
            {ob.sublabel && (
              <span className="text-xs text-gray-400 capitalize">{ob.sublabel}</span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
              {dueBadge(ob.daysUntil, ob.isOverdue, lang)}
            </span>
            {ob.isEstimate && (
              <span className="text-xs text-gray-400">~{lang === "es" ? "estimado" : "estimated"}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{fmtDate(ob.dueDate, lang)}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <MoneyAmount amount={ob.amount} size="md" className="font-semibold text-gray-900" />
          </div>

          {ob.type === "worker_payroll" && ob.workerId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/payroll?worker=${ob.workerId}`)}
              className="flex items-center gap-1"
            >
              <Play size={12} />
              {lang === "es" ? "Pagar" : "Run"}
            </Button>
          )}

          {ob.detail && (
            <button
              onClick={() => setOpen(!open)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {open && ob.detail && (
        <div className="px-4 pb-4 pt-0">
          <div className="ml-11 p-3 bg-white bg-opacity-60 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-600">{ob.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentObligations({ workers, lang }: { workers: any[]; lang: "en" | "es" }) {
  const today = useMemo(() => new Date(), []);
  const obligations = useMemo(() => buildObligations(workers, today), [workers, today]);

  const workerObs = obligations.filter((o) => o.type === "worker_payroll");
  const govObs = obligations.filter((o) => o.type !== "worker_payroll");

  if (obligations.length === 0) return null;

  return (
    <Card className="mb-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-900">
          {lang === "es" ? "Obligaciones de pago" : "Payment obligations"}
        </h2>
        <Badge variant="neutral">{obligations.filter((o) => o.daysUntil <= 10 || o.isOverdue).length} {lang === "es" ? "próximas" : "upcoming"}</Badge>
      </div>

      {workerObs.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            {lang === "es" ? "Nómina" : "Worker payroll"}
          </p>
          <div className="space-y-2">
            {workerObs.map((ob) => <ObligationRow key={ob.id} ob={ob} lang={lang} />)}
          </div>
        </div>
      )}

      {govObs.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            {lang === "es" ? "Gobierno" : "Government"}
          </p>
          <div className="space-y-2">
            {govObs.map((ob) => <ObligationRow key={ob.id} ob={ob} lang={lang} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Onboarding checklist items for a worker derived from existing fields. */
function pendingItems(w: any): string[] {
  const items: string[] = [];
  if (!w.curp) items.push("CURP");
  if (!w.is_imss_registered) items.push("IMSS");
  if (!w.imss_nss) items.push("NSS");
  if (!w.has_contract) items.push(w.full_name.split(" ")[0] + ": contrato");
  if (!w.invite_status || w.invite_status === "pending") items.push("Invitar a la app");
  return items;
}

function OnboardingPending({ workers, lang }: { workers: any[]; lang: "en" | "es" }) {
  const pending = workers.filter((w) => pendingItems(w).length > 0);
  if (pending.length === 0) return (
    <Card className="bg-sage-50 border-sage-100">
      <div className="flex items-center gap-3">
        <CheckCircle2 size={20} className="text-sage-600" />
        <div>
          <p className="font-medium text-sage-800 text-sm">
            {lang === "es" ? "¡Todo completo!" : "All caught up!"}
          </p>
          <p className="text-xs text-sage-600">
            {lang === "es" ? "Todos los expedientes están completos." : "All worker profiles are complete."}
          </p>
        </div>
      </div>
    </Card>
  );

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={16} className="text-amber-500" />
        <h3 className="font-semibold text-gray-900 text-sm">
          {lang === "es" ? "Expedientes incompletos" : "Incomplete profiles"}
        </h3>
        <Badge variant="warning">{pending.length}</Badge>
      </div>
      <div className="space-y-3">
        {pending.map((w) => {
          const items = pendingItems(w);
          return (
            <div key={w.id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-terracotta-100 text-terracotta-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {w.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{w.full_name}</span>
                  <Link to={`/workers/${w.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs h-6 px-2">
                      {lang === "es" ? "Completar →" : "Fix →"}
                    </Button>
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {items.map((item) => (
                    <span key={item} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const HOLIDAYS = RATES_2026.mandatory_holidays_2026 ?? [];

function UpcomingHolidays({ lang }: { lang: "en" | "es" }) {
  const today = new Date();
  const upcoming = HOLIDAYS.filter((h) => {
    const d = isoToDate(h.date);
    const diff = diffDays(today, d);
    return diff >= 0 && diff <= 60;
  }).slice(0, 4);

  if (upcoming.length === 0) return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <CalendarX2 size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-900 text-sm">
          {lang === "es" ? "Días festivos próximos" : "Upcoming holidays"}
        </h3>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {lang === "es" ? "Ninguno en los próximos 60 días." : "None in the next 60 days."}
      </p>
    </Card>
  );

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <CalendarX2 size={16} className="text-amber-500" />
        <h3 className="font-semibold text-gray-900 text-sm">
          {lang === "es" ? "Días festivos próximos" : "Upcoming holidays"}
        </h3>
      </div>
      <div className="space-y-2">
        {upcoming.map((h) => {
          const d = isoToDate(h.date);
          const days = diffDays(today, d);
          return (
            <div key={h.date} className="flex items-start gap-3 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
              <span className="text-base flex-shrink-0">🗓️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-tight">{h.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {d.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {" · "}
                  <span className="text-amber-600 font-medium">
                    {days === 0 ? (lang === "es" ? "Hoy" : "Today") :
                     days === 1 ? (lang === "es" ? "Mañana" : "Tomorrow") :
                     lang === "es" ? `En ${days} días` : `In ${days} days`}
                  </span>
                </p>
                {h.triple_pay && (
                  <p className="text-xs text-amber-600 mt-0.5 font-medium">
                    {lang === "es" ? "⚠️ Pago triple si trabaja" : "⚠️ Triple pay if worked"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Hardcoded tips as fallback (CMS may have more)
const FALLBACK_TIPS = [
  {
    key: "tip-aguinaldo",
    title: "Aguinaldo",
    body: "Toda trabajadora tiene derecho a un aguinaldo de al menos 15 días de salario, a pagar antes del 20 de diciembre.",
    legal_citation: "LFT Art. 87",
  },
  {
    key: "tip-holidays",
    title: "Días festivos",
    body: "Si la trabajadora labora un día festivo obligatorio, tiene derecho a pago triple (su salario regular + doble de bonificación).",
    legal_citation: "LFT Art. 75",
  },
  {
    key: "tip-vacation",
    title: "Vacaciones Dignas",
    body: "A partir de 2023 (reforma LFT), las trabajadoras tienen derecho a 12 días de vacaciones desde el primer año, aumentando 2 días por año hasta 20, luego 2 cada 5 años.",
    legal_citation: "LFT Art. 76 (reforma 2023)",
  },
  {
    key: "tip-imss",
    title: "IMSS obligatorio",
    body: "Las trabajadoras del hogar tienen derecho a seguridad social desde 2019. El patrón debe inscribirlas en el IMSS dentro de los 5 días hábiles de inicio de labores.",
    legal_citation: "LFTSE / LSS",
  },
  {
    key: "tip-prima",
    title: "Prima vacacional",
    body: "Además de los días de vacaciones, la trabajadora tiene derecho a una prima vacacional de al menos el 25% del salario correspondiente a esos días.",
    legal_citation: "LFT Art. 80",
  },
];

function DidYouKnow({ lang }: { lang: "en" | "es" }) {
  const { data: cms } = useApi(() => api.content.all(lang), [lang]);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * FALLBACK_TIPS.length));

  const tips = useMemo(() => {
    if (cms && cms.length > 0) return cms;
    return FALLBACK_TIPS;
  }, [cms]);

  function next() { setIdx((i) => (i + 1) % tips.length); }
  function prev() { setIdx((i) => (i - 1 + tips.length) % tips.length); }

  const tip = tips[idx];
  if (!tip) return null;

  return (
    <Card className="bg-gradient-to-br from-terracotta-50 to-sage-50 border-terracotta-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} className="text-terracotta-500 flex-shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wider text-terracotta-600">
              {lang === "es" ? "¿Sabías que?" : "Did you know?"}
            </p>
          </div>
          <h4 className="font-semibold text-gray-900 mb-1 text-sm">{tip.title}</h4>
          <p className="text-sm text-gray-700 leading-relaxed">{tip.body}</p>
          {tip.legal_citation && (
            <p className="text-xs text-gray-400 mt-2">{tip.legal_citation}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-white hover:bg-opacity-60 text-gray-400 hover:text-gray-600">
            <ChevronRight size={14} className="rotate-180" />
          </button>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-white hover:bg-opacity-60 text-gray-400 hover:text-gray-600">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3">
        {tips.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-terracotta-500 w-3" : "bg-terracotta-200"}`}
          />
        ))}
      </div>
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { lang } = useLanguage();
  const { data: workers, loading, error, refetch } = useApi(async () => {
    try { return await api.workers.cards(); }
    catch { return api.workers.list(); }
  }, []);

  const activeWorkers = workers ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === "es" ? "Panel principal" : "Dashboard"}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {lang === "es" ? "Tu hogar de un vistazo" : "Your household at a glance"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"
          >
            <RefreshCw size={16} />
          </button>
          <Link to="/workers/new">
            <Button size="sm">
              <Plus size={16} />
              {lang === "es" ? "Agregar trabajadora" : "Add worker"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
          <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {/* Stats bar */}
          {activeWorkers.length > 0 && (
            <StatBar workers={activeWorkers} obligations={buildObligations(activeWorkers, new Date())} lang={lang} />
          )}

          {/* Empty state */}
          {activeWorkers.length === 0 && !error && (
            <Card className="text-center py-16 mb-8">
              <Users size={48} className="text-gray-200 mx-auto mb-4" />
              <h2 className="font-semibold text-gray-700 mb-2">
                {lang === "es" ? "Agrega tu primera trabajadora" : "Add your first worker"}
              </h2>
              <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
                {lang === "es"
                  ? "El panel mostrará nóminas, vencimientos y recordatorios una vez que registres a tu trabajadora."
                  : "The dashboard will show payroll due dates, obligations, and reminders once you add a worker."}
              </p>
              <Link to="/workers/new">
                <Button><Plus size={16} />{lang === "es" ? "Agregar trabajadora" : "Add worker"}</Button>
              </Link>
            </Card>
          )}

          {/* Payment obligations */}
          {activeWorkers.length > 0 && (
            <PaymentObligations workers={activeWorkers} lang={lang} />
          )}

          {/* Two-column: onboarding + holidays */}
          {activeWorkers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <OnboardingPending workers={activeWorkers} lang={lang} />
              <UpcomingHolidays lang={lang} />
            </div>
          )}

          {/* Did you know */}
          <DidYouKnow lang={lang} />
        </>
      )}
    </div>
  );
}
