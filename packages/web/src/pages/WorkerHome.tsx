/**
 * WorkerHome.tsx — Worker portal dashboard.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { format, parseISO, differenceInMonths } from "date-fns";
import { useLanguage } from "../hooks/useLanguage";
import { useApi } from "../hooks/useApi";
import { api, BASE } from "../lib/api";
import { PENDING_CLAIM_KEY } from "./ClaimPage";
import {
  HardHat, FileText, Download, CheckCircle2, Clock,
  Building2, CalendarDays, Banknote, Shield, BookOpen, Loader2,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid:      "bg-sage-100 text-sage-700",
    approved:  "bg-blue-50 text-blue-700",
    draft:     "bg-gray-100 text-gray-500",
    cancelled: "bg-red-50 text-red-500",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${colors[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

function fmt(amount: string | number) {
  return Number(amount).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function freqLabel(f: string, lang: "en" | "es") {
  const map: Record<string, { en: string; es: string }> = {
    daily:    { en: "Daily",    es: "Diario"    },
    weekly:   { en: "Weekly",   es: "Semanal"   },
    biweekly: { en: "Biweekly", es: "Quincenal" },
    monthly:  { en: "Monthly",  es: "Mensual"   },
  };
  return map[f]?.[lang] ?? f;
}

export function WorkerHome() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { lang } = useLanguage();
  const [downloading, setDownloading] = useState<string | null>(null);

  // Auto-claim pending invite stored before sign-up
  useEffect(() => {
    const token = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (!token) return;
    api.employments.claim(token)
      .then(() => { sessionStorage.removeItem(PENDING_CLAIM_KEY); user?.reload(); })
      .catch(() => { sessionStorage.removeItem(PENDING_CLAIM_KEY); });
  }, []);

  const { data: profile, loading: profileLoading, error: profileError } =
    useApi(() => api.workerPortal.me(), []);

  const { data: runs, loading: runsLoading } =
    useApi(() => api.workerPortal.payslips(), []);

  /** Fetch a PDF with the Bearer token and trigger a browser download. */
  async function triggerDownload(path: string, filename: string, key: string) {
    setDownloading(key);
    try {
      const clerkToken = await getToken();
      const res = await fetch(`${BASE}${path}`, {
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
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message ?? "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  const t = {
    welcome:          { en: `Welcome, ${user?.firstName ?? ""}!`, es: `Bienvenida, ${user?.firstName ?? ""}!` },
    employment:       { en: "Your Employment",     es: "Tu Empleo"               },
    employer:         { en: "Employer",            es: "Empleador"               },
    role:             { en: "Role",                es: "Rol"                     },
    since:            { en: "Since",               es: "Desde"                   },
    salary:           { en: "Daily salary",        es: "Salario diario"          },
    frequency:        { en: "Pay frequency",       es: "Frecuencia de pago"      },
    imss:             { en: "IMSS",                es: "IMSS"                    },
    registered:       { en: "Registered",          es: "Registrada"              },
    notRegistered:    { en: "Not yet registered",  es: "Aun no registrada"       },
    payslips:         { en: "Payslips",            es: "Recibos de Nomina"       },
    noPayslips:       { en: "No payslips yet.",    es: "Sin recibos aun."        },
    download:         { en: "Download",            es: "Descargar"               },
    contract:         { en: "Employment Contract", es: "Contrato Laboral"        },
    contractDesc:     { en: "Download your signed employment contract as a PDF.",
                        es: "Descarga tu contrato laboral en PDF."                },
    downloadContract: { en: "Download Contract",   es: "Descargar Contrato"      },
    laws:             { en: "Know your rights",    es: "Conoce tus derechos"     },
    noEmployment:     { en: "Your account is not linked to an employment yet. Ask your employer to send you an invite link.",
                        es: "Tu cuenta aun no esta vinculada a un empleo. Pide a tu empleador que te envie un enlace de invitacion." },
  };

  const T = (k: keyof typeof t) => t[k][lang];

  const employerDisplay = profile?.employer_name ?? (lang === "en" ? "Your employer" : "Tu empleador");

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-terracotta-500 flex items-center justify-center text-white font-bold text-xs">
            CN
          </div>
          <span className="font-bold text-gray-900">CasaNomina</span>
        </div>
        <Link to="/laws" className="text-sm text-sage-600 hover:text-sage-700 font-medium flex items-center gap-1.5">
          <BookOpen size={14} />
          {T("laws")}
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {/* Welcome heading */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-sage-100 flex items-center justify-center shrink-0">
            <HardHat size={28} className="text-sage-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{T("welcome")}</h1>
            {profile && (
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
                {employerDisplay}
                {profile.employment_status === "active" && (
                  <span className="text-sage-600 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    {lang === "en" ? "Active" : "Activa"}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Employment card */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {T("employment")}
          </h2>
          {profileLoading ? (
            <div className="h-40 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ) : profileError ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-sm text-amber-700">
              {T("noEmployment")}
            </div>
          ) : profile ? (
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {([
                { icon: Building2,    label: T("employer"),  value: employerDisplay, cls: "" },
                { icon: HardHat,      label: T("role"),      value: profile.role ?? (lang === "en" ? "Domestic worker" : "Trabajadora del hogar"), cls: "" },
                { icon: CalendarDays, label: T("since"),     value: format(parseISO(profile.start_date), "MMMM d, yyyy") + ` (${differenceInMonths(new Date(), parseISO(profile.start_date))} ${lang === "en" ? "mo." : "meses"})`, cls: "" },
                { icon: Banknote,     label: T("salary"),    value: fmt(profile.daily_salary) + (lang === "en" ? "/day" : "/dia"), cls: "" },
                { icon: Clock,        label: T("frequency"), value: freqLabel(profile.pay_frequency, lang), cls: "" },
                { icon: Shield,       label: T("imss"),
                  value: profile.is_imss_registered
                    ? `${T("registered")}${profile.imss_nss ? ` - NSS ${profile.imss_nss}` : ""}`
                    : T("notRegistered"),
                  cls: profile.is_imss_registered ? "text-sage-600" : "text-amber-600" },
              ] as { icon: any; label: string; value: string; cls: string }[]).map(({ icon: Icon, label, value, cls }) => (
                <div key={label} className="flex items-center gap-4 px-5 py-3">
                  <Icon size={16} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
                  <span className={`text-sm font-medium text-gray-900 ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Contract */}
        {profile && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {T("contract")}
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-terracotta-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{T("contract")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{T("contractDesc")}</p>
                </div>
              </div>
              <button
                onClick={() => triggerDownload("/api/worker-portal/contract", "contract.pdf", "contract")}
                disabled={downloading === "contract"}
                className="flex items-center gap-1.5 text-sm font-medium bg-terracotta-500 hover:bg-terracotta-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl transition-colors shrink-0"
              >
                {downloading === "contract"
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Download size={14} />}
                {T("downloadContract")}
              </button>
            </div>
          </section>
        )}

        {/* Payslip history */}
        {profile && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {T("payslips")}
            </h2>
            {runsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : !runs || runs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">
                {T("noPayslips")}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                {runs.map((run: any) => (
                  <div key={run.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {format(parseISO(run.period_start), "MMM d")} – {format(parseISO(run.period_end), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmt(run.net_pay)} {lang === "en" ? "net" : "neto"}
                      </p>
                    </div>
                    <StatusBadge status={run.status} />
                    {(run.status === "approved" || run.status === "paid") && (
                      <button
                        onClick={() => triggerDownload(
                          `/api/worker-portal/payslip/${run.id}`,
                          `payslip_${run.period_start}.pdf`,
                          run.id
                        )}
                        disabled={downloading === run.id}
                        className="flex items-center gap-1 text-xs font-medium text-terracotta-600 hover:text-terracotta-700 disabled:opacity-60 shrink-0"
                      >
                        {downloading === run.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Download size={13} />}
                        {T("download")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
