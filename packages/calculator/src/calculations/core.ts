/**
 * calculations/core.ts
 *
 * The basic building-block calculations. These are the small formulas
 * that the bigger functions (payroll, finiquito, liquidacion) combine.
 *
 * EVERY function here is "pure": given the same inputs (including the
 * same `config`), it always returns the same output, and it never reads
 * or writes a database. This makes the math easy to test and easy to
 * trust — you can hand this file to an accountant and they can verify
 * every line against the law.
 */

import type { RatesConfig, IMSSBreakdown, VacationAccrualEntry } from "../types";

// ---------------------------------------------------------------------------
// SBC — Salario Base de Cotizacion (Contribution Base Salary)
// ---------------------------------------------------------------------------

/**
 * Calculates the SBC (Salario Base de Cotizacion) from a worker's daily salary.
 *
 * PLAIN LANGUAGE: The SBC is NOT the same as what the worker is paid each
 * day. It's a slightly higher number used ONLY to calculate IMSS and
 * INFONAVIT contributions. It's higher because it bakes in a daily
 * "share" of the aguinaldo (Christmas bonus) and prima vacacional
 * (vacation premium) that the worker will receive later in the year.
 *
 * LEGAL BASIS: Ley del Seguro Social (LSS) Art. 27 — the SBC integrates
 * the daily wage plus the proportional part of other recurring benefits
 * (gratificaciones, percepciones, prima vacacional, etc.).
 *
 * @param dailySalary - The worker's agreed daily salary in MXN.
 * @param config - The rates configuration for the relevant year.
 * @returns The SBC in MXN, rounded to 2 decimal places.
 */
export function calculateSBC(dailySalary: number, config: RatesConfig): number {
  const sbc = dailySalary * config.sbc_integration_factor;
  return roundCurrency(sbc);
}

// ---------------------------------------------------------------------------
// IMSS contributions
// ---------------------------------------------------------------------------

/**
 * Calculates the IMSS (Instituto Mexicano del Seguro Social) contributions
 * owed by both employer and worker, broken down by insurance branch.
 *
 * PLAIN LANGUAGE: IMSS is Mexico's public health/social-security system.
 * Both the employer and the worker pay into it every pay period, based
 * on a percentage of the SBC. This function adds up each of the 6
 * "branches" (types of coverage) separately so the payslip can show
 * exactly where the money goes.
 *
 * LEGAL BASIS: Ley del Seguro Social (LSS), various articles per branch:
 *  - Enfermedad y Maternidad: LSS Art. 106-107 (cuota fija + excedente)
 *  - Invalidez y Vida: LSS Art. 147
 *  - Retiro / Cesantia y Vejez (RCV): LSS Art. 168
 *  - Guarderias y Prestaciones Sociales: LSS Art. 211
 *  - Riesgos de Trabajo: LSS Art. 71-74, employer-paid based on risk class
 *
 * @param sbc - The Salario Base de Cotizacion (from calculateSBC()).
 * @param config - The rates configuration for the relevant year.
 * @returns An itemized breakdown of all IMSS contributions.
 */
export function calculateIMSSContributions(sbc: number, config: RatesConfig): IMSSBreakdown {
  const uma = config.uma_daily_value;
  const r = config.imss_rates;

  // --- Enfermedad y Maternidad (Sickness & Maternity) ---
  // "Cuota fija" is a flat amount the EMPLOYER pays, based on the UMA
  // (not the SBC). It does not depend on how much the worker earns.
  const cuotaFijaEmployer = uma * r.enfermedad_maternidad.cuota_fija_employer_pct_of_uma;

  // "Excedente" only applies to the portion of the SBC that is ABOVE
  // 3 times the UMA. Most domestic workers' SBC will be below this
  // threshold, so this is often zero — but we calculate it properly
  // in case a worker is paid well above minimum wage.
  const threeUma = 3 * uma;
  const excedenteBase = Math.max(0, sbc - threeUma);
  const excedenteEmployer = excedenteBase * r.enfermedad_maternidad.excedente_three_uma_employer_pct;
  const excedenteWorker = excedenteBase * r.enfermedad_maternidad.excedente_three_uma_worker_pct;

  // "Prestaciones en dinero" (cash benefits, e.g. paid sick leave) and
  // "Gastos medicos para pensionados" (medical expenses for future
  // pensioners) are both calculated as a simple percentage of the SBC.
  const prestacionesDineroEmployer = sbc * r.enfermedad_maternidad.prestaciones_dinero_employer_pct;
  const prestacionesDineroWorker = sbc * r.enfermedad_maternidad.prestaciones_dinero_worker_pct;
  const gastosMedicosEmployer = sbc * r.enfermedad_maternidad.gastos_medicos_pensionados_employer_pct;
  const gastosMedicosWorker = sbc * r.enfermedad_maternidad.gastos_medicos_pensionados_worker_pct;

  const enfermedadMaternidadEmployer =
    cuotaFijaEmployer + excedenteEmployer + prestacionesDineroEmployer + gastosMedicosEmployer;
  const enfermedadMaternidadWorker = excedenteWorker + prestacionesDineroWorker + gastosMedicosWorker;

  // --- Invalidez y Vida (Disability & Life Insurance) ---
  // Simple percentage of SBC, split between employer and worker.
  const invalidezVidaEmployer = sbc * r.invalidez_vida.employer_pct;
  const invalidezVidaWorker = sbc * r.invalidez_vida.worker_pct;

  // --- Retiro (Retirement) ---
  // Employer-only contribution, percentage of SBC.
  const retiroEmployer = sbc * r.retiro.employer_pct;
  const retiroWorker = sbc * r.retiro.worker_pct; // always 0 under current law

  // --- Cesantia y Vejez (Old Age & Unemployment Insurance) ---
  // Simple percentage of SBC, split between employer and worker.
  // NOTE: The full law uses a progressive scale for higher salaries;
  // this simplified version uses the base rate, which is correct for
  // SBC values at or near the minimum wage (the typical case for
  // domestic workers). See docs/CALCULATIONS.md for details.
  const cesantiaVejezEmployer = sbc * r.cesantia_vejez.employer_pct;
  const cesantiaVejezWorker = sbc * r.cesantia_vejez.worker_pct;

  // --- Guarderias y Prestaciones Sociales (Daycare & Social Benefits) ---
  // Employer-only contribution, percentage of SBC.
  const guarderiasEmployer = sbc * r.guarderias_prestaciones_sociales.employer_pct;
  const guarderiasWorker = sbc * r.guarderias_prestaciones_sociales.worker_pct; // always 0

  // --- Riesgos de Trabajo (Occupational Risk Insurance) ---
  // Employer-only contribution, percentage of SBC, based on the
  // employer's registered risk class. Domestic work = Clase I (lowest risk).
  const riesgosTrabajoEmployer = sbc * r.riesgos_trabajo.employer_pct;
  const riesgosTrabajoWorker = sbc * r.riesgos_trabajo.worker_pct; // always 0

  const branches: IMSSBreakdown["branches"] = {
    enfermedad_maternidad: {
      employer: roundCurrency(enfermedadMaternidadEmployer),
      worker: roundCurrency(enfermedadMaternidadWorker),
    },
    invalidez_vida: {
      employer: roundCurrency(invalidezVidaEmployer),
      worker: roundCurrency(invalidezVidaWorker),
    },
    retiro: {
      employer: roundCurrency(retiroEmployer),
      worker: roundCurrency(retiroWorker),
    },
    cesantia_vejez: {
      employer: roundCurrency(cesantiaVejezEmployer),
      worker: roundCurrency(cesantiaVejezWorker),
    },
    guarderias_prestaciones_sociales: {
      employer: roundCurrency(guarderiasEmployer),
      worker: roundCurrency(guarderiasWorker),
    },
    riesgos_trabajo: {
      employer: roundCurrency(riesgosTrabajoEmployer),
      worker: roundCurrency(riesgosTrabajoWorker),
    },
  };

  const totalEmployer = Object.values(branches).reduce((sum, b) => sum + b.employer, 0);
  const totalWorker = Object.values(branches).reduce((sum, b) => sum + b.worker, 0);

  return {
    sbc: roundCurrency(sbc),
    branches,
    total_employer: roundCurrency(totalEmployer),
    total_worker: roundCurrency(totalWorker),
    total: roundCurrency(totalEmployer + totalWorker),
  };
}

// ---------------------------------------------------------------------------
// INFONAVIT
// ---------------------------------------------------------------------------

/**
 * Calculates the employer's INFONAVIT (housing fund) contribution.
 *
 * PLAIN LANGUAGE: INFONAVIT is a fund that helps workers get mortgages
 * for housing. The employer contributes a percentage of the SBC every
 * period; the worker does not pay into it directly.
 *
 * LEGAL BASIS: Ley del INFONAVIT Art. 29, fraccion II — employer
 * contributes 5% of the SBC.
 *
 * @param sbc - The Salario Base de Cotizacion (from calculateSBC()).
 * @param config - The rates configuration for the relevant year.
 * @returns The employer's INFONAVIT contribution in MXN.
 */
export function calculateINFONAVIT(sbc: number, config: RatesConfig): number {
  return roundCurrency(sbc * config.infonavit_employer_pct);
}

// ---------------------------------------------------------------------------
// Vacation days
// ---------------------------------------------------------------------------

/**
 * Calculates how many paid vacation days a worker has earned based on
 * their years of service.
 *
 * PLAIN LANGUAGE: Mexican law guarantees more vacation days the longer
 * someone works for you. After the 2023 "Vacaciones Dignas" reform,
 * a worker gets 12 days after their 1st year (up from 6 days before
 * the reform), increasing by 2 days each year until reaching 20 days
 * at year 5, then +2 days every 5 years after that.
 *
 * LEGAL BASIS: Ley Federal del Trabajo (LFT) Art. 76, as reformed by
 * the decree published in the Diario Oficial de la Federacion (DOF) on
 * Dec 27, 2022, effective Jan 1, 2023.
 *
 * @param yearsOfService - Completed years of service (e.g. 1 after the
 *   worker's first anniversary, 0 if they haven't reached it yet).
 * @param config - The rates configuration for the relevant year, which
 *   contains the vacation_accrual_table.
 * @returns The number of paid vacation days earned. Returns 0 if the
 *   worker has not yet completed their first year (vacation rights
 *   begin only AFTER 1 full year of service per LFT Art. 76).
 */
export function calculateVacationDays(yearsOfService: number, config: RatesConfig): number {
  if (yearsOfService < 1) {
    return 0;
  }

  const table = config.vacation_accrual_table;
  const rule = config.vacation_accrual_rule;

  // Find an exact match in the table first.
  const exactMatch = table.find((entry: VacationAccrualEntry) => entry.year_of_service === yearsOfService);
  if (exactMatch) {
    return exactMatch.days;
  }

  // If the worker's tenure is within the table's range but didn't match
  // exactly (shouldn't normally happen since the table is dense), use
  // the highest entry at or below their tenure.
  if (yearsOfService < rule.table_max_year) {
    const applicable = table
      .filter((entry: VacationAccrualEntry) => entry.year_of_service <= yearsOfService)
      .sort((a, b) => b.year_of_service - a.year_of_service)[0];
    return applicable ? applicable.days : 0;
  }

  // Beyond the table: take the last table entry's days, then add the
  // extrapolation step for every additional block of years past the
  // table's max year.
  const lastEntry = table[table.length - 1];
  const extraYears = yearsOfService - rule.table_max_year;
  const extraSteps = Math.ceil(extraYears / rule.extrapolation_step_years);
  return lastEntry.days + extraSteps * rule.extrapolation_step_days;
}

// ---------------------------------------------------------------------------
// Prima Vacacional
// ---------------------------------------------------------------------------

/**
 * Calculates the Prima Vacacional (vacation premium) owed for a given
 * number of vacation days.
 *
 * PLAIN LANGUAGE: On top of being PAID during their vacation (which is
 * just their normal salary), workers get an extra bonus — at least 25%
 * of what they'd earn for those vacation days — as a "treat yourself"
 * premium.
 *
 * LEGAL BASIS: Ley Federal del Trabajo (LFT) Art. 80 — vacation premium
 * of no less than 25% of the salary corresponding to the vacation days.
 *
 * @param dailySalary - The worker's agreed daily salary in MXN.
 * @param vacationDays - The number of vacation days being paid out.
 * @param config - The rates configuration (provides the minimum percentage).
 * @returns The prima vacacional amount in MXN.
 */
export function calculatePrimaVacacional(
  dailySalary: number,
  vacationDays: number,
  config: RatesConfig
): number {
  const vacationPay = dailySalary * vacationDays;
  return roundCurrency(vacationPay * config.prima_vacacional_minimum_pct);
}

// ---------------------------------------------------------------------------
// Aguinaldo
// ---------------------------------------------------------------------------

/**
 * Calculates the Aguinaldo (year-end Christmas bonus), prorated for the
 * number of days actually worked in the calendar year.
 *
 * PLAIN LANGUAGE: Every worker in Mexico is legally entitled to an
 * end-of-year bonus equal to at least 15 days of pay. If someone worked
 * the FULL year, they get the full 15 days. If they only worked part of
 * the year (e.g. they started in July, or they're leaving the job), the
 * bonus is calculated proportionally.
 *
 * LEGAL BASIS: Ley Federal del Trabajo (LFT) Art. 87 — annual bonus of
 * at least 15 days of salary, payable before Dec 20, prorated for
 * workers who have not completed a full year of service.
 *
 * @param dailySalary - The worker's agreed daily salary in MXN.
 * @param daysWorkedInYear - How many calendar days the worker was
 *   employed during the relevant year (max 365, or 366 in leap years).
 * @param config - The rates configuration (provides the minimum days).
 * @returns The aguinaldo amount in MXN, proportional to days worked.
 */
export function calculateAguinaldo(
  dailySalary: number,
  daysWorkedInYear: number,
  config: RatesConfig
): number {
  const DAYS_IN_YEAR = 365;
  const cappedDays = Math.min(daysWorkedInYear, DAYS_IN_YEAR);
  const proportionalDays = (config.aguinaldo_minimum_days / DAYS_IN_YEAR) * cappedDays;
  return roundCurrency(dailySalary * proportionalDays);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rounds a peso amount to 2 decimal places, the way money is normally
 * displayed (e.g. 1234.5 -> 1234.50). Used everywhere so we don't end
 * up with floating-point artifacts like 123.40000000000001 in payslips.
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculates a worker's completed years of service as of a given date.
 *
 * PLAIN LANGUAGE: "Years of service" only counts full, completed years.
 * Someone who started 11 months ago has 0 completed years; someone who
 * started exactly 1 year and 2 months ago has 1 completed year.
 *
 * @param startDate - ISO date string the worker started, e.g. "2023-06-01".
 * @param asOfDate - ISO date string to measure from (e.g. today, or a
 *   termination date).
 * @returns The number of completed years of service (can be 0).
 */
export function calculateYearsOfService(startDate: string, asOfDate: string): number {
  const start = new Date(startDate);
  const asOf = new Date(asOfDate);

  let years = asOf.getFullYear() - start.getFullYear();

  // Adjust if we haven't yet reached the anniversary month/day this year.
  const anniversaryThisYear = new Date(asOf.getFullYear(), start.getMonth(), start.getDate());
  if (asOf < anniversaryThisYear) {
    years -= 1;
  }

  return Math.max(0, years);
}

/**
 * Calculates the number of days between two dates (inclusive of both
 * endpoints), used for proportional calculations like aguinaldo.
 *
 * @param startDate - ISO date string, e.g. "2026-01-01".
 * @param endDate - ISO date string, e.g. "2026-12-31".
 * @returns The number of days between the two dates, inclusive.
 */
export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}
