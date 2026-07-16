# CasaNomina — Mobile-Friendliness Analysis

Assessment of what's needed to make the app fully usable on phones. Based on a
read of `packages/web/src`. Tailwind is already in use, so this is
breakpoint/layout work (mobile-first), **not** a rewrite — there are no
architectural blockers.

## Current state, in one line
The **public/marketing pages** (`HomePage.tsx`, `SupportPage.tsx`) were built
responsive (`grid-cols-1 sm:grid-cols-3`, etc.). The **authenticated app** — the
actual product — was built desktop-only: a fixed sidebar, multi-column tables,
and hardcoded grids that don't adapt below a laptop width. The viewport meta tag
is present (`index.html`), so pages render at device width rather than zoomed
out — that's the one baseline that's already right.

---

## 🔴 Critical — the app is not usable on a phone without these

### 1. App shell / sidebar (`components/ui/Layout.tsx`) — the single biggest item
The signed-in shell is a **fixed 256px sidebar that's always visible**:
- `Layout.tsx:27` — `<nav className="w-64 ... fixed top-0 left-0 h-full">`
- `Layout.tsx:89` — `<main className="ml-64 ...">`

On a 375px phone the sidebar eats two-thirds of the screen and the content is
crushed into the remaining strip. There is no hamburger, drawer, or collapse.
**Fix:** convert to a responsive shell — below `md`, hide the sidebar off-canvas
and show a top bar with a hamburger that opens it as a drawer (with an overlay);
content becomes `ml-0 md:ml-64`. This is the highest-impact change and gates
everything else.

### 2. Public nav has no mobile menu (`components/ui/PublicLayout.tsx`)
- `PublicLayout.tsx:37` — the Laws / Calculators / About / Support links are
  `hidden md:flex` with **no hamburger fallback**, so on a phone those pages are
  unreachable from the header (only the logo, language toggle, and auth buttons
  show). This was explicitly deferred as "a future task" when the homepage was
  built. **Fix:** add a mobile menu (hamburger → dropdown/drawer) exposing the
  same links.

### 3. Data tables overflow (no horizontal scroll or reflow)
Multi-column `<table className="w-full">` blocks with no mobile handling:
- `PayrollHistory.tsx:256` (the main history table)
- `Payroll.tsx:41` and `Payroll.tsx:634`
- `Dashboard.tsx:516, 617, 677` (the government/IMSS detail panels)

On narrow screens these either overflow the viewport (causing whole-page
horizontal scroll) or squash columns unreadably. **Fix (minimum):** wrap each in
`<div className="overflow-x-auto">`. **Better:** reflow to stacked "label: value"
cards below `sm` for the payroll history and detail panels.

### 4. Calendar shows three months side-by-side (`pages/Calendar.tsx`)
The month view renders 3 `MonthGrid`s in a row (`flex gap-6`), each a
`grid-cols-7` calendar (`Calendar.tsx:239`). Three 7-column grids side by side
overflow a phone badly. **Fix:** show one month at a time on mobile (stack
vertically or a single-month pager), full three-up only at `md+`.

---

## 🟡 Important — usable but cramped/awkward on mobile

### 5. Hardcoded two-column form grids → single column on mobile
`grid grid-cols-2` with no breakpoint crams two inputs side-by-side on a phone:
- `WorkerProfile.tsx:248, 362, 391, 413`
- `WorkerOnboarding.tsx:284, 413, 440, 540`
- `Payroll.tsx:361`, `Calculators.tsx:95`, `Settings.tsx:162`

**Fix:** `grid-cols-1 sm:grid-cols-2` (mechanical, low-risk).

### 6. Hardcoded three-column stat blocks → stack on mobile
`grid grid-cols-3` for stat/summary cards:
- `Dashboard.tsx:762` (top StatBar), `Dashboard.tsx:1328`
- `Payroll.tsx:538`, `PayrollHistory.tsx:177`, `WorkerProfile.tsx:677`

Three cards across a 375px screen are very tight. **Fix:**
`grid-cols-1 sm:grid-cols-3` (or `grid-cols-2 sm:grid-cols-3` if you want to keep
two-up on small phones).

### 7. Root page padding wastes space
Most app pages open with `p-8` (32px each side = 64px of a ~375px screen):
`Workers.tsx:194`, `Dashboard.tsx:1293`, `PayrollHistory.tsx:150`,
`Payroll.tsx:291`, `WorkerProfile.tsx:213`, `Termination.tsx`, `WorkerOnboarding.tsx:240`,
`Calculators.tsx:58`, `Settings.tsx:90`, `LawsAndRights.tsx:363`.
**Fix:** `p-4 md:p-8` across the board.

### 8. Modals on small screens
`QuickPayrollModal.tsx` uses `max-w-lg max-h-[90vh] overflow-y-auto` inside a
`p-4` backdrop — mostly fine on mobile (fills width, scrolls). Worth a quick pass
to confirm every modal/drawer (termination confirm, invite, etc.) fills the small
screen cleanly and its action buttons stay reachable above the keyboard.

---

## 🟢 Polish

- **Touch targets:** several icon-only buttons are `w-8 h-8` (32px) or `text-xs
  py-1`; bump interactive targets toward ~44px on mobile.
- **Overflow guard:** add `overflow-x-hidden` on the app container and test every
  route at 360–414px for stray horizontal scroll.
- **Long text:** worker names, business names, amounts — verify truncation
  (`truncate`, `min-w-0`) so long values don't break rows on narrow screens.
- **Clerk pages:** the hosted sign-in/sign-up are Clerk components and are already
  responsive — no work needed there.

---

## Suggested order & rough effort
1. **App shell drawer** (Layout) + **public hamburger** (PublicLayout) — ~half the
   total effort; unlocks basic mobile usability. (≈ half a day)
2. **Tables** (overflow/reflow) + **Calendar** single-month on mobile. (≈ half a day)
3. **Grid/padding sweep** (#5–#7) — mostly find-and-replace of Tailwind classes.
   (≈ 1–2 hours)
4. **Mobile QA pass** on a real phone and Chrome DevTools device mode (360px,
   390px, 414px): every route, forms, modals, sign-out flow. (≈ 1–2 hours)

**Total: roughly 1–2 focused days** for a genuinely mobile-friendly result, with
the app shell being the make-or-break piece. Everything is standard Tailwind
responsive work — no data-model or routing changes required.

## Testing checklist
- [ ] Every authenticated route at 375px with no horizontal page scroll
- [ ] Sidebar opens/closes as a drawer; content full-width on mobile
- [ ] Public nav reachable via hamburger on phones
- [ ] Payroll history + IMSS detail tables readable (scroll or reflow)
- [ ] Calendar shows one month cleanly on mobile
- [ ] Forms (worker onboarding/profile, payroll) single-column and thumb-friendly
- [ ] Quick payroll modal + other modals fit and scroll on a small screen
- [ ] Sign in / sign up / sign out flows land correctly on mobile
