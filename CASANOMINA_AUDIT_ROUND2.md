# CasaNomina — Technical Audit (Round 2, post-fixes)

**Date:** 2026-07-08 · **Method:** Fresh static review of `packages/api`, `packages/calculator`, `packages/web`; calculator recompiled from current `src/` and executed against the standard scenarios; test suite run.

**Headline:** Most of the previous round's findings are fixed and verified. The two Critical items (unauthenticated global-config write; stale ISR subsidy) are resolved, the test suite is green (56 passing, up from 37/1-failing), and rate limiting plus several correctness bugs are addressed. **No open Critical issues remain.** Two Important correctness items from last time are still open, and a handful of minor items persist.

---

## ✅ Verified Fixed Since Last Audit
- **Unauthenticated config write (was Critical):** `POST /api/config` now requires `requireAdmin` (static `ADMIN_API_KEY`, 401 on mismatch, 503 if unset) and validates `config_data` against a real `RatesConfigSchema` with `safeParse`→400. `config.ts:107–114`, `auth-guard.ts:120–137`.
- **ISR over-withholding from minimum-wage workers (was Critical):** subsidy replaced with the 2026 flat credit ($535.65 for monthly income ≤ $11,492.66, else $0). Re-running the minimum-wage worker: monthly subsidy `0 → 535.65`, weekly ISR **$142.24 → $35.11**. `rates.2026.json` (`isr_employment_subsidy_monthly`).
- **Missing tests (was Critical):** `calculateISR` now has tests; suite is **56 passing / 0 failing**. The previously-red IMSS period-rounding test is green.
- **Fail-open auth (was Important):** `requireEmployer`/`requireWorker` now return **503 in production** when `CLERK_SECRET_KEY` is unset. `auth-guard.ts:30–38, 63–69`.
- **Inverted payslip ownership check (was Important):** `GET /documents/payslip/:id` now returns 404 on missing worker instead of skipping the check. `documents.ts:120–128`.
- **Finiquito aguinaldo from Jan-1 (was Important):** now uses `max(yearStart, start_date)`. `calculator/payroll.ts:161`.
- **Feb-29 anniversary edge (was Important):** hire day clamped to month length before building the anniversary. `workers.ts:117–121`, `documents.ts:45–51`.
- **Divergent vacation table in payslip (was Important):** `pdfRenderer.vacationDaysEarned` now delegates to `calculateVacationDays`. Web screens are consistent too — `Payroll.tsx`'s `Math.ceil(years)` is a no-op because `calculateYearsOfService` returns an integer. `pdfRenderer.ts:78–79`.
- **Rate limiting (was a Suggestion):** global 200/min in production plus per-route limits — PDF endpoints 10/min, payroll preview 30/min. `server.ts:84–96`, `documents.ts`, `payroll.ts:34`.
- **`payroll_day` overloading (was a Suggestion):** split into `payroll_dow` (0–6) and `payroll_dom` (1–28), validated by Zod and used correctly in `Calendar.tsx`. This also removes the old `payroll_day=0 → last-day-of-previous-month` edge.

---

## 🔴 Critical
None open.

---

## 🟡 Important (still open from prior audit)

### 1. IMSS/INFONAVIT scaled by `days_worked`, not insured calendar days
**File:** `packages/calculator/src/calculations/payroll.ts:67` (`periodFactor = period.days_worked`).
Unchanged. Contributions (including the per-UMA *cuota fija*) are still multiplied by days *worked* rather than the days the worker is *insured* (≈7/week). For the weekly reference worker the code charges IMSS on 6 days (`employer 403.80`) versus ~7 days (~₱471) — a systematic ~1/7 under-contribution that becomes an IMSS liability and under-withholds the worker's share.
**Fix:** Drive the IMSS/INFONAVIT period factor from insured calendar days in the period (or the registered days), decoupled from `days_worked`.

### 2. Payruns can be approved/paid repeatedly and status can regress
**File:** `packages/api/src/routes/payroll.ts:164–182 (approve), 185–210 (mark-paid)`.
Unchanged. Both updates key only on `payrollRuns.id` with no precondition on current status. A run can be approved twice, marked paid without approval, and — most concerning — an already-**paid** run can be pushed back to **approved**, re-stamping timestamps.
**Fix:** Add the expected prior state to the `where` (`status='draft'` for approve, `status='approved'` for mark-paid) and return **409** when no row updates; consider a status enum/state machine.

---

## 🟢 Suggestions

- **January-2026 UMA is never applied.** `core.ts:57` always uses `uma_daily_value` (117.31, the Feb-2026 value); `uma_daily_value_jan_2026` (113.14) remains dead config. The subsidy comment calls the January delta immaterial, but the UMA also sets the IMSS *cuota fija* and the 3-UMA excedente threshold for January payrolls. Either apply date-aware UMA selection or remove the field.
- **`ceav_schedule` is still dead config** — defined in `rates.2026.json`/`types` but read by no calculation. Wire it up or delete it to avoid implying a domestic-worker phased scheme that isn't used.
- **Verify the 2026 subsidy figure against the DOF.** The `$535.65` / `15.02% × UMA` value is attributed to "DOF 31-Dec-2025" in a code comment; confirm against the published table once available (structure is correct regardless).
- **ISR base still excludes premium pay** and uses `daily × 30` with a `days_worked/30` proration (`core.ts:188, 208`). Holiday/rest premiums added to gross aren't taxed, and the 30-vs-actual-days mismatch slightly under-withholds for short months. Low impact; document or refine.
- **Admin key comparison isn't constant-time** (`auth-guard.ts:131`, `token !== adminKey`). Low risk for a random key, but `crypto.timingSafeEqual` is cheap insurance.
- **Remove the no-op `Math.ceil`** in `Payroll.tsx:178` for clarity — it currently misleads readers into thinking Payroll rounds differently from the other screens.
- **Commit the working-tree fix** restoring `export default plugin` in `workers.ts` (currently uncommitted; without it the file won't compile).
- **Migration robustness was heavily churned** (several `0006_split_payroll_day` fix commits, including a `DO`-block that crashed startup). Add a CI step that runs migrations against a clean DB so a broken migration can't reach production again.
- **`ownsResource` still returns `true` when `CLERK_SECRET_KEY` is unset** (`auth-guard.ts:101`). Harmless today because `requireEmployer` 503s first in production, but for defense-in-depth make it fail closed in production too.

---

## Overall Assessment

This is a solid round of fixes. Both Critical vulnerabilities are properly closed — the global rate-config endpoint is now admin-gated with schema validation, and the ISR subsidy reflects the current flat-credit model, which I confirmed numerically drops a minimum-wage worker's weekly withholding from ~$142 to ~$35. Equally important, the test suite is now green and covers ISR, so the class of regression that hid the earlier stale build is much harder to reintroduce. Rate limiting, the fail-closed auth posture, the payslip ownership fix, the Feb-29 and mid-year-hire edge cases, and the `payroll_dow`/`payroll_dom` split are all real improvements. What remains is smaller and well-contained: two correctness bugs on the money path (IMSS charged on worked rather than insured days; payrun status transitions that can double-fire or regress) plus a set of minor config-hygiene and hardening items. I'd fix the two Important items before running real payroll, but the project is now in materially better shape and no longer has a launch-blocking Critical issue.
