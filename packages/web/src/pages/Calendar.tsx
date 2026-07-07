/**
 * pages/Calendar.tsx — 3-month payment calendar
 *
 * Shows worker paydays, IMSS/INFONAVIT, ISR, Aguinaldo, and holidays
 * across a rolling 3-month window. Supports .ics download and Google Calendar links.
 */
import { useState, useMemo } from "react";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { RATES_2026 } from "@casanomina/calculator";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Calendar as CalIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "payday" | "imss" | "isr" | "aguinaldo" | "holiday";

interface CalEvent {
  type: EventType;
  title: string;
  subtitle?: string;
  date: string; // YYYY-MM-DD
}

// ─── Styling maps ─────────────────────────────────────────────────────────────

const DOT: Record<EventType, string> = {
  payday:    "bg-sage-500",
  imss:      "bg-terracotta-500",
  isr:       "bg-orange-400",
  aguinaldo: "bg-purple-500",
  holiday:   "bg-amber-400",
};

const CHIP: Record<EventType, string> = {
  payday:    "bg-sage-50 text-sage-700 border-sage-200",
  imss:      "bg-terracotta-50 text-terracotta-700 border-terracotta-200",
  isr:       "bg-orange-50 text-orange-700 border-orange-200",
  aguinaldo: "bg-purple-50 text-purple-700 border-purple-200",
  holiday:   "bg-amber-50 text-amber-700 border-amber-200",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ─── Event generation ─────────────────────────────────────────────────────────

const HOLIDAYS: Record<string, string> = Object.fromEntries(
  (RATES_2026.mandatory_holidays_2026 ?? []).map((h: any) => [h.date, h.name])
);

function generatePaydates(worker: any, start: Date, end: Date): string[] {
  const freq: string = worker.pay_frequency ?? "weekly";
  const dates: string[] = [];

  if (freq === "weekly" || freq === "biweekly") {
    const step = freq === "weekly" ? 7 : 14;
    // payroll_day: 0=Mon … 6=Sun (JS getDay: 0=Sun,1=Mon…6=Sat)
    const targetDow = worker.payroll_day != null
      ? (worker.payroll_day + 1) % 7   // convert Mon-based → JS Sun-based
      : 5;                              // default Friday (JS 5)
    // Find the first occurrence of targetDow on/after rangeStart
    const anchor = new Date(start);
    const anchorDow = anchor.getDay();
    const offset = (targetDow - anchorDow + 7) % 7;
    anchor.setDate(anchor.getDate() + offset);
    let d = new Date(anchor);
    while (d <= end) {
      dates.push(toIso(d));
      d = addDays(d, step);
    }
    return dates;
  }

  if (freq === "semi-monthly") {
    let y = start.getFullYear(), m = start.getMonth();
    while (new Date(y, m, 1) <= end) {
      const d15 = new Date(y, m, 15);
      const dLast = new Date(y, m + 1, 0);
      if (d15 >= start && d15 <= end) dates.push(toIso(d15));
      if (dLast >= start && dLast <= end) dates.push(toIso(dLast));
      if (++m > 11) { m = 0; y++; }
    }
    return dates;
  }

  if (freq === "monthly") {
    const day = worker.payroll_day ?? 30;
    let y = start.getFullYear(), m = start.getMonth();
    while (new Date(y, m, 1) <= end) {
      const d = new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
      if (d >= start && d <= end) dates.push(toIso(d));
      if (++m > 11) { m = 0; y++; }
    }
    return dates;
  }

  return dates;
}

function buildEvents(workers: any[], start: Date, end: Date): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  const add = (e: CalEvent) => {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  };

  // Worker paydays
  for (const w of workers) {
    for (const date of generatePaydates(w, start, end)) {
      add({ type: "payday", title: w.full_name, subtitle: "Payday", date });
    }
  }

  // Holidays
  for (const [date, name] of Object.entries(HOLIDAYS)) {
    const d = isoToDate(date);
    if (d >= start && d <= end) add({ type: "holiday", title: name as string, date });
  }

  // ISR: 17th of every month (covers prev month)
  let y = start.getFullYear(), m = start.getMonth();
  while (new Date(y, m, 1) <= end) {
    const d = new Date(y, m, 17);
    if (d >= start && d <= end) {
      const prev = new Date(y, m - 1, 1);
      const label = prev.toLocaleDateString("es-MX", { month: "short", year: "numeric" });
      add({ type: "isr", title: "ISR → SAT", subtitle: label, date: toIso(d) });
    }
    if (++m > 11) { m = 0; y++; }
  }

  // IMSS/INFONAVIT: 17th of Mar, May, Jul, Sep, Nov, Jan(+1)
  const imssDue = [
    { mo: 2, label: "Ene-Feb" }, { mo: 4, label: "Mar-Abr" },
    { mo: 6, label: "May-Jun" }, { mo: 8, label: "Jul-Ago" },
    { mo: 10, label: "Sep-Oct" },
  ];
  for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) {
    for (const { mo, label } of imssDue) {
      const d = new Date(yr, mo, 17);
      if (d >= start && d <= end) add({ type: "imss", title: "IMSS/INFONAVIT", subtitle: label, date: toIso(d) });
    }
    // Nov-Dic bimester due Jan 17 of next year
    const janNext = new Date(yr + 1, 0, 17);
    if (janNext >= start && janNext <= end)
      add({ type: "imss", title: "IMSS/INFONAVIT", subtitle: "Nov-Dic", date: toIso(janNext) });
  }

  // Aguinaldo: Dec 20
  for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) {
    const d = new Date(yr, 11, 20);
    if (d >= start && d <= end) add({ type: "aguinaldo", title: "Aguinaldo", subtitle: "LFT Art. 87", date: toIso(d) });
  }

  return map;
}

// ─── ICS / Google helpers ─────────────────────────────────────────────────────

function toIcsDate(iso: string): string { return iso.replace(/-/g, ""); }

function buildICS(events: Map<string, CalEvent[]>): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//CasaNomina//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  ];
  for (const dayEvents of events.values()) {
    for (const e of dayEvents) {
      const ds = toIcsDate(e.date);
      const next = toIcsDate(toIso(addDays(isoToDate(e.date), 1)));
      lines.push("BEGIN:VEVENT",
        `DTSTART;VALUE=DATE:${ds}`, `DTEND;VALUE=DATE:${next}`,
        `SUMMARY:${e.title}${e.subtitle ? ` – ${e.subtitle}` : ""}`,
        "END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function googleUrl(e: CalEvent): string {
  const ds = toIcsDate(e.date);
  const title = encodeURIComponent(`${e.title}${e.subtitle ? ` – ${e.subtitle}` : ""}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${ds}%2F${ds}`;
}

// ─── Month grid ───────────────────────────────────────────────────────────────

function MonthGrid({
  year, month, events, selected, onSelect, lang,
}: {
  year: number; month: number;
  events: Map<string, CalEvent[]>;
  selected: string | null;
  onSelect: (iso: string) => void;
  lang: "en" | "es";
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const todayIso = toIso(new Date());
  const DAYS = lang === "en"
    ? ["M", "T", "W", "T", "F", "S", "S"]
    : ["L", "M", "X", "J", "V", "S", "D"];
  const monthName = firstDay.toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-gray-700 mb-2 capitalize">{monthName}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-xs text-gray-400 font-medium pb-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = events.get(iso) ?? [];
          const isToday = iso === todayIso;
          const isSelected = iso === selected;
          const types = [...new Set(dayEvents.map(e => e.type))];

          return (
            <button
              key={i}
              onClick={() => onSelect(iso)}
              className={`flex flex-col items-center py-1 rounded-lg transition-colors
                ${isSelected ? "bg-gray-900 text-white" : isToday ? "bg-terracotta-50 text-terracotta-700" : "hover:bg-gray-50 text-gray-700"}
              `}
            >
              <span className={`text-xs font-medium ${isToday && !isSelected ? "font-bold" : ""}`}>{day}</span>
              {types.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {types.slice(0, 3).map((t) => (
                    <span key={t} className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : DOT[t]}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Calendar() {
  const { lang } = useLanguage();
  const { data: workers } = useApi(() => api.workers.cards(), []);
  const [startMonth, setStartMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(toIso(new Date()));

  const months = useMemo(() => [0, 1, 2].map(offset => {
    let m = startMonth.month + offset, y = startMonth.year;
    if (m > 11) { m -= 12; y++; }
    return { year: y, month: m };
  }), [startMonth]);

  const rangeStart = new Date(months[0].year, months[0].month, 1);
  const rangeEnd = new Date(months[2].year, months[2].month + 1, 0);

  const events = useMemo(
    () => buildEvents(workers ?? [], rangeStart, rangeEnd),
    [workers, startMonth]
  );

  function shiftMonths(dir: -1 | 1) {
    setStartMonth(prev => {
      let m = prev.month + dir, y = prev.year;
      if (m > 11) { m = 0; y++; } else if (m < 0) { m = 11; y--; }
      return { year: y, month: m };
    });
  }

  function downloadICS() {
    const content = buildICS(events);
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "casanomina-calendar.ics"; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedEvents = selected ? (events.get(selected) ?? []) : [];
  const selectedFmt = selected
    ? isoToDate(selected).toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { weekday: "long", month: "long", day: "numeric" })
    : "";

  const LEGEND: { type: EventType; label: string; labelEs: string }[] = [
    { type: "payday",    label: "Payday",          labelEs: "Día de pago" },
    { type: "imss",      label: "IMSS/INFONAVIT",   labelEs: "IMSS/INFONAVIT" },
    { type: "isr",       label: "ISR → SAT",        labelEs: "ISR → SAT" },
    { type: "aguinaldo", label: "Aguinaldo",         labelEs: "Aguinaldo" },
    { type: "holiday",   label: "Holiday",           labelEs: "Día festivo" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === "en" ? "Payment Calendar" : "Calendario de Pagos"}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={downloadICS}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">
            <Download size={14} />
            {lang === "en" ? "Download .ics" : "Descargar .ics"}
          </button>
          <a href="https://calendar.google.com/calendar/r" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">
            <ExternalLink size={14} />
            Google Calendar
          </a>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => shiftMonths(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => shiftMonths(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
          <ChevronRight size={18} />
        </button>
        <button onClick={() => { setStartMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); setSelected(toIso(new Date())); }}
          className="text-xs text-terracotta-600 hover:underline ml-1">
          {lang === "en" ? "Today" : "Hoy"}
        </button>
      </div>

      {/* 3-month grid */}
      <Card className="p-4 mb-4">
        <div className="flex gap-6">
          {months.map(({ year, month }) => (
            <MonthGrid key={`${year}-${month}`}
              year={year} month={month}
              events={events} selected={selected} onSelect={setSelected} lang={lang} />
          ))}
        </div>
      </Card>

      {/* Selected day panel */}
      {selected && (
        <Card className="p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 capitalize mb-3">{selectedFmt}</p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400">{lang === "en" ? "No events." : "Sin eventos."}</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${CHIP[e.type]}`}>
                  <div>
                    <span className="font-medium">{e.title}</span>
                    {e.subtitle && <span className="ml-2 opacity-70 text-xs">{e.subtitle}</span>}
                  </div>
                  {(e.type === "imss" || e.type === "isr" || e.type === "aguinaldo") && (
                    <a href={googleUrl(e)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 ml-4 shrink-0">
                      <ExternalLink size={11} />
                      {lang === "en" ? "Add to Google" : "Añadir a Google"}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {LEGEND.map(({ type, label, labelEs }) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full ${DOT[type]}`} />
            {lang === "en" ? label : labelEs}
          </div>
        ))}
      </div>
    </div>
  );
}
