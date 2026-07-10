/**
 * pages/AboutPage.tsx
 *
 * Public stub page. Mission statement + "full content coming soon."
 * Bilingual, no auth required. Rendered inside PublicLayout via
 * PublicOrEmployerPage.
 */
import { useLanguage } from "../hooks/useLanguage";
import { Github } from "lucide-react";

const REPO_URL = "https://github.com/Gringocivic/casanomina";

export function AboutPage() {
  const { lang } = useLanguage();
  const en = lang === "en";

  return (
    <div className="py-16 text-center max-w-2xl mx-auto">
      <h1 className="text-4xl font-bold text-gray-900">
        {en ? "About CasaNomina" : "Acerca de CasaNomina"}
      </h1>

      <p className="mt-6 text-base text-gray-600">
        {en
          ? "CasaNomina is a free, open-source tool that helps Mexican households comply with labor law when employing domestic workers. Hundreds of thousands of households employ housekeepers, nannies, cooks, drivers, and caregivers, but navigating IMSS registration, payroll calculations, and benefit tracking is genuinely complex. CasaNomina exists so that doing the right thing is also the easy thing — for employers and for the workers whose legal protections depend on it."
          : "CasaNomina es una herramienta gratuita y de código abierto que ayuda a los hogares mexicanos a cumplir con la ley laboral al emplear trabajadoras del hogar. Cientos de miles de hogares emplean personal doméstico, niñeras, cocineras, choferes y cuidadoras, pero navegar la inscripción al IMSS, los cálculos de nómina y el control de prestaciones es genuinamente complejo. CasaNomina existe para que hacer lo correcto sea también lo más fácil — para los empleadores y para las trabajadoras cuyas protecciones legales dependen de ello."}
      </p>

      <p className="mt-8 text-sm font-medium text-gray-400">
        {en ? "Full content coming soon." : "Contenido completo próximamente."}
      </p>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors"
      >
        <Github className="w-4 h-4" />
        {en ? "View the project on GitHub" : "Ver el proyecto en GitHub"}
      </a>
    </div>
  );
}
