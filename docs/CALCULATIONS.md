# CasaNomina — Calculation Reference

This document explains every formula in the calculation engine, with the legal source for each, a worked example using 2026 rates, and the annual update procedure.

**All dollar amounts below are in Mexican Pesos (MXN).** All rates are from official 2026 publications unless noted.

---

## 1. Minimum Daily Wage (Salario Mínimo Diario)

**Legal source:** CONASAMI (Comisión Nacional de Salarios Mínimos) decree, effective January 1, 2026.  
**Publication:** Diario Oficial de la Federación (DOF), December 2025.

| Zone | 2025 | 2026 |
|------|------|------|
| General (most of Mexico) | $278.80 | **$315.04** |
| Northern Border Zone (ZLFN) | $419.88 | **$440.87** |

> ⚠️ **Note on the original project spec:** The spec listed the northern border wage as $473.27. The verified 2026 CONASAMI figure is **$440.87**. The config files reflect the correct amount. Always verify against the official CONASAMI announcement (gob.mx/conasami) before each January update.

**Update trigger:** Every year in December, CONASAMI announces the new rates for January 1.

---

## 2. UMA — Unidad de Medida y Actualización

**Legal source:** INEGI, per the Ley para determinar el valor de la UMA, Art. 4. Published in DOF every January, effective February 1.

| Year | Daily | Monthly | Annual |
|------|-------|---------|--------|
| 2025 (Feb–Jan) | $113.14 | $3,439.46 | $41,273.52 |
| 2026 (Feb–Jan) | **$117.31** | $3,566.22 | $42,794.64 |

**Formula:** `UMA_current = UMA_previous × (1 + INPC_December_variation)`  
For 2026: $113.14 × (1 + 0.0369) = $117.31

**Important:** For January of each year, use the *previous* year's UMA value (the new value doesn't take effect until February 1). The config files include `uma_daily_value_jan_*` fields for this transition period.

**Update trigger:** Every January, INEGI announces; update `uma_daily_value` in the new year's config file, and set the `uma_effective_date` to `<YEAR>-02-01`.

---

## 3. SBC — Salario Base de Cotización

**Legal source:** Ley del Seguro Social (LSS) Art. 27. LFT Arts. 84, 86, 87, 80, 76.

The SBC is a *higher* number than the daily salary. It integrates a daily share of the mandatory annual benefits the worker will receive:

```
SBC = daily_salary × integration_factor

integration_factor = 1 + (aguinaldo_days + vacation_days × prima_vacacional_pct) / 365
```

**For a first-year worker (2026 values):**
```
integration_factor = 1 + (15 + 12 × 0.25) / 365
                   = 1 + (15 + 3) / 365
                   = 1 + 18 / 365
                   = 1 + 0.04932
                   = 1.04932 ≈ 1.0493
```

**Example:** Worker earns $350/day
```
SBC = $350 × 1.0493 = $367.26
```

**For workers with more than 1 year of service**, the integration factor changes because vacation days increase. The calculator recomputes a worker-specific factor using their actual vacation entitlement rather than the default 12-day assumption.

**Update trigger:** Changes when vacation days, aguinaldo days, or prima vacacional percentage change via LFT reform (rare — last changed with the 2023 Vacaciones Dignas reform).

---

## 4. IMSS Contributions

**Legal source:** Ley del Seguro Social (LSS), various articles per branch.

IMSS contributions are calculated **daily** on the SBC. Both employer and worker pay separate amounts.

### 4a. Enfermedad y Maternidad (Sickness & Maternity) — LSS Arts. 106-107

| Component | Who pays | Basis | Rate |
|-----------|----------|-------|------|
| Cuota fija | Employer | UMA (flat) | 20.40% of UMA |
| Excedente >3 UMA | Employer | SBC above 3×UMA | 1.10% |
| Excedente >3 UMA | Worker | SBC above 3×UMA | 0.40% |
| Prestaciones en dinero | Employer | SBC | 0.70% |
| Prestaciones en dinero | Worker | SBC | 0.25% |
| Gastos médicos pensionados | Employer | SBC | 1.05% |
| Gastos médicos pensionados | Worker | SBC | 0.375% |

**Example (SBC = $367.26, UMA = $117.31):**
- Cuota fija employer: $117.31 × 0.204 = $23.93
- 3×UMA threshold: $117.31 × 3 = $351.93
- Excedente: $367.26 − $351.93 = $15.33
- Excedente employer: $15.33 × 0.011 = $0.17
- Prestaciones dinero employer: $367.26 × 0.007 = $2.57
- Gastos médicos pensionados employer: $367.26 × 0.0105 = $3.86

### 4b. Invalidez y Vida (Disability & Life) — LSS Art. 147
- Employer: 1.75% of SBC
- Worker: 0.625% of SBC

### 4c. Retiro (Retirement) — LSS Art. 168 (RCV — Retiro)
- Employer: 2.00% of SBC
- Worker: 0% (employer-only)

### 4d. Cesantía y Vejez (Old Age) — LSS Art. 168 (RCV — CV)
- Employer: 3.10% of SBC *(base rate; simplified — see note below)*
- Worker: 1.125% of SBC

> ⚠️ **Simplification note:** The full law uses a 6-bracket progressive table for Cesantía y Vejez where the rate varies by how many times the UMA the SBC represents. The calculator uses the base rate (3.10% employer / 1.125% worker), which is correct for SBCs near the minimum wage. For workers with significantly higher salaries, compute using the full bracket table in LSS Art. 168. A future version of this calculator will implement the full table.

### 4e. Guarderías y Prestaciones Sociales (Daycare) — LSS Art. 211
- Employer: 1.00% of SBC
- Worker: 0% (employer-only)

### 4f. Riesgos de Trabajo (Occupational Risk) — LSS Arts. 71-74
- Employer: depends on risk class. Domestic work = **Clase I** (lowest risk) = 0.54%
- Worker: 0% (employer-only)

**Update trigger:** IMSS rates are set by the LSS (federal law) and change infrequently. The UMA changes annually, which automatically adjusts the cuota fija even when rates stay constant. Monitor the DOF for any LSS amendments.

---

## 5. INFONAVIT

**Legal source:** Ley del INFONAVIT Art. 29, fracción II.

```
INFONAVIT = SBC × 5%
```

Employer-only. Worker does not contribute directly.

**Example:** SBC = $367.26 → INFONAVIT = $367.26 × 0.05 = **$18.36**

---

## 6. Vacation Days (Vacaciones)

**Legal source:** LFT Art. 76, as reformed by DOF decree of December 27, 2022, effective January 1, 2023 ("Vacaciones Dignas").

| Completed Years of Service | Minimum Vacation Days |
|---------------------------|----------------------|
| 1 | **12** (was 6 before 2023) |
| 2 | 14 |
| 3 | 16 |
| 4 | 18 |
| 5 | 20 |
| 6–10 | 22 |
| 11–15 | 24 |
| 16–20 | 26 |
| 21–25 | 28 |
| 26+ | 30, +2 every 5 years |

Workers accrue vacation rights AFTER completing a full year of service. Vacation days **cannot be exchanged for money** while the worker is still employed (LFT Art. 79) — they must be taken.

**Update trigger:** If LFT Art. 76 is reformed, update the `vacation_accrual_table` in the config files.

---

## 7. Prima Vacacional (Vacation Premium)

**Legal source:** LFT Art. 80.

```
prima_vacacional = daily_salary × vacation_days × 25%
```

**Example:** Worker with 1 year of service, $350/day, 12 vacation days:
```
prima_vacacional = $350 × 12 × 0.25 = $1,050
```

---

## 8. Aguinaldo (Christmas Bonus)

**Legal source:** LFT Art. 87. Must be paid **by December 20th**.

```
aguinaldo = daily_salary × 15 × (days_worked_in_year / 365)
```

**Full year (365 days):** `$350 × 15 × 1.0 = $5,250`
**Half year (182 days):** `$350 × 15 × (182/365) = $2,614.52`

---

## 9. Finiquito (Voluntary Resignation / Justified Termination)

**Legal source:** LFT Arts. 47 (justified cause), 53 (termination causes), 76, 79, 80, 87.

Components:
1. **Pending wages:** any salary owed up to the last day worked
2. **Proportional aguinaldo:** `daily_salary × 15 × (days_worked_in_current_year / 365)`
3. **Proportional vacation pay:** `daily_salary × vacation_days_for_current_cycle × (fraction_of_cycle_elapsed)`
4. **Prima vacacional on the above:** `proportional_vacation_pay × 25%`

No severance indemnity is owed on voluntary resignation or justified termination.

---

## 10. Liquidación (Unjustified Dismissal)

**Legal source:** LFT Arts. 49, 50-II, 50-III, 162.

All finiquito components, PLUS:

1. **Constitutional indemnity (3 months):** `daily_salary × 30 × 3`  
   Legal source: LFT Art. 50, fracción III

2. **20 days per year of service:** `daily_salary × 20 × exact_years_of_service`  
   Legal source: LFT Art. 50, fracción II

3. **Prima de antigüedad (seniority premium):** 12 days per year of service, but the daily rate is capped at twice the general minimum daily wage if the worker's salary exceeds that.  
   Legal source: LFT Art. 162  
   `seniority_premium = min(daily_salary, min_wage × 2) × 12 × years_of_service`

**Example:** Worker earns $350/day, started Jan 15, 2024, terminated June 15, 2026 (~2.41 years):
- 3 months indemnity: $350 × 30 × 3 = **$31,500**
- 20 days/year: $350 × 20 × 2.41 = **$16,870**
- Prima de antigüedad: $350 × 12 × 2.41 = **$10,122** *(daily salary is below 2× min wage ($630), so no cap applies)*

---

## Annual Update Procedure

Each January, follow this checklist:

1. **December:** Watch for CONASAMI announcement of new minimum wages (usually the first week of December). Update `minimum_daily_wage_general` and `minimum_daily_wage_northern_border`.

2. **Early January:** INEGI announces the new UMA (effective February 1). Update `uma_daily_value` and `uma_effective_date` in the new year's config. Set `uma_daily_value_jan_<YEAR>` to carry the transition period.

3. **January:** Check for any IMSS rate changes via DOF. Update the `imss_rates` section if needed.

4. **December/January:** Update `mandatory_holidays_<YEAR>` with the correct observed dates (the first Monday of February, third Monday of March, third Monday of November, shift each year).

5. Create a new config file: `packages/calculator/src/config/rates.<YEAR>.json`

6. Update the test in `tests/core.test.ts` for the new minimum wage.

7. Run `npm test` — all 38 tests must pass.

8. `POST /api/config` with the new config and `make_active: true`.

9. Open a PR with links to the official DOF announcements as evidence for every changed value.

---

*Last updated: June 2026. Sources: DOF, CONASAMI, INEGI, IMSS, Ley Federal del Trabajo (LFT), Ley del Seguro Social (LSS).*
