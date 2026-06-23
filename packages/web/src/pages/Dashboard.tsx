/**
 * pages/Dashboard.tsx — Screen 1
 *
 * Shows: active worker cards, upcoming pay dates, holiday alerts,
 * and a quick employer cost summary.
 */
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import { Button } from "../components/ui/Button";
import { Link } from "react-router-dom";
import { Users, CalendarX2, AlertCircle, Plus } from "lucide-react";
import { RATES_2026 } from "@casanomina/calculator";

const T = {
  title:       { en: "Dashboard", es: "Panel Principal" },
  subtitle:    { en: "Your household at a glance", es: "Tu hogar de un vistazo" },
  workers:     { en: "Active Workers", es: "Trabajadores Activos" },
  addWorker:   { en: "Add Worker", es: "Agregar Trabajadora" },
  noWorkers:   { en: "No workers yet. Add your first worker to get started.", es: "Sin trabajadoras. Agrega la primera para comenzar." },
  holidays:    { en: "Upcoming Holidays", es: "Días Festivos Próximos" },
  tripleNote:  { en: "If they work, pay triple.", es: "Si trabajan, paga triple." },
  minWage:     { en: "2026 Min. Daily Wage", es: "Salario Mínimo Diario 2026" },
  uma:         { en: "2026 UMA Daily Value", es: "Valor Diario UMA 2026" },
  general:     { en: "General Zone", es: "Zona General" },
  border:      { en: "Northern Border", es: "Frontera Norte" },
};

function WorkerCard({ worker }: { worker: any }) {
  const { lang } = useLanguage();
  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="w-10 h-10 rounded-full bg-terracotta-100 text-terracotta-600 flex items-center justify-center font-bold text-lg mb-3">
            {worker.full_name.charAt(0)}
          </div>
          <h3 className="font-semibold text-gray-900">{worker.full_name}</h3>
          <p className="text-sm text-gray-500 capitalize">{worker.role ?? (lang === "en" ? "Domestic Worker" : "Trabajadora del Hogar")}</p>
        </div>
        <Badge variant={worker.is_imss_registered ? "success" : "warning"}>
          {worker.is_imss_registered ? "IMSS ✓" : "IMSS Pending"}
        </Badge>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">{lang === "en" ? "Daily Salary" : "Salario Diario"}</p>
          <MoneyAmount amount={worker.daily_salary} size="md" className="text-gray-900" />
        </div>
        <Link to={`/workers/${worker.id}`}>
          <Button variant="ghost" size="sm">{lang === "en" ? "View" : "Ver"}</Button>
        </Link>
      </div>
    </Card>
  );
}

const UPCOMING_HOLIDAYS = RATES_2026.mandatory_holidays_2026?.filter((h) => {
  const d = new Date(h.date);
  const today = new Date();
  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= -1 && diff <= 60;
}) ?? [];

export function Dashboard() {
  const { lang } = useLanguage();
  const { data: workers, loading } = useApi(() => api.workers.list(), []);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{T.title[lang]}</h1>
        <p className="text-gray-500 mt-1">{T.subtitle[lang]}</p>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="bg-terracotta-50 border-terracotta-100">
          <p className="text-xs font-medium text-terracotta-600 mb-1">{T.minWage[lang]} — {T.general[lang]}</p>
          <MoneyAmount amount={RATES_2026.minimum_daily_wage_general} size="lg" className="text-terracotta-700" />
        </Card>
        <Card className="bg-terracotta-50 border-terracotta-100">
          <p className="text-xs font-medium text-terracotta-600 mb-1">{T.minWage[lang]} — {T.border[lang]}</p>
          <MoneyAmount amount={RATES_2026.minimum_daily_wage_northern_border} size="lg" className="text-terracotta-700" />
        </Card>
        <Card className="bg-sage-50 border-sage-100">
          <p className="text-xs font-medium text-sage-600 mb-1">{T.uma[lang]}</p>
          <MoneyAmount amount={RATES_2026.uma_daily_value} size="lg" className="text-sage-700" />
        </Card>
      </div>

      {/* Workers section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">{T.workers[lang]}</h2>
            {workers && <Badge variant="neutral">{workers.length}</Badge>}
          </div>
          <Link to="/workers/new">
            <Button size="sm">
              <Plus size={16} />
              {T.addWorker[lang]}
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : workers && workers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers.map((w) => <WorkerCard key={w.id} worker={w} />)}
          </div>
        ) : (
          <Card className="text-center py-12">
            <Users size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{T.noWorkers[lang]}</p>
            <Link to="/workers/new" className="mt-4 inline-block">
              <Button><Plus size={16} />{T.addWorker[lang]}</Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Upcoming holidays */}
      {UPCOMING_HOLIDAYS.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CalendarX2 size={18} className="text-amber-500" />
            <h2 className="font-semibold text-gray-900">{T.holidays[lang]}</h2>
          </div>
          <div className="space-y-2">
            {UPCOMING_HOLIDAYS.map((h) => (
              <div key={h.date} className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <AlertCircle size={18} className="text-amber-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">{h.name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(h.date).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
                      weekday: "long", month: "long", day: "numeric",
                    })}
                    {h.triple_pay && <span className="ml-2 text-amber-600 font-medium">— {T.tripleNote[lang]}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
