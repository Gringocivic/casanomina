import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Receipt, Calendar,
  BookOpen, Calculator, Settings, History, Menu, X,
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
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // Close the drawer automatically on route change.
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Close on Esc.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  // Basic focus handling: move focus into the drawer when it opens, and back
  // to the hamburger button when it closes (if it was the drawer that closed).
  useEffect(() => {
    if (isDrawerOpen) {
      closeButtonRef.current?.focus();
    } else if (wasOpenRef.current) {
      hamburgerRef.current?.focus();
    }
    wasOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 z-30">
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label={lang === "en" ? "Open menu" : "Abrir menú"}
          aria-expanded={isDrawerOpen}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
        >
          <Menu size={22} />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-terracotta-500 flex items-center justify-center text-white font-bold text-sm">
            CN
          </div>
        </Link>
        <UserButton afterSignOutUrl="/" />
      </div>

      {/* Overlay (mobile only, shown while drawer is open) */}
      {isDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden="true"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`w-64 bg-white border-r border-gray-100 flex flex-col fixed top-0 left-0 h-full z-50
          transform transition-transform duration-300 ease-in-out
          ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-terracotta-500 flex items-center justify-center text-white font-bold text-sm">
              CN
            </div>
            <div>
              <span className="font-bold text-gray-900">CasaNomina</span>
              <p className="text-xs text-gray-400">Household Payroll</p>
            </div>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            aria-label={lang === "en" ? "Close menu" : "Cerrar menú"}
            className="md:hidden p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setIsDrawerOpen(false)}
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
          <div className="hidden md:flex items-center gap-3 px-3 py-2">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-gray-600">
              {lang === "en" ? "Account" : "Cuenta"}
            </span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="ml-0 md:ml-64 flex-1 min-h-screen pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
