/**
 * pages/Workers.tsx — Worker roster with rich info cards.
 *
 * Each card shows:
 *  - Basic info: name, seniority, schedule, salary
 *  - Onboarding checklist: CURP / IMSS / NSS / Contract / App
 *  - Stats strip: last payroll run / YTD gross / vacation days / aguinaldo accrued
 *  - Quick actions: IMSS register inline, invite inline
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { differenceInYears, format, parseISO } from "date-fns";
import {
  calculateVacationDays,
  calculateYearsOfService,
  calculateAguinaldo,
  daysBetweenInclusive,
  RATES_2026,
} from "@casanomina/calculator";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { MoneyAmount } from "../components/ui/MoneyAmount";
import {
  Users, Plus, Pencil, Trash2, Send, Copy, CheckCircle2,
  Shield, X, UserMinus, Circle, TrendingUp, Calendar,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ── i18n ─────────────────────────────────────────────────────────────────────

const T = {
  title:         { en: "Workers",            es: "Trabajadoras" },
  subtitle:      { en: "Manage your household's worker roster", es: "Administra el personal de tu hogar" },
  addWorker:     { en: "Add Worker",          es: "Agregar Trabajadora" },
  noWorkers:     { en: "No workers yet. Add your first worker to get started.", es: "Sin trabajadoras. Agrega la primera para comenzar." },
  since:         { en: "Since",               es: "Desde" },
  year:          { en: "yr",                  es: "año" },
  years:         { en: "yrs",                 es: "años" },
  daysPerWeek:   { en: "days/week",           es: "días/semana" },
  edit:          { en: "Edit",                es: "Editar" },
  remove:        { en: "Remove",              es: "Eliminar" },
  confirmRemove: { en: "Remove this worker from your active list? Past payroll and document history is preserved.",
                   es: "¿Eliminar a esta trabajadora de tu lista activa? El historial de nómina y documentos se conserva." },
  removeError:   { en: "Couldn't remove worker. Please try again.", es: "No se pudo eliminar. Intenta de nuevo." },
  // Onboarding
  onboarding:    { en: "Onboarding",          es: "Alta" },
  curp:          { en: "CURP",                es: "CURP" },
  imss:          { en: "IMSS",                es: "IMSS" },
  nss:           { en: "NSS",                 es: "NSS" },
  contract:      { en: "Contract",            es: "Contrato" },
  app:           { en: "App",                 es: "App" },
  // Stats
  lastRun:       { en: "Last payroll",        es: "Última nómina" },
  noRuns:        { en: "None yet",            es: "Sin nóminas" },
  ytdGross:      { en: "YTD gross",           es: "Bruto anual" },
  vacDays:       { en: "Vacation days",       es: "Días vacación" },
  aguinaldo:     { en: "Aguinaldo acc.",      es: "Aguinaldo ac." },
  // Invite
  invite:        { en: "Invite",              es: "Invitar" },
  sendInvite:    { en: "Send Invite",         es: "Enviar Invitacion" },
  sending:       { en: "Sending…",            es: "Enviando…" },
  contactPlaceholder: { en: "Email or phone", es: "Correo o teléfono" },
  copyLink:      { en: "Copy Link",           es: "Copiar Enlace" },
  copied:        { en: "Copied!",             es: "Copiado!" },
  inviteDesc:    { en: "Share a link so they can view payslips and contracts.",
                   es: "Comparte un enlace para que vean sus recibos y contratos." },
  // IMSS quick-register
  registerImss:  { en: "Register IMSS",       es: "Inscribir IMSS" },
  nssPlaceholder:{ en: "NSS (11 digits)",     es: "NSS (11 dígitos)" },
  saveImss:      { en: "Save",                es: "Guardar" },
  savingImss:    { en: "Saving…",             es: "Guardando…" },
};

// ── Onboarding pill ───────────────────────────────────────────────────────────

function OnboardingPill({ label, done }: { label: string; done: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
      done
        ? "bg-sage-100 text-sage-700"
        : "bg-amber-50 text-amber-600 border border-amber-200"
    }`}>
      {done
        ? <CheckCircle2 size={10} />
        : <Circle size={10} />}
      {label}
    </span>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400 truncate">{label}</p>
      <div className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Workers() {
  const { lang } = useLanguage();
  // Try the enriched /cards endpoint; fall back to basic /workers list if API not yet rebuilt
  const { data: workers, loading, error, refetch } = useApi(async () => {
    try {
      return await api.workers.cards();
    } catch {
      return api.workers.list();
    }
  }, []);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Invite inline state
  const [invitingId, setInvitingId]       = useState<string | null>(null);
  const [inviteContact, setInviteContact] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteTokens, setInviteTokens]   = useState<Record<string, string>>({});
  const [copiedId, setCopiedId]           = useState<string | null>(null);

  // IMSS quick-register inline state
  const [imssId, setImssId]       = useState<string | null>(null);
  const [imssNss, setImssNss]     = useState("");
  const [imssLoading, setImssLoading] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const yearStart = `${new Date().getFullYear()}-01-01`;

  async function handleRemove(id: string) {
    if (!confirm(T.confirmRemove[lang])) return;
    setRemovingId(id);
    try {
      await api.workers.remove(id);
      await refetch();
    } catch {
      alert(T.removeError[lang]);
    } finally {
      setRemovingId(null);
    }
  }

  async function handleInvite(workerId: string) {
    if (!inviteContact.trim()) return;
    setInviteLoading(true);
    try {
      const result = await api.workers.invite(workerId, inviteContact.trim());
      setInviteTokens((prev) => ({ ...prev, [workerId]: result.claim_url }));
      await refetch();
      setInvitingId(workerId + ":sent");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleCopy(workerId: string, claimPath: string) {
    await navigator.clipboard.writeText(window.location.origin + claimPath);
    setCopiedId(workerId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSaveImss(workerId: string) {
    setImssLoading(true);
    try {
      await api.workers.update(workerId, {
        is_imss_registered: true,
        ...(imssNss.trim() ? { imss_nss: imssNss.trim() } : {}),
      });
      await refetch();
      setImssId(null);
      setImssNss("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setImssLoading(false);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{T.title[lang]}</h1>
          <p className="text-gray-500 mt-1">{T.subtitle[lang]}</p>
        </div>
        <Link to="/workers/new">
          <Button><Plus size={16} />{T.addWorker[lang]}</Button>
        </Link>
      </div>

      {/* API error — most likely the API container needs to be rebuilt */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <strong>{lang === "en" ? "Could not load workers:" : "No se pudieron cargar las trabajadoras:"}</strong>{" "}
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : workers && workers.length > 0 ? (
        <div className="space-y-4">
          {workers.map((w: any) => {
            const years          = differenceInYears(new Date(), parseISO(w.start_date));
            const inviteStatus   = w.invite_status ?? "not_invited";
            const isInviting     = invitingId === w.id;
            const isSent         = invitingId === w.id + ":sent";
            const isImssOpen     = imssId === w.id;
            const claimPath      = inviteTokens[w.id] ?? (w.invite_token ? `/claim/${w.invite_token}` : null);

            // Onboarding checklist — all derived from existing fields
            const onboarding = {
              curp:     !!w.curp,
              imss:     !!w.is_imss_registered,
              nss:      !!w.imss_nss,
              contract: !!w.has_contract,
              app:      inviteStatus === "claimed",
            };
            const onboardingComplete = Object.values(onboarding).every(Boolean);

            // Accruals — computed client-side using the calculator
            const yearsService = calculateYearsOfService(w.start_date, today);
            const vacDays      = Math.round(calculateVacationDays(yearsService, RATES_2026) * (w.days_per_week ?? 6) / 6);
            const daysThisYear = daysBetweenInclusive(
              w.start_date > yearStart ? w.start_date : yearStart,
              today
            );
            const aguinaldoAcc = calculateAguinaldo(Number(w.daily_salary), daysThisYear, RATES_2026);

            // Pending onboarding items
            const pendingItems = [
              !onboarding.curp && (lang === "en" ? "Add CURP" : "Agregar CURP"),
              !onboarding.imss && (lang === "en" ? "Register IMSS" : "Inscribir IMSS"),
              !onboarding.nss  && onboarding.imss && (lang === "en" ? "Add NSS" : "Agregar NSS"),
              !onboarding.contract && (lang === "en" ? "Generate contract" : "Generar contrato"),
              !onboarding.app  && (lang === "en" ? "Invite to app" : "Invitar a la app"),
            ].filter(Boolean) as string[];

            return (
              <Card key={w.id} className="flex flex-col gap-0">

                {/* ── Top section: name + salary + meta ──── */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 pb-4">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-xl bg-terracotta-100 text-terracotta-600 text-lg font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {w.full_name.charAt(0)}
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{w.full_name}</h3>
                      {w.role && (
                        <span className="text-xs text-gray-400 capitalize">{w.role}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-gray-500">
                      <span>{T.since[lang]} {format(parseISO(w.start_date), "MMM d, yyyy")}</span>
                      <span>·</span>
                      <span>{years} {years === 1 ? T.year[lang] : T.years[lang]}</span>
                      <span>·</span>
                      <span>{w.days_per_week} {T.daysPerWeek[lang]}</span>
                      {w.imss_nss && (
                        <>
                          <span>·</span>
                          <span className="text-sage-600">NSS {w.imss_nss}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Salary */}
                  <div className="text-right shrink-0">
                    <MoneyAmount amount={w.daily_salary} size="md" className="text-gray-900" />
                    <p className="text-xs text-gray-400">/{lang === "en" ? "day" : "día"}</p>
                  </div>
                </div>

                {/* ── Onboarding checklist ─────────────────── */}
                <div className="py-3 border-t border-gray-50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 font-medium mr-1">
                      {T.onboarding[lang]}:
                    </span>
                    <OnboardingPill label={T.curp[lang]}     done={onboarding.curp} />
                    <OnboardingPill label={T.imss[lang]}     done={onboarding.imss} />
                    <OnboardingPill label={T.nss[lang]}      done={onboarding.nss} />
                    <OnboardingPill label={T.contract[lang]} done={onboarding.contract} />
                    <OnboardingPill label={T.app[lang]}      done={onboarding.app} />
                    {onboardingComplete && (
                      <span className="text-xs text-sage-600 font-medium ml-1">
                        {lang === "en" ? "✓ Complete" : "✓ Completa"}
                      </span>
                    )}
                  </div>
                  {pendingItems.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1.5">
                      {lang === "en" ? "Pending: " : "Pendiente: "}
                      {pendingItems.join("  ·  ")}
                    </p>
                  )}
                </div>

                {/* ── Stats strip ──────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 py-3 border-t border-gray-50">
                  <StatCell label={T.lastRun[lang]}>
                    {w.last_run ? (
                      <span>
                        {format(parseISO(w.last_run.period_end), "MMM d")}
                        {" · "}
                        <span className="text-terracotta-600">
                          ${Number(w.last_run.net_pay).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400 font-normal">{T.noRuns[lang]}</span>
                    )}
                  </StatCell>

                  <StatCell label={T.ytdGross[lang]}>
                    {w.ytd ? (
                      <span>
                        ${Number(w.ytd.ytd_gross).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span className="text-gray-400 font-normal">—</span>
                    )}
                  </StatCell>

                  <StatCell label={T.vacDays[lang]}>
                    {yearsService > 0
                      ? `${vacDays} ${lang === "en" ? "days" : "días"}`
                      : <span className="text-gray-400 font-normal">{lang === "en" ? "< 1 yr" : "< 1 año"}</span>
                    }
                  </StatCell>

                  <StatCell label={T.aguinaldo[lang]}>
                    ${aguinaldoAcc.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </StatCell>
                </div>

                {/* ── Action buttons ────────────────────────── */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-50 flex-wrap">
                  <Link to={`/workers/${w.id}/terminate`}>
                    <Button variant="secondary" size="sm">
                      <UserMinus size={14} />
                      {lang === "en" ? "Finiquito" : "Finiquito"}
                    </Button>
                  </Link>
                  <Link to={`/workers/${w.id}`}>
                    <Button variant="secondary" size="sm">
                      <Pencil size={14} />
                      {T.edit[lang]}
                    </Button>
                  </Link>
                  {!w.is_imss_registered && !isImssOpen && (
                    <button
                      onClick={() => { setImssId(w.id); setImssNss(""); setInvitingId(null); }}
                      className="flex items-center gap-1.5 text-xs text-sage-600 hover:text-sage-700 font-medium bg-sage-50 hover:bg-sage-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Shield size={13} />
                      {T.registerImss[lang]}
                    </button>
                  )}
                  {inviteStatus !== "claimed" && !isInviting && !isSent && (
                    <button
                      onClick={() => { setInvitingId(w.id); setInviteContact(""); setImssId(null); }}
                      className="flex items-center gap-1.5 text-xs text-terracotta-600 hover:text-terracotta-700 font-medium bg-terracotta-50 hover:bg-terracotta-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Send size={13} />
                      {inviteStatus === "pending"
                        ? (lang === "en" ? "Resend / Copy Link" : "Reenviar / Copiar")
                        : T.invite[lang]}
                    </button>
                  )}
                  <div className="ml-auto">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={removingId === w.id}
                      onClick={() => handleRemove(w.id)}
                    >
                      <Trash2 size={14} />
                      {T.remove[lang]}
                    </Button>
                  </div>
                </div>

                {/* ── IMSS inline form ──────────────────────── */}
                {isImssOpen && (
                  <div className="pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-500 mb-2">
                      {lang === "en"
                        ? "Enter the NSS to confirm IMSS registration (or leave blank to just mark as registered)."
                        : "Ingresa el NSS para confirmar la inscripcion al IMSS (o deja en blanco para solo marcar como registrada)."}
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        maxLength={11}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500/40 focus:border-sage-500 w-48"
                        placeholder={T.nssPlaceholder[lang]}
                        value={imssNss}
                        onChange={(e) => setImssNss(e.target.value.replace(/\D/g, ""))}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveImss(w.id)}
                        disabled={imssLoading}
                        className="flex items-center gap-1.5 text-sm font-medium bg-sage-500 hover:bg-sage-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors"
                      >
                        <CheckCircle2 size={14} />
                        {imssLoading ? T.savingImss[lang] : T.saveImss[lang]}
                      </button>
                      <button onClick={() => setImssId(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Invite inline form ────────────────────── */}
                {isInviting && (
                  <div className="pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-500 mb-2">{T.inviteDesc[lang]}</p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500"
                        placeholder={T.contactPlaceholder[lang]}
                        value={inviteContact}
                        onChange={(e) => setInviteContact(e.target.value)}
                        autoFocus
                      />
                      <button
                        onClick={() => handleInvite(w.id)}
                        disabled={!inviteContact.trim() || inviteLoading}
                        className="flex items-center gap-1.5 text-sm font-medium bg-terracotta-500 hover:bg-terracotta-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors"
                      >
                        <Send size={14} />
                        {inviteLoading ? T.sending[lang] : T.sendInvite[lang]}
                      </button>
                      <button onClick={() => setInvitingId(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Post-invite: QR code + copy link ─────── */}
                {(isSent || (inviteStatus === "pending" && claimPath && !isInviting)) && (
                  <div className="pt-3 border-t border-gray-50">
                    <div className="flex items-start gap-4">
                      {claimPath && (
                        <div className="p-2 bg-white border border-gray-100 rounded-xl shrink-0">
                          <QRCodeSVG
                            value={window.location.origin + claimPath}
                            size={96}
                            bgColor="#ffffff"
                            fgColor="#1a1a1a"
                            level="M"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-2">
                          {lang === "en"
                            ? "Worker scans the QR code or opens the link to join."
                            : "La trabajadora escanea el QR o abre el enlace para unirse."}
                        </p>
                        <div className="flex gap-2 items-center">
                          <input
                            readOnly
                            className="flex-1 border border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-500 truncate"
                            value={claimPath ? window.location.origin + claimPath : ""}
                          />
                          <button
                            onClick={() => claimPath && handleCopy(w.id, claimPath)}
                            className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors shrink-0"
                          >
                            <Copy size={14} />
                            {copiedId === w.id ? T.copied[lang] : T.copyLink[lang]}
                          </button>
                        </div>
                      </div>
                      <button onClick={() => setInvitingId(null)} className="text-gray-400 hover:text-gray-600 shrink-0 mt-1">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

              </Card>
            );
          })}
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
  );
}
