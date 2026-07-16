/**
 * pages/PayrollHistory.tsx — All payroll runs across all workers
 */
import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { format, parseISO } from "date-fns";
import { api, BASE } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import { History, Download, Loader2, Users, Banknote, TrendingUp, FileDown } from "lucide-react";

type Run = {
  id: string; worker_id: string; worker_name: string;
  period_start: string; period_end: string; days_worked: number;
  status: string; gross_wages: string; net_pay: string;
  employer_total_cost: string; paid_at: string | null;
};

function statusVariant(s: string): "success" | "warning" | "neutral" | "error" {
  return s === "paid" ? "success" : s === "approved" ? "warning" : "neutral";
}

/**
 * CSV columns (in order): Worker, Period Start, Period End, Days Worked,
 * Status, Gross Wages, Deductions, Net Pay, Employer Cost, Paid Date.
 *
 * "Deductions" is derived as gross_wages - net_pay (worker IMSS + ISR
 * withheld) since /api/payroll/all does not expose a single combined
 * deductions field — this keeps the export a pure client-side
 * serialization of already-loaded rows with no new endpoint.
 *
 * One field per RFC 4180 cell; fields containing a comma, quote, or
 * newline are wrapped in double quotes with internal quotes doubled.
 */
function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildPayrollCsv(rows: Run[]): string {
  const headers = [
    "Worker", "Period Start", "Period End", "Days Worked", "Status",
    "Gross Wages", "Deductions", "Net Pay", "Employer Cost", "Paid Date",
  ];
  const lines = [headers.map(csvEscape).join(",")];

  for (const r of rows) {
    const gross = parseFloat(r.gross_wages);
    const net = parseFloat(r.net_pay);
    const deductions = (gross - net).toFixed(2);
    lines.push([
      csvEscape(r.worker_name),
      csvEscape(r.period_start),
      csvEscape(r.period_end),
      csvEscape(r.days_worked),
      csvEscape(r.status),
      csvEscape(gross.toFixed(2)),
      csvEscape(deductions),
      csvEscape(net.toFixed(2)),
      csvEscape(parseFloat(r.employer_total_cost).toFixed(2)),
      csvEscape(r.paid_at ?? ""),
    ].join(","));
  }

  return lines.join("\r\n");
}

/** Serializes the given rows to CSV and triggers a browser download. UTF-8 with BOM so Excel opens accents correctly. */
function downloadPayrollCsv(rows: Run[]) {
  const csv = buildPayrollCsv(rows);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().split("T")[0];
  a.download = `payroll_history_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PayrollHistory() {
  const { lang } = useLanguage();
  const { getToken } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterWorker, setFilterWorker] = useState<string>("all");

  const { data: runs, loading } = useApi(() => api.payrollHistory.all(), []);

  const T = (en: string, es: string) => lang === "en" ? en : es;

  async function handleDownload(run: Run) {
    setDownloadingId(run.id);
    try {
      await api.documents.generatePayslip(run.id);
      const clerkToken = await getToken();
      const res = await fetch(`${BASE}/api/documents/payslip/${run.id}`, {
        headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip_${run.worker_name.replace(/\s+/g, "_")}_${run.period_start}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  // Summary stats
  const allRuns = runs ?? [];
  const totalNetPaid = allRuns
    .filter(r => r.status === "paid")
    .reduce((sum, r) => sum + parseFloat(r.net_pay), 0);
  const totalCostPaid = allRuns
    .filter(r => r.status === "paid")
    .reduce((sum, r) => sum + parseFloat(r.employer_total_cost), 0);
  const uniqueWorkers = new Set(allRuns.map(r => r.worker_id)).size;

  // Unique worker names for filter
  const workerNames = Array.from(
    new Map(allRuns.map(r => [r.worker_id, r.worker_name])).entries()
  );

  // Filtered rows
  const filtered = allRuns.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterWorker !== "all" && r.worker_id !== filterWorker) return false;
    return true;
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <History size={20} className="text-terracotta-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {T("Payroll History", "Historial de Nómina")}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {T("All payroll runs across all workers", "Todos los recibos de todos los trabajadores")}
            </p>
          </div>
        </div>
        {!loading && allRuns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadPayrollCsv(filtered)}
          >
            <FileDown size={14} />
            {T("Export CSV", "Exportar CSV")}
          </Button>
        )}
      </div>

      {/* Summary stats */}
      {!loading && allRuns.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 bg-sage-50 rounded-xl flex items-center justify-center shrink-0">
              <Users size={18} className="text-sage-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{T("Workers", "Trabajadores")}</p>
              <p className="text-xl font-bold text-gray-900">{uniqueWorkers}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 bg-terracotta-50 rounded-xl flex items-center justify-center shrink-0">
              <Banknote size={18} className="text-terracotta-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{T("Total net paid", "Total neto pagado")}</p>
              <p className="text-xl font-bold text-gray-900">
                {totalNetPaid.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
              </p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 py-4">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{T("Total employer cost", "Costo patronal total")}</p>
              <p className="text-xl font-bold text-gray-900">
                {totalCostPaid.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      {!loading && allRuns.length > 0 && (
        <div className="flex gap-3 mb-4">
          <select
            value={filterWorker}
            onChange={e => setFilterWorker(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40"
          >
            <option value="all">{T("All workers", "Todos los trabajadores")}</option>
            {workerNames.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40"
          >
            <option value="all">{T("All statuses", "Todos los estados")}</option>
            <option value="paid">{T("Paid", "Pagado")}</option>
            <option value="approved">{T("Approved", "Aprobado")}</option>
            <option value="draft">{T("Draft", "Borrador")}</option>
          </select>
          {filtered.length !== allRuns.length && (
            <span className="self-center text-xs text-gray-400">
              {filtered.length} {T("of", "de")} {allRuns.length}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : allRuns.length === 0 ? (
        <Card className="text-center py-16">
          <History size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">{T("No payroll runs yet", "Sin registros de nómina aún")}</p>
          <p className="text-sm text-gray-400 mt-1">{T("Run payroll for a worker to see it here.", "Procesa una nómina para verla aquí.")}</p>
        </Card>
      ) : (
        <>
          {/* Mobile (below sm): stacked label/value cards instead of a table */}
          <div className="sm:hidden space-y-3">
            {filtered.map(run => (
              <Card key={run.id} className="p-4 text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-medium text-gray-900">{run.worker_name}</p>
                  <Badge variant={statusVariant(run.status)}>
                    {run.status === "paid" ? T("Paid","Pagado") : run.status === "approved" ? T("Approved","Aprobado") : T("Draft","Borrador")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">{T("Period", "Período")}:</span>
                  <span className="text-xs text-gray-700 text-right">
                    {format(parseISO(run.period_start), "MMM d")} – {format(parseISO(run.period_end), "MMM d, yyyy")}
                    {" "}({run.days_worked} {T("days", "días")})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">{T("Net Pay", "Neto")}:</span>
                  <MoneyAmount amount={run.net_pay} size="sm" className="text-sage-700 font-semibold" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">{T("Employer Cost", "Costo Patrón")}:</span>
                  <MoneyAmount amount={run.employer_total_cost} size="sm" className="text-terracotta-600 font-semibold" />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-gray-400">PDF:</span>
                  <button
                    onClick={() => handleDownload(run)}
                    disabled={downloadingId === run.id}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 flex items-center gap-1"
                  >
                    {downloadingId === run.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Download size={13} />}
                    PDF
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {/* sm+ : the real table */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 px-5 py-3 whitespace-nowrap">{T("Worker", "Trabajador")}</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{T("Period", "Período")}</th>
                    <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{T("Status", "Estado")}</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{T("Net Pay", "Neto")}</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{T("Employer Cost", "Costo Patrón")}</th>
                    <th className="text-right text-xs font-medium text-gray-500 px-5 py-3 whitespace-nowrap">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(run => (
                    <tr key={run.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-5 whitespace-nowrap">
                        <p className="text-sm font-medium text-gray-900">{run.worker_name}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="text-sm text-gray-700">
                          {format(parseISO(run.period_start), "MMM d")} – {format(parseISO(run.period_end), "MMM d, yyyy")}
                        </p>
                        <p className="text-xs text-gray-400">{run.days_worked} {T("days", "días")}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant={statusVariant(run.status)}>
                          {run.status === "paid" ? T("Paid","Pagado") : run.status === "approved" ? T("Approved","Aprobado") : T("Draft","Borrador")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <MoneyAmount amount={run.net_pay} size="sm" className="text-sage-700 font-semibold" />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <MoneyAmount amount={run.employer_total_cost} size="sm" className="text-terracotta-600 font-semibold" />
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDownload(run)}
                          disabled={downloadingId === run.id}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 flex items-center gap-1 ml-auto"
                        >
                          {downloadingId === run.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Download size={13} />}
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
