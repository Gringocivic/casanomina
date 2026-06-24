/**
 * pages/Termination.tsx
 *
 * Finiquito / Liquidación calculator pre-filled from a real worker record.
 *
 * Route: /workers/:id/terminate
 *
 * Finiquito  = voluntary resignation or justified termination
 *              (pending wages + proportional aguinaldo + proportional vacation + prima)
 * Liquidación = unjustified dismissal
 *              (all of the above + 3-month constitutional indemnity + 20 days/year + prima de antigüedad)
 */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format, parseISO, differenceInYears, differenceInMonths } from "date-fns";
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

const T = {
  back:         { en: "Workers",                     es: "Trabajadoras" },
  title:        { en: "Termination Calculator",      es: "Calculadora de Terminación" },
  subtitle:     { en: "Estimate what is owed at end of employment", es: "Estima lo que se debe al finalizar el empleo" },
  workerInfo:   { en: "Worker",                      es: "Trabajadora" },
  since:        { en: "Since",                       es: "Desde" },
  salary:       { en: "Daily salary",                es: "Salario diario" },
  seniority:    { en: "Seniority",                   es: "Antigüedad" },
  calcType:     { en: "Type of Termination",         es: "Tipo de Terminación" },
  finiquito:    { en: "Finiquito (Resignation / Justified)", es: "Finiquito (Renuncia / Causa Justificada)" },
  finiquitoDesc:{ en: "Worker resigns or employer terminates with legal cause", es: "La trabajadora renuncia o el empleador termina con causa justificada" },
  liquidacion:  { en: "Liquidación (Unjustified Dismissal)", es: "Liquidación (Despido Injustificado)" },
  liquidacionDesc: { en: "Employer dismisses without legal cause — full severance applies", es: "El empleador despide sin causa justificada — aplica indemnización completa" },
  termDate:     { en: "Termination Date",            es: "Fecha de Terminación" },
  calculate:    { en: "Calculate",                   es: "Calcular" },
  calculating:  { en: "Calculating…",               es: "Calculando…" },
  results:      { en: "Results",                     es: "Resultados" },
  pendingWages: { en: "Pending wages (days not yet paid)", es: "Salarios pendientes (días no pagados)" },
  aguinaldo:    { en: "Proportional Christmas bonus (aguinaldo)", es: "Aguinaldo proporcional" },
  vacation:     { en: "Proportional vacation pay",   es: "Vacaciones proporcionales" },
  prima:        { en: "Vacation premium (prima vacacional)", es: "Prima vacacional" },
  indemnity:    { en: "Constitutional indemnity (3 months × SBC)", es: "Indemnización constitucional (3 meses × SBC)" },
  twentyDays:   { en: "20 days × year of service",  es: "20 días × año de servicio" },
  seniorityPremium: { en: "Seniority premium (12 days/yr, capped)", es: "Prima de antigüedad (12 días/año, topado)" },
  total:        { en: "Total owed",                  es: "Total a pagar" },
  disclaimer:   { en: "Estimate only. Consult a labor attorney before issuing final settlements.", es: "Solo estimación. Consulta a un abogado laboral antes de emitir liquidaciones definitivas." },
  lftRef:       { en: "Legal references: LFT Arts. 50, 76, 80, 87, 162", es: "Referencias legales: LFT Arts. 50, 76, 80, 87, 162" },
  notFound:     { en: "Worker not found",            es: "Trabajadora no encontrada" },
};

function senioritySummary(startDate: string, lang: "en" | "es"): string {
  const start = parseISO(startDate);
  const now = new Date();
  const years = differenceInYears(now, start);
  const months = differenceInMonths(now, start) % 12;
  if (lang === "en") return `${years} yr${years !== 1 ? "s" : ""} ${months} mo`;
  return `${years} año${years !== 1 ? "s" : ""} ${months} mes${months !== 1 ? "es" : ""}`;
}

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
      {/* Back link */}
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
              {T.since[lang]} {format(parseISO(worker.start_date), "MMM d, yyyy")}
              {" · "}{senioritySummary(worker.start_date, lang)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <MoneyAmount amount={worker.daily_salary} size="md" className="text-gray-900" />
            <p className="text-xs text-gray-400">/{lang === "en" ? "day" : "día"}</p>
          </div>
        </div>
      </Card>

      {/* Termination type selector */}
      <div className="space-y-2 mb-6">
        {(["finiquito", "liquidacion"] as CalcType[]).map((type) => (
          <button
            key={type}
            onClick={() => { setCalcType(type); setResult(null); }}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
              calcType === type
                ? "border-terracotta-500 bg-terracotta-50"
                : "border-gray-100 bg-white hover:border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <Scale size={15} className={calcType === type ? "text-terracotta-500" : "text-gray-400"} />
              <span className="font-semibold text-gray-900 text-sm">{T[type][lang]}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 ml-5">{T[`${type}Desc` as "finiquitoDesc"|"liquidacionDesc"][lang]}</p>
          </button>
        ))}
      </div>

      {/* Date input */}
      <Card className="mb-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {T.termDate[lang]}
            </label>
            <input
              type="date"
              className={fieldClass}
              value={termDate}
              min={worker.start_date}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => { setTermDate(e.target.value); setResult(null); }}
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button onClick={calculate} loading={loading} className="w-full justify-center">
            <Calculator size={15} />
            {loading ? T.calculating[lang] : T.calculate[lang]}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <Card className="border-sage-100 bg-sage-50">
          <h3 className="font-semibold text-sage-800 mb-4 flex items-center gap-2">
            <Calculator size={16} />
            {T.results[lang]}
          </h3>

          <div className="space-y-2.5">
            {/* Finiquito items — always shown */}
            <ResultRow label={T.pendingWages[lang]} amount={result.pending_wages} />
            <ResultRow label={T.aguinaldo[lang]} amount={result.proportional_aguinaldo} />
            <ResultRow label={T.vacation[lang]} amount={result.proportional_vacation} />
            <ResultRow label={T.prima[lang]} amount={result.proportional_prima_vacacional} />

            {/* Liquidación extra items */}
            {isLiquidacion(result) && (
              <>
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
              </>
            )}

            {/* Total */}
            <div className="flex justify-between items-center font-bold text-base border-t-2 border-sage-300 pt-3 mt-1">
              <span className="text-gray-900">{T.total[lang]}</span>
              <MoneyAmount amount={result.total} size="lg" className="text-sage-700" />
            </div>
          </div>

          {/* Legal references */}
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

function ResultRow({ label, amount, highlight = false }: { label: string; amount: number; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-start text-sm gap-3 ${highlight ? "text-gray-800" : ""}`}>
      <span className="text-gray-600 leading-tight">{label}</span>
      <MoneyAmount amount={amount} size="sm" className={highlight ? "text-terracotta-700 font-semibold" : ""} />
    </div>
  );
}
