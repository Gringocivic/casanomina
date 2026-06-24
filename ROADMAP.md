# CasaNomina Roadmap

## ✅ MVP (v0.1) — Current
- Versioned rate configuration system (rates.2025.json, rates.2026.json)
- Complete calculation engine: SBC, IMSS, INFONAVIT, ISR withholding (Art. 96 LISR), vacation, aguinaldo, prima vacacional, finiquito, liquidación
- 38 Vitest tests using verified legal values
- Fastify REST API with full CRUD for workers and payroll runs
- Payslip (recibo de nómina) PDF generation with ISR breakdown and payment instructions
- Employment contract (contrato individual) PDF generation
- Bilingual (EN/ES) React frontend: Dashboard, Worker Profile, Payroll, Calendar, Laws & Rights, Calculators
- IMSS registration guided flow on Worker Profile (3-state: unregistered / registering / registered)
- CMS-driven Laws & Rights content (update without code changes)
- Local deployment via Docker Compose (PostgreSQL + API + web)

## 🔜 v0.2 — Next milestone
- [ ] Worker list page with search/filter
- [ ] Payroll history page per worker with PDF download
- [ ] Past payroll runs summary / employer cost dashboard
- [ ] "Remind me" alerts (email/WhatsApp) for aguinaldo deadline (Dec 15) and mandatory holiday triple-pay reminders
- [ ] IMSS calculation with the full progressive SBC bracket table (not just the simplified base rate)
- [ ] Import workers from CSV

## 🗂 Backlog (prioritized)

### B1 — Worker onboarding wizard
Multi-step flow replacing the flat WorkerProfile form for new hires:
  Step 1 — Agree on terms (pay frequency, days per week, hours per day, live-in vs. live-out, daily salary)
            → generates and previews the employment contract before signing
  Step 2 — IMSS registration (the guided flow already built; skip-for-now path required)
  Step 3 — Invite worker to the app (existing invite flow)

Technical notes:
- Needs two new DB fields + migration: `live_in boolean` and `hours_per_day integer`
- Do NOT add hourly_rate as a separate field — derive it from daily_salary / hours_per_day to avoid inconsistency
- Mexico LFT denominates domestic worker salaries as daily rate; hourly is secondary
- IMSS step is async (employer must leave app to register); wizard must allow "skip and come back"
- Reuse existing WorkerProfile fields for Step 1, existing IMSS flow for Step 2, existing invite for Step 3

### B2 — Payment obligations calendar
Show all upcoming payment deadlines color-coded on the Calendar page:
  - Worker payroll: based on pay_frequency + last period end date
  - IMSS contributions: bimestral, due on the 17th of the month after the bimester closes
    (deadlines: Mar 17, May 17, Jul 17, Sep 17, Nov 17, Jan 17)
  - ISR remittance to SAT: monthly via SIPARE, due the 17th of the following month

Technical notes:
- All deadlines are deterministic — no external API needed, can be computed from pay_frequency and start_date
- Calendar page already exists (holiday-only); extend it with payment obligation events
- Tracking whether IMSS was actually paid would require a new `imss_payments` table — scope separately
- Display instructions per event (IDSE for IMSS bimestral, SIPARE for ISR monthly)

### B3 — Smart payroll alerts: holidays & overtime
Insert a "check" step between period entry and payroll preview:
  Holiday detection: cross-reference pay period dates against the holidays API; for each holiday found, ask:
    (a) Worked the holiday → triple pay applies (LFT Art. 75)
    (b) Took the day off (agreed holiday) → counts as a paid day in days_worked
    (c) Did not work, unpaid → subtract from days_worked
  Default: "pay the usual" — no forced interaction for routine runs

  Overtime detection: show alert if days_worked implies hours above agreed schedule
    → Make this opt-in; domestic worker overtime (LFT Art. 67-68) is technically applicable but rarely tracked

Technical notes:
- Triple-pay holiday calculation is NOT yet in the calculator — needs to be added to core.ts
- Overtime requires hours_per_day field (see B1); do B1 first
- "Pay the usual" must be the pre-selected default to avoid friction on routine payroll runs
- Update ISR 2026 tariff tables when DOF publishes them (currently using 2025 values)

### B4 — Worker card with onboarding status & accruals
Replace the plain worker list row with an information-dense card showing:
  Onboarding checklist (derived from existing fields, no new DB needed):
    ✓/✗ CURP entered
    ✓/✗ IMSS registered
    ✓/✗ NSS on file
    ✓/✗ Contract generated
    ✓/✗ App invite sent / claimed
  Last payroll run (date + net pay)
  YTD totals (gross wages, ISR withheld, employer cost) — aggregate query on payroll_runs
  Accruals (computed from start_date, no DB change needed):
    Vacation days earned this service year
    Aguinaldo accrued to date (proportional)
  Absences: days_worked vs. expected from pay schedule (NOT "sick time" — LFT does not give
    domestic workers employer sick days; IMSS covers medical leave)

Technical notes:
- YTD: one GROUP BY query on payroll_runs per worker for current year
- Vacation accrual: calculateVacationDays(yearsOfService, config) already exists; call client-side
- Do not add a sick-time tracking table yet; derive absences from payroll history
- "Seniority" = calculateYearsOfService(start_date, today) — already in calculator

## 💰 Future / Potential Paid Features (SaaS)
- Hosted cloud option (so non-technical users don't need Docker)
- IMSS API integration (automatic worker registration and bi-monthly payment filing)
- Bank integration for direct payroll disbursement
- Accountant portal (view multiple employers' payrolls)
- STPS labor inspection checklist
- CFDI-format payslip output (for SAT compliance, when applicable)

## Not in scope (by design)
- Payroll for formal companies (use Aspel Noi, Contpaqi Nóminas, or similar)
