# Contributing to CasaNomina

Thank you for wanting to make this better. CasaNomina exists to help domestic workers in Mexico receive their full legal rights — your contribution, however small, serves that mission.

## Ways to Contribute

### 🐛 Bug Reports
Open a GitHub Issue with:
- What you expected vs. what happened
- The worker scenario (salary, zone, dates) if it's a calculation issue
- Steps to reproduce

For calculation bugs, always cite the legal source you believe is correct (LFT article number, IMSS regulation, CONASAMI announcement).

### 💡 Feature Suggestions
Open a GitHub Discussion, not an Issue. Describe the use case before the solution.

### 📝 Translations
The UI is bilingual (EN/ES). Additional languages are welcome — open a Discussion first so we can coordinate.

Laws & Rights content lives in the `cms_content` database table (seeded via `packages/api/src/db/seed.ts`). Adding a translation means adding new rows with a new `language` code.

### 🔢 Annual Rate Updates
Every January, CONASAMI publishes new minimum wages, INEGI publishes the new UMA, and IMSS may update contribution rates. The update procedure:

1. Create `packages/calculator/src/config/rates.<YEAR>.json` (copy from the previous year's file)
2. Update every numeric field with the new official values — cite your source in comments
3. Add the new year's mandatory holidays (dates shift with the "observed Monday" system)
4. Update the test in `tests/core.test.ts` that verifies minimum wage values
5. Verify all 38 tests still pass: `npm test`
6. Open a PR with links to the official DOF publications as evidence

See `docs/CALCULATIONS.md` for the full list of values that change annually.

### 💻 Code PRs
- Fork the repo, create a feature branch
- Run `npm test` before opening a PR — PRs that break tests won't be merged
- All new calculation logic must have corresponding tests
- New calculation functions must accept a `config: RatesConfig` parameter — no hardcoded legal numbers in `.ts` files
- All monetary values must flow through `roundCurrency()` before storage or display
- Keep comments plain-language; this codebase is read by non-engineers verifying the math

## Coding Standards
- TypeScript strict mode — no `any` without a comment explaining why
- Functions should be pure where possible (no side effects, no DB calls in `packages/calculator`)
- JSDoc on every calculation function with the legal article as `@see`
- Commits: `feat:`, `fix:`, `rates:`, `docs:`, `test:` prefixes

## Questions?
Open a GitHub Discussion or email hello@casanomina.org.
