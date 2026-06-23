/**
 * pages/Calendar.tsx — Screen 4
 * Weekly view of worker schedules with holiday conflict highlights.
 */
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { RATES_2026 } from "@casanomina/calculator";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

const HOLIDAYS_2026 = new Set(
  (RATES_2026.mandatory_holidays_2026 ?? []).map((h) => h.date)
);
const HOLIDAY_NAMES = Object.fromEntries(
  (RATES_2026.mandatory_holidays_2026 ?? []).map((h) => [h.date, h.name])
);

function getWeekDates(base: Date): Date[] {
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export function Calendar() {
  const { lang } = useLanguage();
  const { data: workers } = useApi(() => api.workers.list(), []);
  const [baseDate, setBaseDate] = useState(new Date());
  const week = getWeekDates(baseDate);

  const DAYS = lang === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function goWeek(dir: -1 | 1) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + dir * 7);
    setBaseDate(d);
  }

  const weekRange = `${week[0].toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { month: "short", day: "numeric" })} – ${week[6].toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === "en" ? "Calendar" : "Calendario"}
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={() => goWeek(-1)} className="p-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-600 w-52 text-center">{weekRange}</span>
          <button onClick={() => goWeek(1)} className="p-2 rounded-xl hover:bg-gray-100">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-gray-400 pb-4 pr-4 w-32">
                {lang === "en" ? "Worker" : "Trabajadora"}
              </th>
              {week.map((d, i) => {
                const iso = isoDate(d);
                const isHoliday = HOLIDAYS_2026.has(iso);
                const isToday = isoDate(new Date()) === iso;
                return (
                  <th key={iso} className="text-center pb-4 px-1">
                    <div className={`text-xs font-medium mb-1 ${isHoliday ? "text-amber-500" : isToday ? "text-terracotta-600" : "text-gray-400"}`}>
                      {DAYS[i]}
                    </div>
                    <div className={`text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center mx-auto
                      ${isToday ? "bg-terracotta-500 text-white" : isHoliday ? "bg-amber-100 text-amber-700" : "text-gray-700"}`}>
                      {d.getDate()}
                    </div>
                    {isHoliday && (
                      <div className="mt-1">
                        <AlertCircle size={12} className="text-amber-500 mx-auto" aria-label={HOLIDAY_NAMES[iso]} />
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!workers?.length ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                  {lang === "en" ? "No workers yet." : "Sin trabajadoras."}
                </td>
              </tr>
            ) : (
              workers.map((w: any) => (
                <tr key={w.id} className="border-t border-gray-100">
                  <td className="py-3 pr-4">
                    <div className="text-sm font-medium text-gray-800">{w.full_name}</div>
                    <div className="text-xs text-gray-400 capitalize">{w.role ?? "—"}</div>
                  </td>
                  {week.map((d) => {
                    const iso = isoDate(d);
                    const dayIndex = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
                    const worksThisDay = dayIndex < (w.days_per_week ?? 6);
                    const isHoliday = HOLIDAYS_2026.has(iso);

                    return (
                      <td key={iso} className="text-center py-3 px-1">
                        {worksThisDay ? (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto text-xs font-medium
                            ${isHoliday
                              ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300 ring-offset-1"
                              : "bg-sage-100 text-sage-700"}`}>
                            {isHoliday ? "3×" : "✓"}
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full mx-auto" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-sage-100 inline-block" /> {lang === "en" ? "Scheduled workday" : "Día trabajado"}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-amber-100 inline-block" /> {lang === "en" ? "Mandatory holiday (triple pay if worked)" : "Día festivo (pago triple si se trabaja)"}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-terracotta-500 inline-block" /> {lang === "en" ? "Today" : "Hoy"}
        </span>
      </div>
    </div>
  );
}
