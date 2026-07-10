/**
 * pages/SupportPage.tsx
 *
 * Public stub page. Explains the project is free and how to support it.
 * Bilingual, no auth required. Rendered inside PublicLayout via
 * PublicOrEmployerPage.
 */
import { useLanguage } from "../hooks/useLanguage";
import { Github, Share2, Heart } from "lucide-react";

const REPO_URL = "https://github.com/Gringocivic/casanomina";

export function SupportPage() {
  const { lang } = useLanguage();
  const en = lang === "en";

  return (
    <div className="py-16 text-center max-w-2xl mx-auto">
      <h1 className="text-4xl font-bold text-gray-900">
        {en ? "Support the project" : "Apoya el proyecto"}
      </h1>

      <p className="mt-6 text-base text-gray-600">
        {en
          ? "CasaNomina is free and will stay free — no subscription, no ads, no paywalled features. It's built so that cost is never a reason a household worker goes without the protections the law guarantees her."
          : "CasaNomina es gratuita y seguirá siéndolo — sin suscripción, sin anuncios, sin funciones de pago. Está construida para que el costo nunca sea la razón por la que una trabajadora del hogar se quede sin las protecciones que la ley le garantiza."}
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        <div className="rounded-2xl border border-gray-100 p-5">
          <Github className="w-5 h-5 text-terracotta-500" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            {en ? "Star it on GitHub" : "Dale estrella en GitHub"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {en ? "Helps more households discover it." : "Ayuda a que más hogares lo descubran."}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 p-5">
          <Share2 className="w-5 h-5 text-terracotta-500" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            {en ? "Share it" : "Compártelo"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {en ? "Tell other employers who might need it." : "Cuéntale a otros empleadores que podrían necesitarlo."}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 p-5">
          <Heart className="w-5 h-5 text-terracotta-500" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            {en ? "Donate (coming soon)" : "Donar (próximamente)"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {en ? "Donation details are still being set up." : "Los detalles de donación aún se están definiendo."}
          </p>
        </div>
      </div>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors"
      >
        <Github className="w-4 h-4" />
        {en ? "View the project on GitHub" : "Ver el proyecto en GitHub"}
      </a>
    </div>
  );
}
