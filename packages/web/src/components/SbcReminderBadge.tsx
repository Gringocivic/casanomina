/**
 * components/SbcReminderBadge.tsx
 *
 * Non-blocking, informational reminder that a worker's SBC (Salario Base
 * de Cotización) may be stale and should be re-reported to IMSS.
 *
 * Trigger chosen (documented in the feature report): the worker's
 * `daily_salary` is below the current active config's minimum wage for
 * their `wage_zone`. That situation is unusual — either the salary was
 * never updated after a minimum-wage increase, or it was entered
 * incorrectly — and it directly affects the SBC IMSS uses for
 * contributions, so it's a reasonable, cheap-to-compute proxy for
 * "this worker's SBC might need a fresh look."
 *
 * Entirely client-side / derived from data already loaded by the
 * Workers and Dashboard pages (worker.daily_salary, worker.wage_zone,
 * worker.is_imss_registered) plus the active RatesConfig fetched once
 * via GET /api/config/current. No schema change, no new endpoint.
 *
 * Informational only — never blocks any action.
 */
import { useMemo } from "react";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { AlertTriangle } from "lucide-react";

/** Shared hook: fetches the active config once and exposes the minimum wage lookup. */
export function useMinimumWage() {
  const { data: config } = useApi(() => api.config.current(), []);

  return useMemo(() => {
    const data = (config as any)?.config_data;
    return {
      general: data?.minimum_daily_wage_general as number | undefined,
      northern_border: data?.minimum_daily_wage_northern_border as number | undefined,
    };
  }, [config]);
}

/** True if a worker's daily salary is below the minimum wage for their zone. */
export function isSbcStale(worker: any, minWage: { general?: number; northern_border?: number }): boolean {
  const zone = worker.wage_zone === "northern_border" ? "northern_border" : "general";
  const min = minWage[zone];
  if (min == null) return false;
  const salary = parseFloat(worker.daily_salary ?? "0");
  if (!salary) return false;
  return salary < min;
}

/** Small inline badge — for the worker card. */
export function SbcReminderBadge({ worker, minWage }: { worker: any; minWage: { general?: number; northern_border?: number } }) {
  const { lang } = useLanguage();
  if (!isSbcStale(worker, minWage)) return null;

  const zone = worker.wage_zone === "northern_border" ? "northern_border" : "general";
  const min = minWage[zone];

  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200"
      title={
        lang === "en"
          ? `Daily salary is below the current minimum wage ($${min?.toFixed(2)}). Consider updating and re-reporting SBC to IMSS.`
          : `El salario diario está por debajo del salario mínimo vigente ($${min?.toFixed(2)}). Considera actualizarlo y reportar el SBC al IMSS.`
      }
    >
      <AlertTriangle size={10} />
      {lang === "en" ? "SBC may be stale" : "SBC podría estar desactualizado"}
    </span>
  );
}
