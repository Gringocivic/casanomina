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
import { useMinimumWage, isSbcStale } from "../components/SbcReminderBadge";
import { QuickPayrollModal } from "../components/QuickPayrollModal";
import {
  Users, AlertTriangle, CalendarX2, ChevronDown, ChevronRight,
  Play, CheckCircle2, Circle, Info, Plus, TrendingUp, RefreshCw,
  Clock, AlertCircle, ShieldAlert,
} from "lucide-react";
import {
  RATES_2026,
  calculateSBC,
  calculateIMSSContributions,
  calculateINFONAVIT,
  calculateAguinaldo,
  calculateISR,
  calculateYearsOfService,
  daysBetweenInclusive,
} from "@casanomina/calculator";

// ─── Types ────────────────────────────────────────────────────────────────────

type ObligationType = "worker_payroll" | "imss" | "isr" | "aguinaldo";

interface WorkerDetailRow {
  id: string;
  name: string;
  daily_salary: number;
  days_per_week?: number;
  sbc?: number;
  employer_imss?: number;
  worker_imss?: number;
  infonavit?: number;
  isr_monthly?: number;
  current_month_isr?: number;
  accrued_days?: number;
  aguinaldo_amount?: number;
  estimated_aguinaldo?: number;
  hasRuns: boolean;
}

interface Obligation {
  id: string;
  type: ObligationType;
  label: string;
  sublabel?: string;
  dueDate: Date;
  daysUntil: number;
  amount: number;
  amount_estimated?: number;
  isEstimate: boolean;
  isOverdue: boolean;
  workerId?: string;
  workerName?: string;
  detail?: { en: string; es: string };
  workerDetails?: WorkerDetailRow[];
  periodStart?: Date;
  periodEnd?: Date;
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

function fmtShortDate(d: Date, lang: "en" | "es"): string {
  return d.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
    month: "short", day: "numeric",
  });
}

function fmtMoney(n?: number): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Next IMSS bimestral due date plus the bimester's period range. */
function nextImssDue(today: Date): {
  due: Date; period: string; periodStart: Date; periodEnd: Date;
} {
  const schedule = [
    { closeMonth: 2,  dueMonth: 3,  label: "Ene-Feb", startM: 1,  endM: 2  },
    { closeMonth: 4,  dueMonth: 5,  label: "Mar-Abr", startM: 3,  endM: 4  },
    { closeMonth: 6,  dueMonth: 7,  label: "May-Jun", startM: 5,  endM: 6  },
    { closeMonth: 8,  dueMonth: 9,  label: "Jul-Ago", startM: 7,  endM: 8  },
    { closeMonth: 10, dueMonth: 11, label: "Sep-Oct", startM: 9,  endM: 10 },
    { closeMonth: 12, dueMonth: 1,  label: "Nov-Dic", startM: 11, endM: 12 },
  ];
  const yr = today.getFullYear();
  for (const s of schedule) {
    const dueYear = s.dueMonth === 1 ? yr + 1 : yr;
    const due = new Date(dueYear, s.dueMonth - 1, 17);
    if (due >= today) {
      const periodStart = new Date(yr, s.startM - 1, 1);
      const periodEnd   = new Date(yr, s.endM, 0); // last day of endM
      return { due, period: s.label, periodStart, periodEnd };
    }
  }
  return {
    due: new Date(yr + 1, 0, 17),
    period: "Nov-Dic",
    periodStart: new Date(yr, 10, 1),
    periodEnd:   new Date(yr, 11, 31),
  };
}

/** Next ISR monthly due date plus the covered month's period range. */
function nextIsrDue(today: Date): {
  due: Date; period: string; periodStart: Date; periodEnd: Date;
} {
  const yr = today.getFullYear();
  const mo = today.getMonth();
  let dueYear = yr;
  let dueMo = mo + 1;
  if (dueMo > 11) { dueMo = 0; dueYear++; }
  const due = new Date(dueYear, dueMo, 17);

  // The ISR period is the calendar month before the due date
  const periodMo   = dueMo === 0 ? 11 : dueMo - 1;
  const periodYear = dueMo === 0 ? dueYear - 1 : dueYear;
  const periodStart = new Date(periodYear, periodMo, 1);
  const periodEnd   = new Date(periodYear, periodMo + 1, 0);

  if (due < today) {
    dueMo++;
    if (dueMo > 11) { dueMo = 0; dueYear++; }
    const newPMo   = dueMo === 0 ? 11 : dueMo - 1;
    const newPYear = dueMo === 0 ? dueYear - 1 : dueYear;
    return {
      due: new Date(dueYear, dueMo, 17),
      period: new Date(yr, mo + 1, 1).toLocaleDateString("es-MX", { month: "long" }),
      periodStart: new Date(newPYear, newPMo, 1),
      periodEnd:   new Date(newPYear, newPMo + 1, 0),
    };
  }
  const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return { due, period: MONTHS_ES[mo], periodStart, periodEnd };
}

/** Next worker payroll due date. Uses payroll_dow (weekly/biweekly) or payroll_dom (monthly). */
function nextWorkerPayDate(worker: any, today: Date = new Date()): Date {
  const freq: string = worker.pay_frequency ?? "weekly";

  if (freq === "weekly" || freq === "biweekly") {
    const payDow: number | null | undefined = worker.payroll_dow;
    if (payDow == null) {
      const base = worker.last_run?.period_end
        ? isoToDate(worker.last_run.period_end)
        : isoToDate(worker.start_date);
      return addDays(base, freq === "weekly" ? 7 : 14);
    }
    if (freq === "weekly") {
      const tomorrow = addDays(today, 1);
      const tDow = (tomorrow.getDay() + 6) % 7;
      const daysUntil = (payDow - tDow + 7) % 7;
      return addDays(tomorrow, daysUntil);
    }
    // biweekly
    const start = isoToDate(worker.start_date);
    const sDow = (start.getDay() + 6) % 7;
    const offset = ((payDow - sDow + 7) % 7) || 14;
    const firstPay = addDays(start, offset);
    const elapsed = diffDays(firstPay, today);
    if (elapsed < 0) return firstPay;
    return addDays(firstPay, Math.ceil(elapsed / 14) * 14);
  }

  if (freq === "monthly") {
    const payDom: number | null | undefined = worker.payroll_dom;
    if (payDom == null) {
      const base = worker.last_run?.period_end
        ? isoToDate(worker.last_run.period_end)
        : isoToDate(worker.start_date);
      return addDays(base, 30);
    }
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), payDom);
    if (thisMonth > today) return thisMonth;
    return new Date(today.getFullYear(), today.getMonth() + 1, payDom);
  }

  // Semi-monthly: always 15th and last day of month
  const yr = today.getFullYear();
  const mo = today.getMonth();
  const fifteenth = new Date(yr, mo, 15);
  const lastDay   = new Date(yr, mo + 1, 0);
  if (fifteenth > today) return fifteenth;
  if (lastDay > today)   return lastDay;
  return new Date(yr, mo + 1, 15);
}

/** Employer monthly IMSS cost for one worker — scaled by scheduled days/month. */
function monthlyImssEmployer(worker: any): number {
  const daysPerWeek = worker.days_per_week ?? 6;
  const daysPerMonth = daysPerWeek * (52 / 12); // same formula as wages
  const todayIso = new Date().toISOString().split("T")[0];
  const years = calculateYearsOfService(worker.start_date, todayIso);
  const sbc = calculateSBC(parseFloat(worker.daily_salary), RATES_2026, years);
  const imss = calculateIMSSContributions(sbc, RATES_2026);
  return imss.total_employer * daysPerMonth;
}

/** Employer bimestral IMSS estimate — 2 months of scheduled days (employer share only). */
function bimestralImssEmployer(worker: any): number {
  return monthlyImssEmployer(worker) * 2;
}

/** Total bimestral amount payable to IMSS — employer IMSS + worker IMSS + INFONAVIT. */
function bimestralTotalPayable(worker: any): number {
  const daysPerWeek = worker.days_per_week ?? 6;
  const daysPerBimester = daysPerWeek * (52 / 12) * 2;
  const todayIso = new Date().toISOString().split("T")[0];
  const years = calculateYearsOfService(worker.start_date, todayIso);
  const sbc = calculateSBC(parseFloat(worker.daily_salary), RATES_2026, years);
  const imss = calculateIMSSContributions(sbc, RATES_2026);
  const infonavit = calculateINFONAVIT(sbc, RATES_2026);
  return (imss.total_employer + imss.total_worker + infonavit) * daysPerBimester;
}

/** ISR withheld expected per month — salary-based, scaled to actual scheduled days.
 *  Uses days_per_week × (52/12) so part-time workers get a correct projection.
 *  The "Withheld" column shows what was actually deducted; this shows what to expect.
 */
function monthlyIsrEstimate(worker: any): number {
  const dailySalary = parseFloat(worker.daily_salary ?? "0");
  if (dailySalary <= 0) return 0;
  const daysPerWeek = worker.days_per_week ?? 6;
  const daysPerMonth = daysPerWeek * (52 / 12);
  return calculateISR(dailySalary, daysPerMonth, RATES_2026).period_isr_withholding;
}

/** Total monthly employer outlay estimate for one worker. */
function monthlyEmployerCost(worker: any): number {
  const dailySalary = parseFloat(worker.daily_salary ?? "0");
  const daysPerWeek = worker.days_per_week ?? 6;
  const monthlyWage = dailySalary * daysPerWeek * (52 / 12);
  const todayIso = new Date().toISOString().split("T")[0];
  const years = calculateYearsOfService(worker.start_date, todayIso);
  const sbc = calculateSBC(dailySalary, RATES_2026, years);
  const imss = calculateIMSSContributions(sbc, RATES_2026);
  const infonavit = calculateINFONAVIT(sbc, RATES_2026);
  const daysPerMonth = daysPerWeek * (52 / 12);
  const monthlyImss = imss.total_employer * daysPerMonth;
  return monthlyWage + monthlyImss + infonavit * daysPerMonth;
}

/** Aguinaldo deadline: Dec 20 of current year; next year if already past. */
function aguinaldoDue(today: Date): Date {
  const d = new Date(today.getFullYear(), 11, 20);
  if (d < today) return new Date(today.getFullYear() + 1, 11, 20);
  return d;
}

/** Aguinaldo owed across all workers to date. */
function totalAguinaldoAccrued(workers: any[]): number {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const yearStart = `${today.getFullYear()}-01-01`;
  return workers.reduce((sum, w) => {
    const dailySalary = parseFloat(w.daily_salary ?? "0");
    const effectiveStart = w.start_date > yearStart ? w.start_date : yearStart;
    const daysThisYear = Math.max(1, daysBetweenInclusive(effectiveStart, todayStr));
    return sum + calculateAguinaldo(dailySalary, daysThisYear, RATES_2026);
  }, 0);
}

// ─── Obligation builder ───────────────────────────────────────────────────────

function buildObligations(workers: any[], today: Date): Obligation[] {
  const obligations: Obligation[] = [];
  const imssWorkers = workers.filter((w) => w.is_imss_registered);
  const todayStr = today.toISOString().split("T")[0];
  const yearStart = `${today.getFullYear()}-01-01`;

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
      : parseFloat(w.daily_salary ?? "0") * daysPerWeek * (periodDays / 7) * 0.85;
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

  // IMSS bimestral
  if (imssWorkers.length > 0) {
    const { due: imssDue, period, periodStart, periodEnd } = nextImssDue(today);
    const daysUntil = diffDays(today, imssDue);
    const totalImss = imssWorkers.reduce((s, w) => s + bimestralTotalPayable(w), 0);

    const workerDetails: WorkerDetailRow[] = imssWorkers.map((w) => {
      const dailySalary = parseFloat(w.daily_salary ?? "0");
      const todayIso = new Date().toISOString().split("T")[0];
      const years = calculateYearsOfService(w.start_date, todayIso);
      const sbc = calculateSBC(dailySalary, RATES_2026, years);
      const imss = calculateIMSSContributions(sbc, RATES_2026);
      const infonavit = calculateINFONAVIT(sbc, RATES_2026);
      const daysPerWeekW = w.days_per_week ?? 6;
      const daysPerBimester = daysPerWeekW * (52 / 12) * 2;
      return {
        id: w.id,
        name: w.full_name,
        daily_salary: dailySalary,
        days_per_week: daysPerWeekW,
        sbc,
        employer_imss: imss.total_employer * daysPerBimester,
        worker_imss: imss.total_worker * daysPerBimester,
        infonavit: infonavit * daysPerBimester,
        hasRuns: (w.ytd?.run_count ?? 0) > 0,
      };
    });

    obligations.push({
      id: "imss-bimestral",
      type: "imss",
      label: "IMSS/INFONAVIT Bimestral",
      sublabel: period,
      dueDate: imssDue,
      daysUntil,
      amount: totalImss,
      isEstimate: true,
      isOverdue: daysUntil < 0,
      detail: { en: "Pay via IDSE / SIPARE by the 17th.", es: "Pagar en IDSE / SIPARE antes del día 17." },
      workerDetails,
      periodStart,
      periodEnd,
    });
  }

  // ISR monthly
  const totalIsrMonthly = workers.reduce((s, w) => s + monthlyIsrEstimate(w), 0);
  if (workers.length > 0) {
    const { due: isrDue, period, periodStart, periodEnd } = nextIsrDue(today);
    const daysUntil = diffDays(today, isrDue);

    const workerDetails: WorkerDetailRow[] = workers.map((w) => ({
      id: w.id,
      name: w.full_name,
      daily_salary: parseFloat(w.daily_salary ?? "0"),
      isr_monthly: monthlyIsrEstimate(w),
      current_month_isr: w.current_month_isr ?? 0,
      hasRuns: !!(w.last_run?.period_end && isoToDate(w.last_run.period_end) >= periodStart),
    }));

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
      detail: { en: "File and pay via monthly SAT declaration.", es: "Declarar y pagar vía SIPARE o declaración mensual en el SAT." },
      workerDetails,
      periodStart,
      periodEnd,
    });
  }

  // Aguinaldo
  if (workers.length > 0) {
    const due = aguinaldoDue(today);
    const daysUntil = diffDays(today, due);
    const accrued = totalAguinaldoAccrued(workers);

    const workerDetails: WorkerDetailRow[] = workers.map((w) => {
      const dailySalary = parseFloat(w.daily_salary ?? "0");
      const effectiveStart = w.start_date > yearStart ? w.start_date : yearStart;
      const daysThisYear = Math.max(1, daysBetweenInclusive(effectiveStart, todayStr));
      const dec20Str = `${today.getFullYear()}-12-20`;
      const daysToEnd = daysBetweenInclusive(effectiveStart, dec20Str);
      const estimatedDays = Math.round(daysToEnd * (w.days_per_week ?? 6) / 7);
      return {
        id: w.id,
        name: w.full_name,
        daily_salary: dailySalary,
        accrued_days: daysThisYear,
        aguinaldo_amount: calculateAguinaldo(dailySalary, daysThisYear, RATES_2026),
        estimated_aguinaldo: calculateAguinaldo(dailySalary, Math.max(daysThisYear, estimatedDays), RATES_2026),
        hasRuns: (w.ytd?.run_count ?? 0) > 0,
      };
    });

    obligations.push({
      id: "aguinaldo",
      type: "aguinaldo",
      label: "Aguinaldo",
      sublabel: due.getFullYear().toString(),
      dueDate: due,
      daysUntil,
      amount: accrued,
      amount_estimated: workerDetails.reduce((s, w) => s + (w.estimated_aguinaldo ?? 0), 0),
      isEstimate: true,
      isOverdue: daysUntil < 0,
      detail: { en: "Due Dec 20. Minimum 15 days salary (LFT Art. 87).", es: "Vence el 20 de diciembre. Mínimo 15 días de salario (LFT Art. 87)." },
      workerDetails,
      periodStart: new Date(today.getFullYear(), 0, 1),
      periodEnd: today,
    });
  }

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

// ─── Government detail panel ──────────────────────────────────────────────────

function GovDetailPanel({ ob, lang }: { ob: Obligation; lang: "en" | "es" }) {
  const hasRunsAll = ob.workerDetails?.every((w) => w.hasRuns);
  const hasRunsAny = ob.workerDetails?.some((w) => w.hasRuns);

  const dataSourceNote = hasRunsAll
    ? (lang === "es" ? "Basado en nóminas registradas en CasaNomina." : "Based on recorded payroll runs in CasaNomina.")
    : hasRunsAny
    ? (lang === "es" ? "Mezcla de nóminas registradas (~) y estimaciones por salario." : "Mix of recorded payroll and salary estimates (~).")
    : (lang === "es" ? "Estimado con base en el salario. Sin nóminas registradas en este período." : "Estimated from salary data — no payroll runs recorded for this period.");

  return (
    <div className="space-y-3">
      {/* Period */}
      {ob.periodStart && ob.periodEnd && (
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-gray-700">
            {lang === "es" ? "Período:" : "Period:"}
          </span>{" "}
          {fmtShortDate(ob.periodStart, lang)} – {fmtShortDate(ob.periodEnd, lang)}
        </p>
      )}

      {/* IMSS breakdown */}
      {ob.type === "imss" && ob.workerDetails && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "Trabajadora" : "Worker"}
                </th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">SBC/día</th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "IMSS patrón" : "Employer IMSS"}
                </th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "IMSS trab. (retener)" : "Worker IMSS (withheld)"}
                </th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">INFONAVIT</th>
                <th className="text-right py-1 font-medium text-terracotta-600 whitespace-nowrap">
                  {lang === "es" ? "Total patrón" : "Your total"}
                </th>
              </tr>
            </thead>
            <tbody>
              {ob.workerDetails.map((w) => (
                <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className="font-medium text-gray-800">{w.name}</span>
                    {!w.hasRuns && (
                      <span className="ml-1 text-amber-400 text-xs" title={lang === "es" ? "Estimado" : "Estimated"}>~</span>
                    )}
                    {w.days_per_week != null && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        {w.days_per_week}d/{lang === "es" ? "sem" : "wk"}
                      </span>
                    )}
                  </td>
                  <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">{fmtMoney(w.sbc)}</td>
                  <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">{fmtMoney(w.employer_imss)}</td>
                  <td className="text-right py-1.5 pr-3 text-gray-400 italic whitespace-nowrap">{fmtMoney(w.worker_imss)}</td>
                  <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">{fmtMoney(w.infonavit)}</td>
                  <td className="text-right py-1.5 font-semibold text-gray-800 whitespace-nowrap">
                    {fmtMoney((w.employer_imss ?? 0) + (w.infonavit ?? 0))}
                  </td>
                </tr>
              ))}
              {ob.workerDetails.length > 1 && (
                <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50/50">
                  <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap" colSpan={2}>
                    {lang === "es" ? "Totales" : "Totals"}
                  </td>
                  <td className="text-right py-1.5 pr-3 text-gray-800 whitespace-nowrap">
                    {fmtMoney(ob.workerDetails.reduce((s, w) => s + (w.employer_imss ?? 0), 0))}
                  </td>
                  <td className="text-right py-1.5 pr-3 text-gray-400 italic font-normal whitespace-nowrap">
                    {fmtMoney(ob.workerDetails.reduce((s, w) => s + (w.worker_imss ?? 0), 0))}
                  </td>
                  <td className="text-right py-1.5 pr-3 text-gray-800 whitespace-nowrap">
                    {fmtMoney(ob.workerDetails.reduce((s, w) => s + (w.infonavit ?? 0), 0))}
                  </td>
                  <td className="text-right py-1.5 text-terracotta-700 font-bold whitespace-nowrap">
                    {fmtMoney(ob.workerDetails.reduce((s, w) => s + (w.employer_imss ?? 0) + (w.infonavit ?? 0), 0))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-1 italic">
            {lang === "es"
              ? "IMSS trabajadora se descuenta de su salario; IMSS patrón e INFONAVIT los paga usted."
              : "Worker IMSS is deducted from their wages; employer IMSS and INFONAVIT are your cost."}
          </p>
          {/* Grand total summary */}
          {(() => {
            const withheld = (ob.workerDetails ?? []).reduce((s, w) => s + (w.worker_imss ?? 0), 0);
            const yourCost = (ob.workerDetails ?? []).reduce((s, w) => s + (w.employer_imss ?? 0) + (w.infonavit ?? 0), 0);
            const grandTotal = withheld + yourCost;
            const dueDateStr = ob.dueDate.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric", year: "numeric" });
            return (
              <div className="mt-3 p-3 bg-terracotta-50 border border-terracotta-100 rounded-lg">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <span className="text-gray-500">{fmtMoney(withheld)}</span>
                  <span className="text-gray-400 mx-1">({lang === "es" ? "retenido de trabajadoras" : "withheld from workers"})</span>
                  <span className="text-gray-400 mx-1">+</span>
                  <span className="text-gray-700">{fmtMoney(yourCost)}</span>
                  <span className="text-gray-400 mx-1">({lang === "es" ? "tu aportación" : "your contribution"})</span>
                  <span className="text-gray-400 mx-1">=</span>
                  <span className="font-bold text-terracotta-700">{fmtMoney(grandTotal)}</span>
                  <span className="text-gray-500 ml-1">
                    ({lang === "es" ? "a pagar el" : "to pay by"} {dueDateStr})
                  </span>
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ISR breakdown */}
      {ob.type === "isr" && ob.workerDetails && (() => {
        const allPaid = ob.workerDetails.every((w) => w.hasRuns);
        const totalWithheld = ob.workerDetails.reduce((s, w) => s + (w.current_month_isr ?? 0), 0);
        const totalMonthly  = ob.workerDetails.reduce((s, w) => s + (w.isr_monthly ?? 0), 0);
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1 pr-3 font-medium whitespace-nowrap">
                    {lang === "es" ? "Trabajadora" : "Worker"}
                  </th>
                  <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">
                    {lang === "es" ? "ISR mensual ~" : "Monthly ISR ~"}
                  </th>
                  <th className="text-right py-1 font-medium whitespace-nowrap">
                    {lang === "es" ? "Retenido" : "Withheld"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ob.workerDetails.map((w) => (
                  <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-1.5 pr-3 font-medium text-gray-800 whitespace-nowrap">
                      {w.name}
                      {!w.hasRuns && (
                        <span className="ml-1 text-amber-400 text-xs" title={lang === "es" ? "Sin nóminas registradas" : "No runs recorded"}>~</span>
                      )}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                      {w.isr_monthly && w.isr_monthly > 0
                        ? fmtMoney(w.isr_monthly)
                        : w.hasRuns
                          ? <span className="text-gray-500" title={lang === "es" ? "Subsidio al empleo cubre el ISR" : "Employment subsidy covers ISR"}>$0.00</span>
                          : <span className="text-gray-400 italic">{lang === "es" ? "estimado" : "~estimated"}</span>
                      }
                    </td>
                    <td className="text-right py-1.5 text-gray-600 whitespace-nowrap">
                      {w.hasRuns
                        ? fmtMoney(w.current_month_isr ?? 0)
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t border-gray-200 ${allPaid ? "font-bold text-gray-900" : "text-gray-500"}`}>
                  <td className="pt-1.5 pr-3 whitespace-nowrap">{lang === "es" ? "Total" : "Total"}</td>
                  <td className="text-right pt-1.5 pr-3 whitespace-nowrap">{fmtMoney(totalMonthly)}</td>
                  <td className="text-right pt-1.5 whitespace-nowrap">{fmtMoney(totalWithheld)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-gray-400 mt-1 italic">
              {lang === "es"
                ? "ISR retenido del salario de la trabajadora; usted lo remite al SAT."
                : "ISR withheld from worker wages; you remit it to SAT."}
            </p>
          </div>
        );
      })()}

      {/* Aguinaldo breakdown */}
      {ob.type === "aguinaldo" && ob.workerDetails && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "Trabajadora" : "Worker"}
                </th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "Salario/día" : "Daily salary"}
                </th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "Días trab. YTD" : "Days worked YTD"}
                </th>
                <th className="text-right py-1 pr-3 font-medium whitespace-nowrap">
                  {lang === "es" ? "Aguinaldo ganado YTD" : "Aguinaldo earned YTD"}
                </th>
                <th className="text-right py-1 font-medium whitespace-nowrap">
                  {lang === "es" ? "Aguinaldo estimado" : "Estimated aguinaldo"}
                </th>
              </tr>
            </thead>
            <tbody>
              {ob.workerDetails.map((w) => (
                <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-1.5 pr-3 font-medium text-gray-800 whitespace-nowrap">{w.name}</td>
                  <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">{fmtMoney(w.daily_salary)}</td>
                  <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">{w.accrued_days ?? "—"}</td>
                  <td className="text-right py-1.5 pr-3 text-gray-600 whitespace-nowrap">{fmtMoney(w.aguinaldo_amount)}</td>
                  <td className="text-right py-1.5 text-amber-700 font-medium whitespace-nowrap">{w.estimated_aguinaldo ? fmtMoney(w.estimated_aguinaldo) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold text-gray-700">
                <td className="py-1.5 pr-3 whitespace-nowrap">{lang === "es" ? "Total" : "Total"}</td>
                <td className="text-right py-1.5 pr-3"></td>
                <td className="text-right py-1.5 pr-3 whitespace-nowrap">
                  {ob.workerDetails.reduce((s, w) => s + (w.accrued_days ?? 0), 0)}
                </td>
                <td className="text-right py-1.5 pr-3 text-gray-700 whitespace-nowrap">
                  {fmtMoney(ob.workerDetails.reduce((s, w) => s + (w.aguinaldo_amount ?? 0), 0))}
                </td>
                <td className="text-right py-1.5 text-amber-700 whitespace-nowrap">
                  {fmtMoney(ob.workerDetails.reduce((s, w) => s + (w.estimated_aguinaldo ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="flex items-start gap-3 mt-2 text-xs text-gray-400 italic">
            <span>
              {lang === "es"
                ? "Ganado YTD: acumulado proporcional hasta hoy. Estimado: proyección a dic 20 según días/sem del contrato."
                : "Earned YTD: prorated accrual through today. Estimated: projection to Dec 20 based on contracted days/week."}
            </span>
          </div>
        </div>
      )}

      {/* Detail note + data source */}
      {ob.detail && (
        <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">{ob.detail[lang]}</p>
      )}
      <p className="text-xs text-gray-400 italic">{dataSourceNote}</p>
      {ob.type === "isr" && (
        <p className="text-xs text-gray-400 italic mt-1">
          {lang === "es"
            ? "Se cuentan los períodos cuyo inicio cae en este mes. Períodos que comenzaron el mes anterior no se incluyen aquí."
            : "Counts pay periods whose start date falls in this month. Periods that started last month are not included here."}
        </p>
      )}
    </div>
  );
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

function ObligationRow({ ob, lang, onRun }: { ob: Obligation; lang: "en" | "es"; onRun?: (workerId: string) => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const c = urgencyColor(ob.daysUntil, ob.isOverdue);
  const hasDetail = !!(ob.workerDetails?.length || ob.detail);

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
            {ob.amount_estimated != null ? (
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">{lang === "es" ? "Ganado YTD:" : "Earned YTD:"}</span>
                  <MoneyAmount amount={ob.amount} size="sm" className="text-gray-600" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-amber-600 font-medium">{lang === "es" ? "Estimado total:" : "Full-year est.:"}</span>
                  <MoneyAmount amount={ob.amount_estimated} size="md" className="font-bold text-amber-700" />
                </div>
              </div>
            ) : (
              <MoneyAmount amount={ob.amount} size="md" className="font-semibold text-gray-900" />
            )}
          </div>

          {ob.type === "worker_payroll" && ob.workerId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (onRun ? onRun(ob.workerId!) : navigate(`/payroll?worker=${ob.workerId}`))}
              className="flex items-center gap-1"
            >
              <Play size={12} />
              {lang === "es" ? "Pagar" : "Run"}
            </Button>
          )}

          {hasDetail && (
            <button
              onClick={() => setOpen(!open)}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label={open ? "Collapse" : "Expand"}
            >
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {open && hasDetail && (
        <div className="px-4 pb-4 pt-0">
          <div className="ml-11 p-3 bg-white bg-opacity-70 rounded-lg border border-gray-100">
            {ob.workerDetails?.length ? (
              <GovDetailPanel ob={ob} lang={lang} />
            ) : ob.detail ? (
              <p className="text-xs text-gray-600">{ob.detail[lang]}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentObligations({ workers, lang, onRun }: { workers: any[]; lang: "en" | "es"; onRun?: (workerId: string) => void }) {
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
        <Badge variant="neutral">
          {obligations.filter((o) => o.daysUntil <= 10 || o.isOverdue).length}{" "}
          {lang === "es" ? "próximas" : "upcoming"}
        </Badge>
      </div>

      {workerObs.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            {lang === "es" ? "Nómina" : "Worker payroll"}
          </p>
          <div className="space-y-2">
            {workerObs.map((ob) => <ObligationRow key={ob.id} ob={ob} lang={lang} onRun={onRun} />)}
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

/** Onboarding checklist items for a worker. */
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

/**
 * Dashboard-level SBC reminder card — lists workers whose daily_salary is
 * below the current minimum wage for their zone (see components/SbcReminderBadge.tsx
 * for the trigger rationale). Informational only; links to the worker's
 * profile so the employer can review and update the salary / re-report to IMSS.
 */
function SbcReminders({ workers, lang }: { workers: any[]; lang: "en" | "es" }) {
  const minWage = useMinimumWage();
  const flagged = workers.filter((w) => isSbcStale(w, minWage));

  if (flagged.length === 0) return null;

  return (
    <Card className="bg-amber-50 border-amber-200 mb-8">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-amber-600" />
        <h3 className="font-semibold text-gray-900 text-sm">
          {lang === "es" ? "Posible SBC desactualizado" : "SBC may need review"}
        </h3>
        <Badge variant="warning">{flagged.length}</Badge>
      </div>
      <p className="text-xs text-amber-700 mb-3">
        {lang === "es"
          ? "El salario diario de estas trabajadoras está por debajo del salario mínimo vigente. Considera actualizarlo y reportar el nuevo SBC al IMSS."
          : "These workers' daily salary is below the current minimum wage. Consider updating it and re-reporting the SBC to IMSS."}
      </p>
      <div className="flex flex-wrap gap-2">
        {flagged.map((w) => (
          <Link
            key={w.id}
            to={`/workers/${w.id}`}
            className="text-xs font-medium bg-white border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
          >
            {w.full_name}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * Approved payroll runs not yet marked paid — a to-do item on the dashboard.
 * Lets the employer mark them paid inline (POST /api/payroll/:id/mark-paid)
 * without having to open Payroll History.
 */
function UnpaidApprovedRuns({ runs, lang, onChanged }: { runs: any[]; lang: "en" | "es"; onChanged: () => void }) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (runs.length === 0) return null;

  async function markPaid(id: string) {
    setPayingId(id);
    setError(null);
    try {
      await api.payroll.markPaid(id);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPayingId(null);
    }
  }

  return (
    <Card className="bg-blue-50 border-blue-200 mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-blue-600" />
        <h3 className="font-semibold text-gray-900 text-sm">
          {lang === "es" ? "Nóminas aprobadas por pagar" : "Approved payroll awaiting payment"}
        </h3>
        <Badge variant="warning">{runs.length}</Badge>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-2">
        {runs.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 bg-white border border-blue-100 rounded-xl px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{r.worker_name}</p>
              <p className="text-xs text-gray-500">
                {fmtShortDate(isoToDate(r.period_start), lang)} – {fmtShortDate(isoToDate(r.period_end), lang)}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <MoneyAmount amount={r.net_pay} size="sm" className="text-gray-900 font-semibold" />
              <Button size="sm" variant="secondary" loading={payingId === r.id} onClick={() => markPaid(r.id)}>
                <CheckCircle2 size={14} />
                {lang === "es" ? "Marcar pagada" : "Mark paid"}
              </Button>
            </div>
          </div>
        ))}
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

  // Quick payroll modal + approved-but-unpaid runs for the to-do area.
  const [quickPayrollWorker, setQuickPayrollWorker] = useState<any>(null);
  const { data: allRuns, refetch: refetchRuns } = useApi(() => api.payrollHistory.all(), []);
  const approvedUnpaid = (allRuns ?? []).filter((r: any) => r.status === "approved");

  return (
    <div className="p-8 max-w-5xl mx-auto">
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

      {error && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
          <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      )}

      {!loading && (
        <>
          {activeWorkers.length > 0 && (
            <StatBar workers={activeWorkers} obligations={buildObligations(activeWorkers, new Date())} lang={lang} />
          )}

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

          {activeWorkers.length > 0 && (
            <PaymentObligations
              workers={activeWorkers}
              lang={lang}
              onRun={(id) => setQuickPayrollWorker(activeWorkers.find((w: any) => w.id === id) ?? null)}
            />
          )}

          {approvedUnpaid.length > 0 && (
            <UnpaidApprovedRuns runs={approvedUnpaid} lang={lang} onChanged={refetchRuns} />
          )}

          {activeWorkers.length > 0 && (
            <SbcReminders workers={activeWorkers} lang={lang} />
          )}

          {activeWorkers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <OnboardingPending workers={activeWorkers} lang={lang} />
              <UpcomingHolidays lang={lang} />
            </div>
          )}

          <DidYouKnow lang={lang} />
        </>
      )}

      {quickPayrollWorker && (
        <QuickPayrollModal
          worker={quickPayrollWorker}
          onClose={() => setQuickPayrollWorker(null)}
          onSaved={() => { refetch(); refetchRuns(); }}
        />
      )}
    </div>
  );
}
