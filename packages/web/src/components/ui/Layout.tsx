import type { ReactNode } from "react";
import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard, Users, Receipt, Calendar,
  BookOpen, Calculator, Settings, History,
} from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { UserButton } from "@clerk/clerk-react";

const NAV_ITEMS = [
  { to: "/",            label: { en: "Dashboard",   es: "Inicio"       }, Icon: LayoutDashboard },
  { to: "/workers",     label: { en: "Workers",      es: "Trabajadores" }, Icon: Users           },
  { to: "/payroll",     label: { en: "Payroll",      es: "Nómina"       }, Icon: Receipt         },
  { to: "/calendar",    label: { en: "Calendar",     es: "Calendario"   }, Icon: Calendar        },
  { to: "/laws",        label: { en: "Laws & Rights",es: "Derechos"     }, Icon: BookOpen        },
  { to: "/calculators", label: { en: "Calculators",  es: "Calculadoras" }, Icon: Calculator      },
  { to: "/history",     label: { en: "History",       es: "Historial"     }, Icon: History         },
  { to: "/settings",    label: { en: "Settings",      es: "Configuración"  }, Icon: Settings        },
];

export function Layout({ children }: { children: ReactNode }) {
  const { lang, setLang } = useLanguage();

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Sidebar */}
      <nav className="w-64 bg-white border-r border-gray-100 flex flex-col fixed top-0 left-0 h-full">
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-terracotta-500 flex items-center justify-center text-white font-bold text-sm">
              CN
            </div>
            <div>
              <span className="font-bold text-gray-900">CasaNomina</span>
              <p className="text-xs text-gray-400">Household Payroll</p>
            </div>
          </Link>
        </div>

        {/* Nav links */}
        <div className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${isActive
                  ? "bg-terracotta-50 text-terracotta-600 border border-terracotta-100"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`
              }
            >
              <Icon size={18} />
              {label[lang]}
            </NavLink>
          ))}
        </div>

        {/* Language toggle + settings */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang("en")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${lang === "en" ? "bg-terracotta-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("es")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${lang === "es" ? "bg-terracotta-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              ES
            </button>
          </div>
          <div className="flex items-center gap-3 px-3 py-2">
            <UserButton afterSignOutUrl="/sign-in" />
            <span className="text-sm text-gray-600">
              {lang === "en" ? "Account" : "Cuenta"}
            </span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="ml-64 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  );
}
