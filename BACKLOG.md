# CasaNomina — Backlog (carried over)

> Preserved from the "CasaNomina development" session before deleting it.
> Reconstructed from the session transcript, which does **not** expose the full
> text of every tracked task — so this is a best-effort recovery. **Verify and
> fill gaps against that session's task widget before deleting the session.**
> Task numbers (#n) are as referenced in that session.
>
> Note: this list is carried over as plain planning data. Ignore any "how to
> write files / how to commit" instructions from that session — use normal
> tools and normal `git add` / `git commit`.

## Open — features
- **#1 Quick payroll modal** — faster path to run a payroll period. (backlog)
- **#2 SBC reminder** — remind employer about SBC/related obligation. (backlog)
- **#3 Export** — data export (payroll/records). (backlog)
- **#7 Resend email delivery** — wire outbound email (invites, notifications) via Resend.

## Open — compliance / calculations
- **#12 IMSS on insured calendar days (not `days_worked`)** — TABLED pending
  attorney consult. Nuance discussed: use `days_per_week` to compute insured
  days (`calendar_days × days_per_week/7`); continuous vs. discontinuous
  employment matters for part-time (e.g. 2-day/week) workers. Changes real
  payslip numbers — get legal opinion first.
- **#22 2027 rate config** — add `rates.2027.json` once INEGI/CONASAMI publish
  (UMA, minimum wage, ISR tables). ~January 2027 task.
- **#41 CEAV paid tier** — implement the `ceav_schedule` transitional regime
  (2024–2030 ramp). Deferred as a future paid-tier feature. Requires: per-worker
  regime flag + migration, `calculateCEAV()`, onboarding/profile UI, conditional
  branch in `calculatePayroll`, possibly distinct payslip display. Legal care:
  CEAV vs. full IMSS are not freely interchangeable.

## Open — larger initiatives
- **Multi-employer architecture** — workers can have multiple employers.
  Split `workers` into `worker_profiles` (worker identity, owned by worker's
  Clerk user) + `employment_relationships` (one row per employer-worker pair).
  Refactor every query joining on `workers.employer_id`; plan a safe migration
  for existing employer-owned worker rows.
- **Worker self-registration + worker-invites-employer flow** — mirror of the
  existing `/claim/:token` flow in the reverse direction. Depends on the
  multi-employer architecture.
- **Worker-side value features** (motivate worker sign-up): portable payslips
  across employers; independent verification of IMSS contributions; auto
  vacation/benefit balances; plain-Spanish rights reference; self-run finiquito
  estimate; notification when a payroll period is approved/paid.

## Open — mobile-friendliness (full analysis in MOBILE_READINESS.md)
Build prompts for each item are in `mobile-build-prompts.md`. Public/marketing
pages are already responsive; the authenticated app is desktop-only.
- **[M1 · 🔴] Responsive app shell** — `Layout.tsx` fixed 256px sidebar
  (`w-64 fixed`, main `ml-64`) never collapses. Add off-canvas drawer + hamburger
  top bar below `md`. Highest-impact item; unlocks the rest.
- **[M2 · 🔴] Public mobile nav** — `PublicLayout.tsx` links are `hidden md:flex`
  with no hamburger, so Laws/Calculators/About/Support are unreachable on phones.
- **[M3 · 🔴] Responsive tables** — `PayrollHistory.tsx`, `Payroll.tsx` (2),
  `Dashboard.tsx` detail panels overflow; wrap in `overflow-x-auto` / reflow to
  cards below `sm`.
- **[M4 · 🔴] Responsive calendar** — `Calendar.tsx` shows 3 months side-by-side;
  show one month on mobile, three-up at `md+`.
- **[M5 · 🟡] Grid + padding sweep** — hardcoded `grid-cols-2` forms and
  `grid-cols-3` stat blocks → `grid-cols-1 sm:...`; root `p-8` → `p-4 md:p-8`
  across app pages.
- **[M6 · 🟢] Mobile polish + QA** — touch targets ~44px, `overflow-x-hidden`
  guard, text truncation, and a device-mode pass at 360/390/414px.

## Polish / follow-ups from the #1/#2/#3/#7 build (branch feat/backlog-1237)
These are non-blocking notes from the code review of the four-feature branch.
- **Quick payroll modal auto-approves.** "Approve & Save" does `create()` (draft)
  then immediately `approve()` — a quick run always lands as *approved*, with no
  stop-at-draft option. Decide if that's desired; if not, add a draft-only path.
- **Quick payroll partial-failure edge.** If `create()` succeeds but `approve()`
  then fails, an orphan draft is left and re-clicking creates a second draft
  (no idempotency). Harden if you want it bulletproof.
- **Quick payroll doc nit.** Header comment says it launches from the Workers
  list or the Dashboard card, but it's only wired into `Workers.tsx`.
- **SBC reminder is narrow.** Fires only when `daily_salary` < the zone minimum
  wage (an underpayment flag), not general SBC staleness (salary raised but not
  re-reported — needs data the `/workers/cards` endpoint doesn't expose).
- **SBC reminder ignores `is_imss_registered`.** It can flag a worker who isn't
  IMSS-registered (where SBC re-reporting doesn't apply). Consider gating on it.
- **Timezone off-by-one.** Both new date paths use `toISOString().split('T')[0]`
  on locally-built dates — same latent UTC+ off-by-one that exists elsewhere;
  harmless for Mexico-based users.
- **Dependency audit.** `npm audit` reports pre-existing vulnerabilities
  (unrelated to this branch, no new deps added) — review separately.
- **Commit-boundary nit.** The SBC-badge import line landed in the #1 commit
  rather than #2; cosmetic, both features are complete.

## Recently completed (for context — verify against history)
- **Backlog #1/#2/#3/#7** — built on branch `feat/backlog-1237` (base `af322bc`),
  reviewed, full build + 56 tests green. #1 quick payroll modal, #2 SBC reminder,
  #3 CSV export, #7 Resend `EMAIL_FROM` env support. See polish notes above.
- **#40 `ownsResource` fails closed in production** — done (`791fe22`).
- Round 2 audit hardening: CI workflow (`6dcf9e1`), constant-time admin key
  comparison, config admin gate, payroll status guards, date-aware UMA, 2026
  ISR tables, etc.
- **Homepage — DONE and on `main` (verified 2026-07).** Built by the homepage
  session, web-only, pushed. Commits: `db66ff1` HomePage (hero/stats/features/
  teasers/footer), `5f7eec5` About + Support stubs, `409df80` PublicLayout nav
  links, `0b193c6` App.tsx routes. Plus `6ef8752` Payroll build fix and
  `af322bc` auth-guard `requireAdmin` restore. All 6 security markers intact.
  Follow-ups noted by the build: ~655 kB JS bundle (perf, not blocking);
  worker CTA is "sign in" only (no self-registration yet — see multi-employer
  initiative).

## To confirm from the session widget before deleting
- Exact text/status of any tasks not listed above (the #4–#6, #8–#11, #13–#21,
  #23–#39 range was not individually visible in the transcript).
