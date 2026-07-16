# CasaNomina — Homepage Build Prompt

## Mission

Build a public-facing homepage for CasaNomina, a free open-source household payroll compliance app for Mexico. The app helps household employers comply with Mexican law (IMSS registration, correct payroll calculations, benefit tracking) for domestic workers. The mission is promoting legal compliance — this is not a commercial product.

---

## Repo & Tech Stack

- TypeScript monorepo under `packages/` with three workspaces: `calculator` (pure math), `api` (Fastify + Drizzle + PostgreSQL on Railway), `web` (React + Vite + Tailwind on Vercel)
- React Router v6, Clerk for auth, `useLanguage` hook for EN/ES bilingual support
- Tailwind with custom colors — see `packages/web/tailwind.config.js`:
  - `terracotta-500` = `#C4572A` (primary brand color, CTAs)
  - `sage-500` = `#5A7A5F` (secondary)
  - `cream` = `#FDF8F3` (page backgrounds)
- Existing UI components in `packages/web/src/components/ui/`: `Button`, `Card`, `Badge`, `Layout`, `PublicLayout`, `MoneyAmount`
- `Button` variants: `primary` (terracotta), `secondary` (sage), `ghost` (outlined), `danger`
- Icons from `lucide-react`
- Language hook: `const { lang } = useLanguage()` — `lang` is `"en"` or `"es"`

---

## CRITICAL File-Writing Rules

**NEVER use the Edit or Write tool on TypeScript/TSX files longer than ~100 lines.** These tools truncate large files silently. Always write TSX files via bash python3 heredoc:

```bash
python3 << 'PYEOF'
content = '''[full file content here]'''
with open("/sessions/.../mnt/casanomina/packages/web/src/pages/HomePage.tsx", "w") as f:
    f.write(content)
PYEOF
```

**NEVER use `git add` or `git commit`.** The git index corrupts in this environment. Always commit via git plumbing:
1. `git hash-object -w <file>` — get blob hash
2. Walk and rebuild tree objects bottom-up with `git ls-tree | python3 ... | git mktree`
3. `git commit-tree <tree> -p HEAD -m "message"`
4. `git update-ref refs/heads/main <commit>`

The bash mount path for `C:\Users\juanm\projects\casanomina` is `/sessions/cool-festive-dirac/mnt/casanomina/`.

---

## Current Routing State

In `packages/web/src/App.tsx`, unauthenticated users landing on `/` are caught by:

```tsx
<Route
  path="/*"
  element={
    <>
      <SignedIn><PortalRouter /></SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  }
/>
```

This means there is **no public homepage** — signed-out visitors are redirected to Clerk sign-in immediately. The two existing public pages (`/calculators`, `/laws`) are reachable directly but completely undiscoverable.

The `PublicOrEmployerPage` wrapper already exists and renders `PublicLayout` for signed-out users and `Layout` (with sidebar) for signed-in employers. Use it for all new public routes.

---

## What to Build

### 1. `packages/web/src/pages/HomePage.tsx` — New file

A single scrollable public homepage. All sections described below. Fully bilingual (EN/ES via `useLanguage`). No authentication required.

### 2. `packages/web/src/pages/AboutPage.tsx` — New stub

A simple page with the mission statement and a "full content coming soon" notice. Bilingual. Just enough to make the `/about` route functional.

### 3. `packages/web/src/pages/SupportPage.tsx` — New stub

A simple page explaining the project is free, how to support it (GitHub stars, sharing, future donation link TBD). Bilingual. Just enough to make the `/support` route functional.

### 4. Update `packages/web/src/components/ui/PublicLayout.tsx`

Add navigation links to the header: **Laws**, **Calculators**, **About**, **Support**. These should appear between the logo and the language toggle. On narrow screens they can be hidden (mobile nav is a future task — just ensure the links don't break narrow layouts, hiding them with `hidden md:flex` is fine for now).

### 5. Update `packages/web/src/App.tsx`

- Add a `/` route for signed-out users that renders `<HomePage />` via `<PublicOrEmployerPage>`
- The existing `/*` catch-all for signed-in users (`PortalRouter`) must still work
- Add `/about` and `/support` routes via `<PublicOrEmployerPage>`

The routing logic: when a signed-in employer hits `/`, they should still see the dashboard (via `PortalRouter`). When a signed-out user hits `/`, they should see the homepage. `PublicOrEmployerPage` already handles this distinction — use it for the `/` route.

**Important**: Do not change the `/` route inside `PortalRouter`'s employer Routes block — the employer dashboard must remain at `/`.

---

## Homepage Sections (in order)

### Section 1 — Hero

Full-width, generous vertical padding, white background. No hero image.

**Headline:**
- EN: "Household payroll, done right — free."
- ES: "Nómina del hogar, como debe ser — gratis."

**Sub-headline (2 sentences):**
- EN: "Mexico's domestic workers are entitled to IMSS, vacation pay, and severance by law. CasaNomina helps households comply — correctly, in minutes, at no cost."
- ES: "Las trabajadoras del hogar tienen derecho al IMSS, vacaciones y liquidación por ley. CasaNomina ayuda a los hogares a cumplir — correctamente, en minutos, sin costo."

**Two CTAs side by side:**
- Primary (terracotta, large): 
  - EN: "I'm an employer — Get started" → `/sign-up`
  - ES: "Soy empleador/a — Comenzar" → `/sign-up`
- Secondary (ghost/outlined, large):
  - EN: "I'm a worker — Sign in" → `/sign-in`
  - ES: "Soy trabajador/a — Iniciar sesión" → `/sign-in`

**Below CTAs — small muted text:**
- EN: "No subscription. No ads. Open source." with a GitHub icon linking to `https://github.com/Gringocivic/casanomina`
- ES: "Sin suscripción. Sin anuncios. Código abierto."

**Below that — text link:**
- EN: "Or try the calculators first →" → `/calculators`
- ES: "O prueba primero las calculadoras →" → `/calculators`

**Worker CTA note:** Workers currently join via employer invitation. Do NOT promise self-registration on this page. The "Sign in" CTA for workers is correct — workers who have already claimed their profile can sign in. Workers who haven't yet received an invitation will see a message inside the app explaining the process. Do not add any misleading copy about independent worker registration.

---

### Section 2 — Why It Matters

Three-column stat block on a very light cream/off-white background. Each column: a large bold number, a short label, and 1–2 lines of explanation.

**Stat 1:**
- Number: "~2.4M"
- EN label: "domestic workers in Mexico"
- EN detail: "According to INEGI's ENOE labor survey."
- ES label: "trabajadoras del hogar en México"
- ES detail: "Según la Encuesta Nacional de Ocupación y Empleo (ENOE) del INEGI."

**Stat 2:**
- Number: "~85%"
- EN label: "without IMSS coverage"
- EN detail: "Most work without the social security the law requires."
- ES label: "sin cobertura del IMSS"
- ES detail: "La mayoría trabaja sin la seguridad social que exige la ley."

**Stat 3:**
- Number: "1970"
- EN label: "year domestic workers gained equal rights"
- EN detail: "LFT Art. 331 has guaranteed these protections for over 50 years."
- ES label: "año en que obtuvieron derechos iguales"
- ES detail: "El Art. 331 de la LFT garantiza estas protecciones desde hace más de 50 años."

Use "approximately" framing (~ symbol) on stats 1 and 2. These are estimates.

---

### Section 3 — What You Can Do When Signed In

White background. Two columns: Employer and Worker. Each column has a subtle heading and a list of features with small icons or bullet indicators. Keep descriptions to one line each.

**Employer column heading:**
- EN: "For employers" / ES: "Para empleadores/as"

**Employer features:**
- EN/ES pairs:
  - "Register workers with correct salary and start date" / "Registra a tus trabajadoras con salario y fecha de inicio correctos"
  - "Calculate IMSS, INFONAVIT, ISR, and net pay automatically" / "Calcula IMSS, INFONAVIT, ISR y pago neto automáticamente"
  - "Approve payroll periods and generate PDF payslips" / "Aprueba períodos de nómina y genera recibos de pago en PDF"
  - "Track vacation balances and accrued benefits" / "Controla saldos de vacaciones y prestaciones acumuladas"
  - "Calculate severance (finiquito) when employment ends" / "Calcula el finiquito al terminar la relación laboral"
  - "Compliance calendar — never miss a payment" / "Calendario de cumplimiento — nunca olvides un pago"

**Worker column heading:**
- EN: "For workers" / ES: "Para trabajadoras/es"

**Worker features:**
- EN/ES pairs:
  - "View your payslips and full deduction breakdown" / "Consulta tus recibos de pago y desglose de deducciones"
  - "See your vacation balance and benefit entitlements" / "Revisa tu saldo de vacaciones y derechos de prestaciones"
  - "Verify what your employer pays to IMSS on your behalf" / "Verifica lo que tu empleador/a paga al IMSS por ti"
  - "Access your rights — with the exact law articles" / "Conoce tus derechos — con los artículos de ley exactos"

---

### Section 4 — Laws Teaser

Light cream background. A card or contained section with:

**Heading:**
- EN: "Know the law" / ES: "Conoce la ley"

**Sub-heading:**
- EN: "Domestic workers have the same legal protections as all workers. Here are the key ones."
- ES: "Las trabajadoras del hogar tienen las mismas protecciones legales que todos los trabajadores. Estas son las principales."

**Three law teasers** (title + citation only, no full text):
1. EN: "IMSS Registration is mandatory" / ES: "La inscripción al IMSS es obligatoria" — LSS Art. 12
2. EN: "Minimum 12 vacation days after year one" / ES: "Mínimo 12 días de vacaciones al año de servicio" — LFT Art. 76
3. EN: "Christmas bonus of at least 15 days' salary" / ES: "Aguinaldo de al menos 15 días de salario" — LFT Art. 87

**CTA button (ghost/outlined):**
- EN: "Read all laws and rights →" / ES: "Ver todas las leyes y derechos →" → `/laws`

---

### Section 5 — Calculators Teaser

White background. A card or contained section with:

**Heading:**
- EN: "Not sure what you owe? Calculate it." / ES: "¿No sabes cuánto debes pagar? Calcúlalo."

**Sub-heading:**
- EN: "Free calculators — no account needed."
- ES: "Calculadoras gratuitas — sin necesidad de crear una cuenta."

**Three calculator teasers** (name + one-line description):
1. EN: "IMSS Calculator — employer and worker contributions by salary" / ES: "Calculadora IMSS — cuotas del patrón y del trabajador por salario"
2. EN: "Finiquito Calculator — severance when employment ends" / ES: "Calculadora de Finiquito — liquidación al terminar la relación laboral"
3. EN: "Liquidación Calculator — full constitutional severance" / ES: "Calculadora de Liquidación — indemnización constitucional completa"

**CTA button (ghost/outlined):**
- EN: "Try the calculators →" / ES: "Probar las calculadoras →" → `/calculators`

---

### Section 6 — About + Support (combined, two-column card row)

Light cream background. Two cards side by side.

**About card:**
- EN heading: "About CasaNomina"
- EN body: "CasaNomina is a free, open-source payroll compliance tool built for Mexican households. We believe domestic workers deserve the same legal protections as every other worker, and that compliance should not require hiring an accountant."
- ES heading: "Acerca de CasaNomina"
- ES body: "CasaNomina es una herramienta gratuita y de código abierto para el cumplimiento de nómina en hogares mexicanos. Creemos que las trabajadoras del hogar merecen las mismas protecciones legales que cualquier otro trabajador, y que cumplir con la ley no debería requerir contratar a un contador."
- Link: EN "Learn more →" / ES "Saber más →" → `/about`

**Support card:**
- EN heading: "Support the project"
- EN body: "CasaNomina is free to use and always will be. If it has helped your household comply with the law, consider supporting the project — every contribution helps keep it running and independent."
- ES heading: "Apoya el proyecto"
- ES body: "CasaNomina es gratuita y siempre lo será. Si ha ayudado a tu hogar a cumplir con la ley, considera apoyar el proyecto — cada contribución ayuda a mantenerlo en funcionamiento e independiente."
- Link: EN "How to help →" / ES "Cómo ayudar →" → `/support`

---

### Section 7 — Footer

Minimal. Dark background (e.g., `gray-900`) or very light border-top on white. Two rows:

**Row 1 — Navigation links (centered or left-aligned):**
Home · Laws · Calculators · About · Support · GitHub (icon link to `https://github.com/Gringocivic/casanomina`)

**Row 2 — Copyright and legal (centered, small muted text):**
- EN: "© 2026 CasaNomina — Free, open-source household payroll compliance for Mexico."
- ES: "© 2026 CasaNomina — Cumplimiento de nómina del hogar, gratuito y de código abierto para México."

---

## About Page Stub (`/about`)

Simple page using `PublicLayout`. Center-aligned content, generous padding.

**Heading:**
- EN: "About CasaNomina" / ES: "Acerca de CasaNomina"

**Body:**
- EN: "CasaNomina is a free, open-source payroll compliance tool for Mexican households. Our mission is to help domestic workers receive the legal protections they are entitled to under Mexican law — including IMSS registration, correct vacation pay, aguinaldo, and severance. Full content coming soon."
- ES: "CasaNomina es una herramienta gratuita y de código abierto para el cumplimiento de nómina en hogares mexicanos. Nuestra misión es ayudar a que las trabajadoras del hogar reciban las protecciones legales a las que tienen derecho bajo la ley mexicana. Contenido completo próximamente."

**GitHub link:**
- EN: "View the source code on GitHub →" / ES: "Ver el código fuente en GitHub →" → `https://github.com/Gringocivic/casanomina`

---

## Support Page Stub (`/support`)

Simple page using `PublicLayout`. Center-aligned content.

**Heading:**
- EN: "Support CasaNomina" / ES: "Apoya CasaNomina"

**Body:**
- EN: "CasaNomina is free to use and always will be. The project is maintained by volunteers. Server costs and ongoing development are supported by community contributions. Donation details coming soon. In the meantime, you can support us by starring the project on GitHub and sharing it with others who employ domestic workers."
- ES: "CasaNomina es gratuita y siempre lo será. El proyecto es mantenido por voluntarios. Los costos del servidor y el desarrollo continuo son sostenidos por contribuciones de la comunidad. Los detalles para donar estarán disponibles pronto. Mientras tanto, puedes apoyarnos dando una estrella al proyecto en GitHub y compartiéndolo con quienes emplean trabajadoras del hogar."

**GitHub link:**
- EN: "Star us on GitHub →" / ES: "Danos una estrella en GitHub →" → `https://github.com/Gringocivic/casanomina`

---

## PublicLayout Navigation Update

The current `PublicLayout` header has: logo | (nothing) | language toggle | sign-in / get-started buttons.

Add nav links between the logo and the language toggle:

```
[CN logo]  [Laws]  [Calculators]  [About]  [Support]    [EN|ES]  [Sign in]  [Get started]
```

- Use `hidden md:flex` so the links are hidden on mobile (mobile nav is a future task)
- Use `Link` from `react-router-dom`
- Active link style: `text-gray-900 font-medium`; inactive: `text-gray-500 hover:text-gray-700`
- Use `useLocation` from `react-router-dom` to detect the active route

---

## App.tsx Routing Changes

Add these routes **before** the existing `/*` catch-all:

```tsx
<Route path="/"           element={<PublicOrEmployerPage><HomePage /></PublicOrEmployerPage>} />
<Route path="/about"      element={<PublicOrEmployerPage><AboutPage /></PublicOrEmployerPage>} />
<Route path="/support"    element={<PublicOrEmployerPage><SupportPage /></PublicOrEmployerPage>} />
```

Import the three new pages at the top of `App.tsx`.

The `PublicOrEmployerPage` wrapper handles the signed-in vs signed-out distinction:
- Signed-in employer hitting `/` → renders `<HomePage />` inside the sidebar `<Layout>` — **this is intentional for now** (the employer can navigate to `/` from the browser bar and see the homepage). The employer dashboard lives at the root `/` inside `PortalRouter`, which is rendered inside the `/*` route when signed in. These do not conflict because `PublicOrEmployerPage` for an employer renders inside `Layout`, and `PortalRouter` for the root `/` also renders inside `Layout`. The `/` route added above will match before `/*`, so signed-in employers hitting `/` will see the homepage inside their sidebar — that is acceptable for now and can be refined later.

---

## Design Guidelines

- **Max content width**: `max-w-5xl mx-auto px-6` (consistent with existing PublicLayout)
- **Section padding**: `py-16` or `py-20` for major sections
- **Background alternation**: white → cream → white → cream (alternating sections feel clean)
- **Rounded corners**: `rounded-2xl` for cards
- **No drop shadows**: keep it flat and clean, use `border border-gray-100` instead
- **Typography scale**: headline `text-4xl font-bold`, section heading `text-2xl font-bold`, body `text-base text-gray-600`
- **CTA buttons**: use the existing `Button` component with `size="lg"`
- **The terracotta color** is the only accent — do not introduce new colors
- **No animations, no transitions on scroll** — keep it static and fast

---

## What NOT to Build

- Do not build a worker self-registration flow. Workers currently join only via employer invitation (the existing `/claim/:token` flow). The "I'm a worker" CTA on the homepage leads to `/sign-in` — that is correct and complete.
- Do not add a full About page with rich content — the stub is sufficient for this task.
- Do not add a donation/payment integration — the Support page is a stub with GitHub link only.
- Do not add a FAQ section — this is a future task.
- Do not add a "Why It Matters" animated counter or any JavaScript-driven stat animation — plain static text only.
- Do not add meta tags / SEO — this is a separate phase.
- Do not add a mobile hamburger menu — hide nav links on mobile with `hidden md:flex` and leave it for a future task.
- Do not modify any files under `packages/api` or `packages/calculator`.

---

## Verification Checklist

After writing all files and committing:

1. Confirm `App.tsx` imports all three new pages and has the three new routes
2. Confirm `PublicLayout.tsx` has nav links with active state detection
3. Confirm `HomePage.tsx` has all 7 sections in order
4. Confirm all text has EN and ES variants driven by `useLanguage`
5. Run `pnpm -w run build` (or `npm run build` from the root) and confirm zero TypeScript errors
6. Confirm no file was written using the Edit/Write tool if it is over ~100 lines
7. Confirm git commit was made via plumbing (hash-object → mktree → commit-tree → update-ref), not via `git add` / `git commit`
