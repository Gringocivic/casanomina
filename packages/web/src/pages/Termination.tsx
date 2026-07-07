/**
 * pages/Termination.tsx
 *
 * Finiquito / Liquidación calculator pre-filled from a real worker record.
 * Route: /workers/:id/terminate
 */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  format, parseISO, differenceInYears, differenceInMonths,
  differenceInDays, startOfYear,
} from "date-fns";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import { ArrowLeft, Calculator, Info, Scale, UserMinus } from "lucide-react";

type CalcType = "finiquito" | "liquidacion";

interface FiniquitoResult {
  pending_wages: number;
  proportional_aguinaldo: number;
  proportional_vacation: number;
  proportional_prima_vacacional: number;
  total: number;
}
interface LiquidacionResult extends FiniquitoResult {
  constitutional_indemnity: number;
  twenty_days_per_year: number;
  seniority_premium: number;
}

// LFT vacation days table (post-Vacaciones Dignas 2023 reform)
function vacationDaysForYear(yearsCompleted: number): number {
  if (yearsCompleted < 1)  return 0;
  if (yearsCompleted < 2)  return 12;
  if (yearsCompleted < 3)  return 14;
  if (yearsCompleted < 4)  return 16;
  if (yearsCompleted < 5)  return 18;
  if (yearsCompleted < 6)  return 20;
  if (yearsCompleted < 11) return 22;
  if (yearsCompleted < 16) return 24;
  return 26;
}

const T = {
  back:          { en: "Workers",                      es: "Trabajadoras" },
  title:         { en: "Termination Calculator",       es: "Calculadora de Terminación" },
  subtitle:      { en: "Estimate what is owed at end of employment", es: "Estima lo que se debe al finalizar el empleo" },
  finiquito:     { en: "Finiquito (Resignation / Justified)", es: "Finiquito (Renuncia / Causa Justificada)" },
  finiquitoDesc: { en: "Worker resigns or employer terminates with legal cause", es: "La trabajadora renuncia o el empleador termina con causa justificada" },
  liquidacion:   { en: "Liquidación (Unjustified Dismissal)", es: "Liquidación (Despido Injustificado)" },
  liquidacionDesc: { en: "Employer dismisses without legal cause — full severance applies", es: "El empleador despide sin causa justificada — aplica indemnización completa" },
  termDate:      { en: "Termination Date",             es: "Fecha de Terminación" },
  calculate:     { en: "Calculate",                    es: "Calcular" },
  calculating:   { en: "Calculating…",                es: "Calculando…" },
  basis:         { en: "Calculation Basis",            es: "Base del Cálculo" },
  results:       { en: "Results",                      es: "Resultados" },
  pendingWages:  { en: "Pending wages",                es: "Salarios pendientes" },
  aguinaldo:     { en: "Proportional Christmas bonus (aguinaldo)", es: "Aguinaldo proporcional" },
  vacation:      { en: "Proportional vacation pay",    es: "Vacaciones proporcionales" },
  prima:         { en: "Vacation premium (prima vacacional)", es: "Prima vacacional" },
  indemnity:     { en: "Constitutional indemnity (3 months × daily × 30)", es: "Indemnización constitucional (3 meses × diario × 30)" },
  twentyDays:    { en: "20 days × year of service",   es: "20 días × año de servicio" },
  seniorityPremium: { en: "Seniority premium (12 days/yr, capped)", es: "Prima de antigüedad (12 días/año, topado)" },
  total:         { en: "Total owed",                   es: "Total a pagar" },
  disclaimer:    { en: "Estimate only. Consult a labor attorney before issuing final settlements.", es: "Solo estimación. Consulta a un abogado laboral antes de emitir liquidaciones definitivas." },
  lftRef:        { en: "Legal references: LFT Arts. 50, 76, 80, 87, 162", es: "Referencias legales: LFT Arts. 50, 76, 80, 87, 162" },
  notFound:      { en: "Worker not found",             es: "Trabajadora no encontrada" },
};

export function Termination() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLanguage();
  const { data: worker, loading: workerLoading } = useApi(() => api.workers.get(id!), [id]);

  const [calcType, setCalcType] = useState<CalcType>("finiquito");
  const [termDate, setTermDate] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<FiniquitoResult | LiquidacionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500 bg-white";

  async function calculate() {
    if (!worker) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const params = {
        daily_salary:     Number(worker.daily_salary),
        start_date:       worker.start_date,
        termination_date: termDate,
        wage_zone:        worker.wage_zone,
        worker_id:        worker.id,
      };
      const r = calcType === "finiquito"
        ? await api.calculate.finiquito(params)
        : await api.calculate.liquidacion(params);
      setResult(r as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const isLiquidacion = (r: any): r is LiquidacionResult =>
    r && "constitutional_indemnity" in r;

  // ── Intermediate basis values (computed on frontend from known inputs) ──────
  function computeBasis() {
    if (!worker || !termDate) return null;
    const start   = parseISO(worker.start_date);
    const end     = parseISO(termDate);
    const daily   = Number(worker.daily_salary);

    const yearsCompleted  = differenceInYears(end, start);
    const totalMonths     = differenceInMonths(end, start);
    const remainingMonths = totalMonths % 12;
    const totalDays       = differenceInDays(end, start) + 1; // inclusive

    // Days worked in current calendar year (Jan 1 → termDate inclusive)
    const janFirst        = startOfYear(end);
    const daysYTD         = differenceInDays(end, janFirst) + 1;

    // Aguinaldo: 15 days prorated by days worked this year / 365
    const aguinaldoDays   = (daysYTD / 365) * 15;

    // Vacation days for next cycle (prorated fraction of the year elapsed)
    const vacDays         = Math.round(vacationDaysForYear(yearsCompleted + 1) * (worker.days_per_week ?? 6) / 6);

    // Monthly equivalent for constitutional indemnity
    const monthlySalary   = daily * 30;

    return {
      yearsCompleted, remainingMonths, totalDays,
      daysYTD, aguinaldoDays, daily, vacDays, monthlySalary,
    };
  }

  const basis = result ? computeBasis() : null;

  if (workerLoading) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{T.notFound[lang]}</p>
        <Link to="/workers" className="text-terracotta-600 text-sm font-medium mt-2 inline-block hover:underline">
          ← {T.back[lang]}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Back */}
      <Link to="/workers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
        <ArrowLeft size={15} />
        {T.back[lang]}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <UserMinus size={20} className="text-terracotta-500" />
        <h1 className="text-2xl font-bold text-gray-900">{T.title[lang]}</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">{T.subtitle[lang]}</p>

      {/* Worker info strip */}
      <Card className="mb-6 bg-gray-50 border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-terracotta-100 text-terracotta-600 text-lg font-bold flex items-center justify-center shrink-0">
            {worker.full_name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{worker.full_name}</p>
            <p className="text-xs text-gray-500">
              {lang === "en" ? "Since" : "Desde"} {format(parseISO(worker.start_date), "MMM d, yyyy")}
            </p>
          </div>
          <div className="text-right shrink-0">
            <MoneyAmount amount={worker.daily_salary} size="md" className="text-gray-900" />
            <p className="text-xs text-gray-400">/{lang === "en" ? "day" : "día"}</p>
          </div>
        </div>
      </Card>

      {/* Type selector */}
      <div className="space-y-2 mb-6">
        {(["finiquito", "liquidacion"] as CalcType[]).map((type) => (
          <button key={type} onClick={() => { setCalcType(type); setResult(null); }}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
              calcType === type ? "border-terracotta-500 bg-terracotta-50" : "border-gray-100 bg-white hover:border-gray-200"
            }`}>
            <div className="flex items-center gap-2">
              <Scale size={15} className={calcType === type ? "text-terracotta-500" : "text-gray-400"} />
              <span className="font-semibold text-gray-900 text-sm">{T[type][lang]}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 ml-5">
              {T[`${type}Desc` as "finiquitoDesc" | "liquidacionDesc"][lang]}
            </p>
          </button>
        ))}
      </div>

      {/* Date + calculate */}
      <Card className="mb-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{T.termDate[lang]}</label>
            <input type="date" className={fieldClass} value={termDate}
              min={worker.start_date}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => { setTermDate(e.target.value); setResult(null); }} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button onClick={calculate} loading={loading} className="w-full justify-center">
            <Calculator size={15} />
            {loading ? T.calculating[lang] : T.calculate[lang]}
          </Button>
        </div>
      </Card>

      {/* Calculation basis */}
      {result && basis && (
        <Card className="mb-4 border-amber-100 bg-amber-50">
          <h4 className="font-semibold text-amber-800 text-sm mb-3">{T.basis[lang]}</h4>
          <div className="space-y-1.5 text-xs text-amber-900">
            <BasisRow
              label={lang === "en" ? "Employment period" : "Período laboral"}
              value={`${format(parseISO(worker.start_date), "MMM d, yyyy")} → ${format(parseISO(termDate), "MMM d, yyyy")}`}
            />
            <BasisRow
              label={lang === "en" ? "Years of service (completed)" : "Años de servicio (completados)"}
              value={`${basis.yearsCompleted} ${lang === "en" ? "yr" : "año"}${basis.yearsCompleted !== 1 ? "s" : ""}, ${basis.remainingMonths} ${lang === "en" ? "mo" : "mes"}${basis.remainingMonths !== 1 ? (lang === "en" ? "s" : "es") : ""}`}
            />
            <BasisRow
              label={lang === "en" ? "Daily salary" : "Salario diario"}
              value={`$${basis.daily.toFixed(2)} MXN`}
            />
            <div className="border-t border-amber-200 pt-1.5 mt-1.5">
              <BasisRow
                label={lang === "en" ? "Days worked this calendar year (YTD)" : "Días trabajados este año (YTD)"}
                value={`${basis.daysYTD} ${lang === "en" ? "days" : "días"}`}
              />
              <BasisRow
                label={lang === "en" ? "Aguinaldo days earned (15 × YTD/365)" : "Días de aguinaldo (15 × YTD/365)"}
                value={`${basis.aguinaldoDays.toFixed(2)} ${lang === "en" ? "days" : "días"}`}
              />
            </div>
            <div className="border-t border-amber-200 pt-1.5 mt-1.5">
              <BasisRow
                label={lang === "en" ? "Vacation days for current service year (LFT)" : "Días de vacaciones del ciclo actual (LFT)"}
                value={`${basis.vacDays} ${lang === "en" ? "days" : "días"}`}
              />
            </div>
            {isLiquidacion(result) && (
              <div className="border-t border-amber-200 pt-1.5 mt-1.5">
                <BasisRow
                  label={lang === "en" ? "Monthly equivalent (daily × 30)" : "Equivalente mensual (diario × 30)"}
                  value={`$${basis.monthlySalary.toFixed(2)} MXN`}
                />
                <BasisRow
                  label={lang === "en" ? "Constitutional indemnity basis (3 months)" : "Base indemnización constitucional (3 meses)"}
                  value={`3 × $${basis.monthlySalary.toFixed(2)}`}
                />
                <BasisRow
                  label={lang === "en" ? "20-days basis (per completed year)" : "Base 20 días (por año completado)"}
                  value={`20 × ${basis.yearsCompleted} ${lang === "en" ? "yrs" : "años"} × $${basis.daily.toFixed(2)}`}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card className="border-sage-100 bg-sage-50">
          <h3 className="font-semibold text-sage-800 mb-4 flex items-center gap-2">
            <Calculator size={16} />
            {T.results[lang]}
          </h3>
          <div className="space-y-2.5">
            <ResultRow label={T.pendingWages[lang]} amount={result.pending_wages} note={lang === "en" ? "Based on payroll records" : "Según registros de nómina"} />
            <ResultRow label={T.aguinaldo[lang]} amount={result.proportional_aguinaldo} />
            <ResultRow label={T.vacation[lang]} amount={result.proportional_vacation} />
            <ResultRow label={T.prima[lang]} amount={result.proportional_prima_vacacional} />

            {isLiquidacion(result) && (
              <div className="border-t border-sage-200 pt-2.5 mt-2.5">
                <p className="text-xs font-medium text-sage-700 uppercase tracking-wide mb-2.5">
                  {lang === "en" ? "Severance (Unjustified Dismissal)" : "Indemnización por Despido Injustificado"}
                </p>
                <div className="space-y-2.5">
                  <ResultRow label={T.indemnity[lang]} amount={result.constitutional_indemnity} highlight />
                  <ResultRow label={T.twentyDays[lang]} amount={result.twenty_days_per_year} highlight />
                  <ResultRow label={T.seniorityPremium[lang]} amount={result.seniority_premium} highlight />
                </div>
              </div>
            )}

            <div className="flex justify-between items-center font-bold text-base border-t-2 border-sage-300 pt-3 mt-1">
              <span className="text-gray-900">{T.total[lang]}</span>
              <MoneyAmount amount={result.total} size="lg" className="text-sage-700" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-sage-200 space-y-1">
            <p className="text-xs text-gray-400 flex items-start gap-1">
              <Info size={11} className="shrink-0 mt-0.5" />
              {T.disclaimer[lang]}
            </p>
            <p className="text-xs text-gray-400 ml-3">{T.lftRef[lang]}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function BasisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-amber-700 leading-tight">{label}</span>
      <span className="font-mono font-semibold text-amber-900 shrink-0">{value}</span>
    </div>
  );
}

function ResultRow({ label, amount, highlight = false, note }: {
  label: string; amount: number; highlight?: boolean; note?: string;
}) {
  return (
    <div className={`flex justify-between items-start text-sm gap-3 ${highlight ? "text-gray-800" : ""}`}>
      <div>
        <span className="text-gray-600 leading-tight">{label}</span>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <MoneyAmount amount={amount} size="sm" className={highlight ? "text-terracotta-700 font-semibold" : ""} />
    </div>
  );
}
