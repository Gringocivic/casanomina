/**
 * PublicLayout.tsx
 *
 * Minimal header layout for public-facing pages (Calculators, Laws & Rights,
 * sample contract). No sidebar — just logo, language toggle, and auth links.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Menu, X } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";

const NAV_LINKS = [
  { to: "/laws", en: "Laws", es: "Leyes" },
  { to: "/calculators", en: "Calculators", es: "Calculadoras" },
  { to: "/about", en: "About", es: "Acerca de" },
  { to: "/support", en: "Support", es: "Apoyo" },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const { lang, setLang } = useLanguage();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close the mobile menu automatically on route change.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-terracotta-500 flex items-center justify-center text-white font-bold text-sm">
              CN
            </div>
            <span className="font-bold text-gray-900">CasaNomina</span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={active ? "text-sm text-gray-900 font-medium" : "text-sm text-gray-500 hover:text-gray-700"}
                >
                  {lang === "en" ? link.en : link.es}
                </Link>
              );
            })}
          </nav>

          {/* Right side: language + auth (desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                  ${lang === "en" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("es")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                  ${lang === "es" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                ES
              </button>
            </div>

            {/* Auth links */}
            <SignedOut>
              <Link
                to="/sign-in"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {lang === "en" ? "Sign in" : "Iniciar sesión"}
              </Link>
              <Link
                to="/sign-up"
                className="text-sm font-semibold bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                {lang === "en" ? "Get started" : "Comenzar"}
              </Link>
            </SignedOut>

            <SignedIn>
              <Link
                to="/"
                className="text-sm font-semibold bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                {lang === "en" ? "Go to dashboard" : "Ir al inicio"}
              </Link>
            </SignedIn>
          </div>

          {/* Hamburger (mobile only) */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={
              isMenuOpen
                ? (lang === "en" ? "Close menu" : "Cerrar menú")
                : (lang === "en" ? "Open menu" : "Abrir menú")
            }
            aria-expanded={isMenuOpen}
            className="md:hidden p-2 -mr-2 text-gray-600 hover:text-gray-900"
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu (slide-down) */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <nav className="max-w-5xl mx-auto px-6 py-3 flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setIsMenuOpen(false)}
                    className={`px-2 py-2.5 rounded-lg text-sm ${
                      active
                        ? "text-gray-900 font-medium bg-gray-50"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {lang === "en" ? link.en : link.es}
                  </Link>
                );
              })}

              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 mt-2 w-fit">
                <button
                  onClick={() => setLang("en")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                    ${lang === "en" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLang("es")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                    ${lang === "es" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  ES
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
                <SignedOut>
                  <Link
                    to="/sign-in"
                    onClick={() => setIsMenuOpen(false)}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-2 py-2"
                  >
                    {lang === "en" ? "Sign in" : "Iniciar sesión"}
                  </Link>
                  <Link
                    to="/sign-up"
                    onClick={() => setIsMenuOpen(false)}
                    className="text-sm font-semibold bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-2 rounded-lg transition-colors text-center"
                  >
                    {lang === "en" ? "Get started" : "Comenzar"}
                  </Link>
                </SignedOut>

                <SignedIn>
                  <Link
                    to="/"
                    onClick={() => setIsMenuOpen(false)}
                    className="text-sm font-semibold bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-2 rounded-lg transition-colors text-center"
                  >
                    {lang === "en" ? "Go to dashboard" : "Ir al inicio"}
                  </Link>
                </SignedIn>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center">
        <p className="text-xs text-gray-400">
          CasaNomina — {lang === "en"
            ? "Free, open-source household payroll compliance for Mexico."
            : "Nómina del hogar libre y de código abierto para México."}
        </p>
      </footer>
    </div>
  );
}
