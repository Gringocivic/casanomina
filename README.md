<div align="center">

# 🏠 CasaNomina

**Open-source household payroll & compliance for domestic workers in Mexico**

[![License: MIT](https://img.shields.io/badge/License-MIT-terracotta.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-38%20passing-sage)](packages/calculator/tests)
[![Open Collective](https://img.shields.io/badge/Support-Open%20Collective-blue)](https://opencollective.com/casanomina)

English | [Español](README.es.md)

</div>

---

## Why CasaNomina?

Hundreds of thousands of expatriates and Mexicans employ domestic workers — housekeepers, nannies, cooks, drivers, gardeners, caregivers — but navigating Mexico's labor law (LFT Chapter XIII) is genuinely complex. Minimum wages, IMSS registration, aguinaldo, vacation accrual, finiquito/liquidación calculations, mandatory holidays... small mistakes create serious legal exposure, and more importantly, they shortchange workers who deserve their full legal protections.

CasaNomina makes it easy to do the right thing:

- ✅ **Calculates everything correctly** using official 2026 rates (CONASAMI, IMSS, UMA)
- ✅ **Generates payslips and contracts** as PDFs ready to sign or share
- ✅ **Tracks every calculation** with a versioned config audit trail — old records are always reproducible
- ✅ **Bilingual (EN/ES)** — for employers who don't speak Spanish fluently
- ✅ **Workers-first** — the Laws & Rights screen explains every obligation in plain language

---

## Screenshots

> _[Screenshots coming after v0.1 launch — PRs welcome!]_

---

## Quick Start (Local)

**Requirements:** Node.js ≥ 20, Docker Desktop

```bash
git clone https://github.com/casanomina/casanomina.git
cd casanomina

# Start the database, API, and frontend:
npm run dev

# In a second terminal, seed the database (2025/2026 rates + bilingual content):
cd packages/api && npm run db:migrate && npm run db:seed
```

Open [http://localhost:5173](http://localhost:5173) — done. No API keys needed for local dev.

---

## Monorepo Structure

```
casanomina/
├── packages/
│   ├── calculator/        # Pure TypeScript calculation engine (npm-publishable)
│   │   ├── src/config/    # rates.2025.json, rates.2026.json — ALL legal numbers live here
│   │   ├── src/types/     # TypeScript types (RatesConfig, WorkerRecord, etc.)
│   │   ├── src/calculations/ # core.ts + payroll.ts — pure functions, no DB access
│   │   └── tests/         # 38 Vitest tests using verified legal values
│   │
│   ├── api/               # Fastify REST API (Node.js)
│   │   └── src/
│   │       ├── db/        # Drizzle ORM schema + seed with bilingual CMS content
│   │       └── routes/    # config, workers, payroll, calculate, cms, documents, holidays
│   │
│   └── web/               # React + Vite frontend
│       └── src/
│           ├── pages/     # Dashboard, WorkerProfile, Payroll, Calendar, LawsAndRights, Calculators
│           ├── pdf/       # PayslipDocument.tsx, ContractDocument.tsx (React-PDF)
│           └── hooks/     # useLanguage (EN/ES), useApi
│
├── docker-compose.yml     # PostgreSQL + API + Web for local dev
└── docs/CALCULATIONS.md   # Full formula documentation with legal citations
```

---

## The Configuration Architecture

**This is the most important design decision in CasaNomina.**

Every legal calculation parameter — minimum wages, IMSS rates, UMA values, vacation accrual — lives in versioned JSON files (`packages/calculator/src/config/rates.2026.json`), not in application code. Every function takes a `config` parameter.

**When January comes and CONASAMI publishes new rates:**
1. Create `rates.2027.json` with the new values
2. `POST /api/config` to insert it into the database
3. Set `make_active: true`

Zero code changes. All past payroll records automatically reference their original config via `config_id`, so the audit trail is unbroken forever.

See [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md) for the full formula reference.

---

## Running Tests

```bash
cd packages/calculator
npm test
# → 38 tests passing
```

Tests use known legal values — e.g., verifying that a first-year worker gets exactly 12 vacation days (not 6 — the pre-2023 amount), that the UMA-based IMSS cuota fija is calculated correctly, and that liquidación constitutional indemnity equals exactly 3 months' pay.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In brief:

- Bug reports → GitHub Issues
- Feature ideas → GitHub Discussions
- PRs → fork, branch, test, PR against `main`
- Annual rate updates → update `rates.<year>.json` + a test
- Translations → PRs to `docs/` and `cms_content` seed data

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

**MVP (current):** Core calculation engine, payroll runs, payslip and contract PDF generation, bilingual Laws & Rights (CMS-driven), local Docker deployment.

**v2:** Hosted SaaS option, IMSS API integration (automatic registration), WhatsApp payment reminders, CFDI payslip generation.

---

## Support the Project

CasaNomina is free and open-source. If it helps you pay your workers correctly, please consider sponsoring development:

👉 **[opencollective.com/casanomina](https://opencollective.com/casanomina)**

Funds go toward: maintaining annual rate updates, security audits, translations, and developer time.

---

## Legal Disclaimer

CasaNomina calculates estimates based on official published rates. It is not a substitute for advice from a licensed Mexican labor attorney (abogado laboralista). Always verify compliance for your specific situation.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute. Worker dignity is non-negotiable; the code is.
