/**
 * Onboarding.tsx
 *
 * Shown once after sign-up. The user picks their role (employer or worker),
 * which triggers a backend call that creates the matching DB row and stamps
 * publicMetadata.role on their Clerk account.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Briefcase, HardHat, ArrowRight, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useLanguage } from "../hooks/useLanguage";

type Role = "employer" | "worker";

export function Onboarding() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [selected, setSelected] = useState<Role | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoaded && user?.publicMetadata?.role) {
    navigate("/", { replace: true });
    return null;
  }

  // Pre-fill name from Clerk profile if available
  const clerkName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  async function handleContinue() {
    if (!selected) return;
    if (selected === "worker" && !fullName.trim()) {
      setError(lang === "en" ? "Please enter your full name." : "Por favor ingresa tu nombre completo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.auth.registerRole({
        role: selected,
        ...(selected === "worker" ? { full_name: fullName.trim() || clerkName } : {}),
      });
      await user?.reload();
      navigate("/", { replace: true });
    } catch (e: any) {
      setError(e.message ?? "Something went wrong — please try again.");
      setLoading(false);
    }
  }

  const t = {
    heading:  { en: "How will you use CasaNomina?", es: "¿Cómo usarás CasaNomina?" },
    sub:      { en: "Choose your role to set up your account.", es: "Elige tu rol para configurar tu cuenta." },
    employer: { en: "I'm an employer",   es: "Soy empleador/a"   },
    empDesc:  { en: "I hire domestic workers and need to manage payroll, contracts, and IMSS contributions.",
                es: "Contrato trabajadoras del hogar y necesito gestionar nómina, contratos y cuotas IMSS." },
    worker:   { en: "I'm a worker",      es: "Soy trabajador/a"  },
    worDesc:  { en: "I work in a household and want to view my payslips, contracts, and rights.",
                es: "Trabajo en un hogar y quiero ver mis recibos de nómina, contratos y derechos." },
    nameLabel:{ en: "Your full name",    es: "Tu nombre completo" },
    continue: { en: "Continue",          es: "Continuar"         },
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-terracotta-500 flex items-center justify-center text-white font-bold">
            CN
          </div>
          <span className="text-xl font-bold text-gray-900">CasaNomina</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.heading[lang]}</h1>
        <p className="text-gray-500 mb-8">{t.sub[lang]}</p>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <RoleCard
            icon={<Briefcase size={28} />}
            title={t.employer[lang]}
            description={t.empDesc[lang]}
            selected={selected === "employer"}
            onClick={() => setSelected("employer")}
          />
          <RoleCard
            icon={<HardHat size={28} />}
            title={t.worker[lang]}
            description={t.worDesc[lang]}
            selected={selected === "worker"}
            onClick={() => setSelected("worker")}
          />
        </div>

        {/* Full name field — only shown for workers */}
        {selected === "worker" && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t.nameLabel[lang]} *
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500"
              value={fullName || clerkName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={lang === "en" ? "María García López" : "María García López"}
              autoFocus
            />
          </div>
        )}

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <button
          onClick={handleContinue}
          disabled={!selected || loading}
          className="w-full flex items-center justify-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
        >
          {loading
            ? <><Loader2 size={18} className="animate-spin" /> {lang === "en" ? "Setting up…" : "Configurando…"}</>
            : <>{t.continue[lang]} <ArrowRight size={18} /></>
          }
        </button>
      </div>
    </div>
  );
}

interface RoleCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function RoleCard({ icon, title, description, selected, onClick }: RoleCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-2xl border-2 transition-colors flex items-start gap-4
        ${selected
          ? "border-terracotta-500 bg-terracotta-50"
          : "border-gray-200 bg-white hover:border-gray-300"}`}
    >
      <div className={`mt-0.5 flex-shrink-0 ${selected ? "text-terracotta-600" : "text-gray-400"}`}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
    </button>
  );
}
