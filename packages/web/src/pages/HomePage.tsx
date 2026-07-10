/**
 * pages/HomePage.tsx
 *
 * Public-facing homepage. Fully bilingual (EN/ES), no auth required.
 * Rendered via PublicOrEmployerPage: signed-out visitors and workers see
 * this inside PublicLayout; signed-in employers are routed to /workers
 * dashboard by PortalRouter instead (this page is not shown to them at "/").
 */
import { Link } from "react-router-dom";
import { useLanguage } from "../hooks/useLanguage";
import { Button } from "../components/ui/Button";
import { Github, CheckCircle2 } from "lucide-react";

const REPO_URL = "https://github.com/Gringocivic/casanomina";

export function HomePage() {
  const { lang } = useLanguage();
  const en = lang === "en";

  return (
    <div>
      {/* 1 — Hero */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl font-bold text-gray-900 max-w-3xl mx-auto">
            {en
              ? "Household payroll, done right — free."
              : "Nómina del hogar, como debe ser — gratis."}
          </h1>
          <p className="mt-5 text-base text-gray-600 max-w-2xl mx-auto">
            {en
              ? "Mexico's domestic workers are entitled to IMSS, vacation pay, and severance by law. CasaNomina helps households comply — correctly, in minutes, at no cost."
              : "Las trabajadoras del hogar tienen derecho al IMSS, vacaciones y liquidación por ley. CasaNomina ayuda a los hogares a cumplir — correctamente, en minutos, sin costo."}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/sign-up">
              <Button variant="primary" size="lg">
                {en ? "I'm an employer — Get started" : "Soy empleador/a — Comenzar"}
              </Button>
            </Link>
            <Link to="/sign-in">
              <Button variant="ghost" size="lg">
                {en ? "I'm a worker — Sign in" : "Soy trabajador/a — Iniciar sesión"}
              </Button>
            </Link>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
            <span>
              {en
                ? "No subscription. No ads. Open source."
                : "Sin suscripción. Sin anuncios. Código abierto."}
            </span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="CasaNomina on GitHub"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="mt-6">
            <Link to="/calculators" className="text-sm font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors">
              {en ? "Or try the calculators first →" : "O prueba primero las calculadoras →"}
            </Link>
          </div>
        </div>
      </section>

      {/* 2 — Why It Matters */}
      <section className="bg-cream py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-terracotta-500">~2.4M</div>
              <p className="mt-2 font-medium text-gray-900">
                {en ? "domestic workers in Mexico" : "trabajadoras del hogar en México"}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {en ? "According to INEGI's ENOE labor survey." : "Según la ENOE del INEGI."}
              </p>
            </div>
            <div>
              <div className="text-4xl font-bold text-terracotta-500">~85%</div>
              <p className="mt-2 font-medium text-gray-900">
                {en ? "without IMSS coverage" : "sin cobertura del IMSS"}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {en
                  ? "Most work without the social security the law requires."
                  : "La mayoría trabaja sin la seguridad social que exige la ley."}
              </p>
            </div>
            <div>
              <div className="text-4xl font-bold text-terracotta-500">1970</div>
              <p className="mt-2 font-medium text-gray-900">
                {en ? "year domestic workers gained equal rights" : "año en que obtuvieron derechos iguales"}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {en
                  ? "LFT Art. 331 has guaranteed these protections for over 50 years."
                  : "El Art. 331 de la LFT garantiza estas protecciones desde hace más de 50 años."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 — What You Can Do When Signed In */}
      <section className="bg-white py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {en ? "For employers" : "Para empleadores"}
              </h2>
              <ul className="mt-4 space-y-3">
                {[
                  en ? "Register workers with correct salary and start date" : "Registra a tus trabajadoras con salario y fecha de inicio correctos",
                  en ? "Calculate IMSS, INFONAVIT, ISR, and net pay automatically" : "Calcula IMSS, INFONAVIT, ISR y pago neto automáticamente",
                  en ? "Approve payroll periods and generate PDF payslips" : "Aprueba períodos de nómina y genera recibos en PDF",
                  en ? "Track vacation balances and accrued benefits" : "Controla saldos de vacaciones y prestaciones acumuladas",
                  en ? "Calculate severance (finiquito) when employment ends" : "Calcula el finiquito al terminar la relación laboral",
                  en ? "Compliance calendar — never miss a payment" : "Calendario de cumplimiento — nunca olvides un pago",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-terracotta-500 mt-0.5 flex-shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {en ? "For workers" : "Para trabajadoras"}
              </h2>
              <ul className="mt-4 space-y-3">
                {[
                  en ? "View your payslips and full deduction breakdown" : "Consulta tus recibos y desglose de deducciones",
                  en ? "See your vacation balance and benefit entitlements" : "Revisa tu saldo de vacaciones y derechos de prestaciones",
                  en ? "Verify what your employer pays to IMSS on your behalf" : "Verifica lo que tu empleador/a paga al IMSS por ti",
                  en ? "Access your rights — with the exact law articles" : "Conoce tus derechos — con los artículos de ley exactos",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-terracotta-500 mt-0.5 flex-shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4 — Laws Teaser */}
      <section className="bg-cream py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {en ? "Know the law" : "Conoce la ley"}
            </h2>
            <p className="mt-2 text-base text-gray-600 max-w-2xl">
              {en
                ? "Domestic workers have the same legal protections as all workers. Here are the key ones."
                : "Las trabajadoras del hogar tienen las mismas protecciones legales que todos los trabajadores. Estas son las principales."}
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: en ? "IMSS registration mandatory" : "Inscripción al IMSS obligatoria", cite: "LSS Art. 12" },
                { title: en ? "Minimum 12 vacation days after year one" : "Mínimo 12 días de vacaciones tras el primer año", cite: "LFT Art. 76" },
                { title: en ? "Christmas bonus ≥ 15 days' salary" : "Aguinaldo ≥ 15 días de salario", cite: "LFT Art. 87" },
              ].map((item) => (
                <div key={item.cite} className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{item.cite}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <Link to="/laws">
                <Button variant="ghost">
                  {en ? "Read all laws and rights →" : "Ver todas las leyes y derechos →"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5 — Calculators Teaser */}
      <section className="bg-white py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-2xl border border-gray-100 bg-cream p-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {en ? "Not sure what you owe? Calculate it." : "¿No sabes cuánto debes pagar? Calcúlalo."}
            </h2>
            <p className="mt-2 text-base text-gray-600 max-w-2xl">
              {en
                ? "Free calculators — no account needed."
                : "Calculadoras gratuitas — sin necesidad de crear una cuenta."}
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  title: en ? "IMSS calculator" : "Calculadora de IMSS",
                  desc: en
                    ? "Estimate monthly IMSS contributions from a daily salary."
                    : "Estima las cuotas mensuales del IMSS a partir del salario diario.",
                },
                {
                  title: en ? "Finiquito calculator" : "Calculadora de finiquito",
                  desc: en
                    ? "Calculate what's owed when employment ends normally."
                    : "Calcula lo que se debe al terminar la relación laboral de forma normal.",
                },
                {
                  title: en ? "Liquidación calculator" : "Calculadora de liquidación",
                  desc: en
                    ? "Calculate severance when employment ends without cause."
                    : "Calcula la liquidación cuando el despido es injustificado.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-100 bg-white p-4">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <Link to="/calculators">
                <Button variant="ghost">
                  {en ? "Try the calculators →" : "Prueba las calculadoras →"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6 — About + Support */}
      <section className="bg-cream py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-8">
              <h2 className="text-2xl font-bold text-gray-900">
                {en ? "About CasaNomina" : "Acerca de CasaNomina"}
              </h2>
              <p className="mt-3 text-base text-gray-600">
                {en
                  ? "CasaNomina is a free, open-source tool that helps Mexican households comply with labor law when employing domestic workers — correct payroll, IMSS registration, and full benefit tracking, at no cost. It exists to close the gap between what the law requires and what most households actually do."
                  : "CasaNomina es una herramienta gratuita y de código abierto que ayuda a los hogares mexicanos a cumplir con la ley laboral al emplear trabajadoras del hogar — nómina correcta, inscripción al IMSS y control completo de prestaciones, sin costo. Existe para cerrar la brecha entre lo que exige la ley y lo que hacen la mayoría de los hogares."}
              </p>
              <Link to="/about" className="mt-4 inline-block text-sm font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors">
                {en ? "Learn more →" : "Saber más →"}
              </Link>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-8">
              <h2 className="text-2xl font-bold text-gray-900">
                {en ? "Support the project" : "Apoya el proyecto"}
              </h2>
              <p className="mt-3 text-base text-gray-600">
                {en
                  ? "CasaNomina will always be free. If it helps you pay your household worker correctly, you can support the project by starring it on GitHub or sharing it with other employers."
                  : "CasaNomina siempre será gratuita. Si te ayuda a pagarle correctamente a tu trabajadora del hogar, puedes apoyar el proyecto dándole estrella en GitHub o compartiéndolo con otros empleadores."}
              </p>
              <Link to="/support" className="mt-4 inline-block text-sm font-medium text-terracotta-500 hover:text-terracotta-600 transition-colors">
                {en ? "See how to help →" : "Ver cómo ayudar →"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 7 — Footer */}
      <footer className="bg-white border-t border-gray-100 py-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
            <Link to="/" className="hover:text-gray-900 transition-colors">{en ? "Home" : "Inicio"}</Link>
            <Link to="/laws" className="hover:text-gray-900 transition-colors">{en ? "Laws" : "Leyes"}</Link>
            <Link to="/calculators" className="hover:text-gray-900 transition-colors">{en ? "Calculators" : "Calculadoras"}</Link>
            <Link to="/about" className="hover:text-gray-900 transition-colors">{en ? "About" : "Acerca de"}</Link>
            <Link to="/support" className="hover:text-gray-900 transition-colors">{en ? "Support" : "Apoyo"}</Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="hover:text-gray-900 transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
          <p className="mt-4 text-center text-xs text-gray-400">
            {en
              ? "© 2026 CasaNomina — Free, open-source household payroll compliance for Mexico."
              : "© 2026 CasaNomina — Cumplimiento de nómina del hogar, gratuito y de código abierto para México."}
          </p>
        </div>
      </footer>
    </div>
  );
}
