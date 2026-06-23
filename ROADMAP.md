# CasaNomina Roadmap

## ✅ MVP (v0.1) — Current
- Versioned rate configuration system (rates.2025.json, rates.2026.json)
- Complete calculation engine: SBC, IMSS, INFONAVIT, vacation, aguinaldo, prima vacacional, finiquito, liquidación
- 38 Vitest tests using verified legal values
- Fastify REST API with full CRUD for workers and payroll runs
- Payslip (recibo de nómina) PDF generation via React-PDF
- Employment contract (contrato individual) PDF generation
- Bilingual (EN/ES) React frontend: Dashboard, Worker Profile, Payroll, Calendar, Laws & Rights, Calculators
- CMS-driven Laws & Rights content (update without code changes)
- Local deployment via Docker Compose (PostgreSQL + API + web)

## 🔜 v0.2 — Next milestone
- [ ] Worker list page with search/filter
- [ ] Payroll history page per worker with PDF download
- [ ] Past payroll runs summary / employer cost dashboard
- [ ] "Remind me" alerts (email/WhatsApp) for aguinaldo deadline (Dec 15) and mandatory holiday triple-pay reminders
- [ ] IMSS calculation with the full progressive SBC bracket table (not just the simplified base rate)
- [ ] Import workers from CSV

## 🌱 v1.0 — Stable release
- [ ] Multi-worker dashboard with aggregate cost view
- [ ] Annual obligations calendar (aguinaldo due date, vacation accrual milestones)
- [ ] CFDI-format payslip output (for SAT compliance, when applicable)
- [ ] Drizzle ORM migrations with version history
- [ ] Clerk authentication with multi-employer support
- [ ] Automated rate-update PR bot (opens a PR each January with new config values for review)

## 💰 Future / Potential Paid Features (SaaS)
- Hosted cloud option (so non-technical users don't need Docker)
- IMSS API integration (automatic worker registration and bi-monthly payment filing)
- Bank integration for direct payroll disbursement
- Accountant portal (view multiple employers' payrolls)
- STPS labor inspection checklist

## Not in scope (by design)
- Payroll for formal companies (use Aspel Noi, Contpaqi Nóminas, or similar)
- Tax (ISR) withholding for workers — domestic workers below a salary threshold are typically ISR-exempt; above it, consult an accountant
