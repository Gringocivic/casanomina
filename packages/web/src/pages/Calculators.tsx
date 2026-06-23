/**
 * pages/Calculators.tsx — Screen 6
 *
 * SBC, IMSS, finiquito and liquidacion estimators wired to live config.
 */
import { useState } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import { Calculator, Info } from "lucide-react";
import { RATES_2026 } from "@casanomina/calculator";

const MIN_SALARY = RATES_2026.minimum_daily_wage_general;

type CalcType = "imss" | "finiquito" | "liquidacion";

export function Calculators() {
  const { lang } = useLanguage();
  const [activeCalc, setActiveCalc] = useState<CalcType>("imss");
  const [daily, setDaily] = useState(String(MIN_SALARY));
  const [startDate, setStartDate] = useState("2023-01-01");
  const [termDate, setTermDate] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500";

  async function calculate() {
    setLoading(true);
    setResult(null);
    try {
      if (activeCalc === "imss") {
        const r = await api.calculate.imss({ daily_salary: Number(daily) });
        setResult(r);
      } else if (activeCalc === "finiquito") {
        const r = await api.calculate.finiquito({ daily_salary: Number(daily), start_date: startDate, termination_date: termDate });
        setResult(r);
      } else {
        const r = await api.calculate.liquidacion({ daily_salary: Number(daily), start_date: startDate, termination_date: termDate });
        setResult(r);
      }
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  const CALCS: { id: CalcType; label: { en: string; es: string }; desc: { en: string; es: string } }[] = [
    { id: "imss", label: { en: "IMSS Contributions", es: "Cuotas IMSS" },
      desc: { en: "Daily IMSS and INFONAVIT amounts for any salary", es: "Cuotas diarias IMSS e INFONAVIT para cualquier salario" } },
    { id: "finiquito", label: { en: "Finiquito (Resignation)", es: "Finiquito (Renuncia)" },
      desc: { en: "Settlement owed when the worker resigns voluntarily", es: "Liquidación por renuncia voluntaria o causa justificada" } },
    { id: "liquidacion", label: { en: "Liquidación (Dismissal)", es: "Liquidación (Despido)" },
      desc: { en: "Full severance for unjustified dismissal (includes 3 months + 20 days/year)", es: "Indemnización completa por despido injustificado (3 meses + 20 días/año)" } },
  ];

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Calculator size={20} className="text-terracotta-500" />
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === "en" ? "Calculators" : "Calculadoras"}
          </h1>
        </div>
        <p className="text-gray-500 text-sm">
          {lang === "en" ? "Estimates using official 2026 rates. Not legal advice." : "Estimaciones con tarifas oficiales 2026. No constituye asesoría legal."}
        </p>
      </div>

      {/* Calc selector */}
      <div className="space-y-2 mb-6">
        {CALCS.map(({ id, label, desc }) => (
          <button key={id} onClick={() => { setActiveCalc(id); setResult(null); }}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-colors
              ${activeCalc === id ? "border-terracotta-500 bg-terracotta-50" : "border-gray-100 bg-white hover:border-gray-200"}`}>
            <span className="font-semibold text-gray-900 text-sm">{label[lang]}</span>
            <p className="text-xs text-gray-500 mt-0.5">{desc[lang]}</p>
          </button>
        ))}
      </div>

      {/* Inputs */}
      <Card className="mb-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {lang === "en" ? "Daily Salary (MXN)" : "Salario Diario (MXN)"}
            </label>
            <input type="number" className={fieldClass} value={daily} min={MIN_SALARY} step="0.01"
              onChange={(e) => setDaily(e.target.value)} />
          </div>

          {activeCalc !== "imss" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {lang === "en" ? "Hire Date" : "Fecha de Contratación"}
                </label>
                <input type="date" className={fieldClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {lang === "en" ? "Termination Date" : "Fecha de Terminación"}
                </label>
                <input type="date" className={fieldClass} value={termDate} onChange={(e) => setTermDate(e.target.value)} />
              </div>
            </div>
          )}

          <Button onClick={calculate} loading={loading}>
            {lang === "en" ? "Calculate" : "Calcular"}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <Card className="border-sage-100 bg-sage-50">
          <h3 className="font-semibold text-sage-800 mb-4">
            {lang === "en" ? "Results" : "Resultados"}
          </h3>

          {activeCalc === "imss" && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">SBC ({lang === "en" ? "Contribution Base" : "Salario Base Cotización"})</span>
                <MoneyAmount amount={result.sbc} size="sm" />
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-3">
                <span>{lang === "en" ? "Daily Employer IMSS" : "IMSS Patronal Diario"}</span>
                <MoneyAmount amount={result.imss?.total_employer ?? 0} size="sm" className="text-sage-700" />
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>{lang === "en" ? "Daily Worker IMSS" : "IMSS Trabajadora Diario"}</span>
                <MoneyAmount amount={result.imss?.total_worker ?? 0} size="sm" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">INFONAVIT</span>
                <MoneyAmount amount={result.infonavit_employer} size="sm" />
              </div>
            </div>
          )}

          {(activeCalc === "finiquito" || activeCalc === "liquidacion") && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{lang === "en" ? "Proportional Aguinaldo" : "Aguinaldo Proporcional"}</span>
                <MoneyAmount amount={result.proportional_aguinaldo} size="sm" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{lang === "en" ? "Proportional Vacation Pay" : "Vacaciones Proporcionales"}</span>
                <MoneyAmount amount={result.proportional_vacation} size="sm" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{lang === "en" ? "Prima Vacacional" : "Prima Vacacional"}</span>
                <MoneyAmount amount={result.proportional_prima_vacacional} size="sm" />
              </div>
              {activeCalc === "liquidacion" && (
                <>
                  <div className="flex justify-between text-sm border-t pt-3">
                    <span className="text-gray-600">{lang === "en" ? "3 Months Constitutional Indemnity" : "Indemnización Constitucional (3 meses)"}</span>
                    <MoneyAmount amount={result.constitutional_indemnity} size="sm" />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{lang === "en" ? "20 Days/Year Seniority" : "20 Días/Año por Antigüedad"}</span>
                    <MoneyAmount amount={result.twenty_days_per_year} size="sm" />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{lang === "en" ? "Prima de Antigüedad (12 days/yr)" : "Prima de Antigüedad (12 días/año)"}</span>
                    <MoneyAmount amount={result.seniority_premium} size="sm" />
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-base border-t-2 pt-3">
                <span>{lang === "en" ? "Total" : "Total"}</span>
                <MoneyAmount amount={result.total} size="lg" className="text-sage-700" />
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4 flex items-center gap-1">
            <Info size={11} />
            {lang === "en"
              ? "Estimate only. Consult a labor attorney for official settlements."
              : "Solo estimación. Consulta a un abogado laboral para liquidaciones oficiales."}
          </p>
        </Card>
      )}
    </div>
  );
}
