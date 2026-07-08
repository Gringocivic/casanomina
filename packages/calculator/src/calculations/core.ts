/**
 * calculations/core.ts
 *
 * The basic building-block calculations. These are the small, pure formulas
 * that the bigger functions (payroll, finiquito, liquidacion) combine.
 *
 * Every function here is "pure": given the same inputs it always returns the
 * same output, and it never reads or writes a database.
 */

import type { RatesConfig, IMSSBreakdown, ISRResult, VacationAccrualEntry } from "../types";

// ---------------------------------------------------------------------------
// SBC — Salario Base de Cotizacion (Contribution Base Salary)
// ---------------------------------------------------------------------------

/**
 * Calculates the SBC from a worker's daily salary.
 *
 * PLAIN LANGUAGE: The SBC is NOT the same as what the worker is paid each day.
 * It is a slightly higher number used ONLY to calculate IMSS and INFONAVIT
 * contributions. It bakes in a daily "share" of the aguinaldo and prima
 * vacacional that the worker will receive later in the year.
 *
 * LEGAL BASIS: Ley del Seguro Social (LSS) Art. 27.
 */
export function calculateSBC(
  dailySalary: number,
  config: RatesConfig,
  yearsOfService?: number,
): number {
  if (yearsOfService != null) {
    // Dynamically compute the integration factor based on seniority.
    // Vacation days grow with years of service (Vacaciones Dignas reform),
    // so the SBC and therefore IMSS/INFONAVIT must reflect that.
    // Workers in their first year use year-1 entitlement (12 days) as a floor.
    const effectiveYear = Math.max(1, Math.ceil(yearsOfService));
    const vacDays = calculateVacationDays(effectiveYear, config);
    const factor = 1 + (config.aguinaldo_minimum_days + vacDays * config.prima_vacacional_minimum_pct) / 365;
    return roundCurrency(dailySalary * factor);
  }
  // Fallback: fixed first-year factor from config (backwards compatible).
  return roundCurrency(dailySalary * config.sbc_integration_factor);
}

// ---------------------------------------------------------------------------
// IMSS contributions
// ---------------------------------------------------------------------------

/**
 * Returns the correct UMA daily value for a given period start date.
 * INEGI updates the UMA every February 1st; January payrolls use the prior year's value.
 * If uma_daily_value_jan_override is set in the config and the period falls in January,
 * the override is used instead of uma_daily_value.
 */
export function resolveUma(config: RatesConfig, periodStartDate?: string): number {
  if (config.uma_daily_value_jan_override && periodStartDate) {
    const month = parseInt(periodStartDate.split("-")[1], 10);
    if (month === 1) return config.uma_daily_value_jan_override;
  }
  return config.uma_daily_value;
}

/**
 * Calculates the IMSS contributions owed by both employer and worker,
 * broken down by insurance branch (ramo).
 *
 * LEGAL BASIS: LSS Arts. 106-107 (E&M), 147 (IV), 168 (RCV), 211 (GPS), 71-74 (RT).
 */
export function calculateIMSSContributions(sbc: number, config: RatesConfig, periodStartDate?: string): IMSSBreakdown {
  const uma = resolveUma(config, periodStartDate);
  const r = config.imss_rates;

  // Enfermedad y Maternidad
  const cuotaFijaEmployer = uma * r.enfermedad_maternidad.cuota_fija_employer_pct_of_uma;
  const threeUma = 3 * uma;
  const excedenteBase = Math.max(0, sbc - threeUma);
  const excedenteEmployer = excedenteBase * r.enfermedad_maternidad.excedente_three_uma_employer_pct;
  const excedenteWorker = excedenteBase * r.enfermedad_maternidad.excedente_three_uma_worker_pct;
  const prestacionesDineroEmployer = sbc * r.enfermedad_maternidad.prestaciones_dinero_employer_pct;
  const prestacionesDineroWorker = sbc * r.enfermedad_maternidad.prestaciones_dinero_worker_pct;
  const gastosMedicosEmployer = sbc * r.enfermedad_maternidad.gastos_medicos_pensionados_employer_pct;
  const gastosMedicosWorker = sbc * r.enfermedad_maternidad.gastos_medicos_pensionados_worker_pct;

  const enfermedadMaternidadEmployer =
    cuotaFijaEmployer + excedenteEmployer + prestacionesDineroEmployer + gastosMedicosEmployer;
  const enfermedadMaternidadWorker = excedenteWorker + prestacionesDineroWorker + gastosMedicosWorker;

  // Invalidez y Vida
  const invalidezVidaEmployer = sbc * r.invalidez_vida.employer_pct;
  const invalidezVidaWorker = sbc * r.invalidez_vida.worker_pct;

  // Retiro
  const retiroEmployer = sbc * r.retiro.employer_pct;
  const retiroWorker = sbc * r.retiro.worker_pct;

  // Cesantia y Vejez
  const cesantiaVejezEmployer = sbc * r.cesantia_vejez.employer_pct;
  const cesantiaVejezWorker = sbc * r.cesantia_vejez.worker_pct;

  // Guarderias y Prestaciones Sociales
  const guarderiasEmployer = sbc * r.guarderias_prestaciones_sociales.employer_pct;
  const guarderiasWorker = sbc * r.guarderias_prestaciones_sociales.worker_pct;

  // Riesgos de Trabajo
  const riesgosTrabajoEmployer = sbc * r.riesgos_trabajo.employer_pct;
  const riesgosTrabajoWorker = sbc * r.riesgos_trabajo.worker_pct;

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
 * LEGAL BASIS: Ley del INFONAVIT Art. 29, fraccion II — employer contributes 5% of SBC.
 */
export function calculateINFONAVIT(sbc: number, config: RatesConfig): number {
  return roundCurrency(sbc * config.infonavit_employer_pct);
}

// ---------------------------------------------------------------------------
// ISR — Impuesto Sobre la Renta (Income Tax)
// ---------------------------------------------------------------------------

/**
 * Calculates the ISR (income tax) withholding for one pay period.
 *
 * PLAIN LANGUAGE: Mexico's income tax is progressive. Lower-income workers
 * get a "Subsidio para el Empleo" that offsets or eliminates their ISR.
 * Many household workers owe some ISR that the employer must withhold and
 * remit to SAT each period.
 *
 * HOW THE MATH WORKS:
 *  1. Monthly income = daily_salary x 30 (standard SAT convention).
 *  2. Apply the ISR monthly tariff (Art. 96 LISR): cuota_fija + marginal_rate x excess.
 *  3. Look up the monthly Subsidio para el Empleo (Art. 113-B LISR).
 *  4. Net monthly ISR = max(0, step2 - step3).
 *  5. Period ISR = net monthly ISR x (days_worked / 30).
 *
 * LEGAL BASIS: LISR Art. 96 (withholding), Art. 113-B (subsidy), Anexo 8 RMF.
 */
export function calculateISR(
  dailySalary: number,
  daysWorked: number,
  config: RatesConfig
): ISRResult {
  const tariff = config.isr_monthly_tariff;
  const subsidy = config.isr_employment_subsidy_monthly;

  // If the config has no ISR tables (old configs), return zero withholding.
  if (!tariff || !subsidy) {
    return {
      monthly_income_equivalent: 0,
      monthly_isr_gross: 0,
      monthly_employment_subsidy: 0,
      monthly_isr_net: 0,
      period_isr_withholding: 0,
    };
  }

  // Step 1: Monthly income equivalent (30-day convention used by SAT).
  const monthlyIncome = roundCurrency(dailySalary * 30);

  // Step 2: Apply the ISR monthly tariff table.
  const bracket = tariff.find(
    (b) => monthlyIncome >= b.lower_limit && (b.upper_limit === null || monthlyIncome <= b.upper_limit)
  );
  const rawMonthlyISR = bracket
    ? bracket.fixed_tax + (monthlyIncome - bracket.lower_limit) * bracket.rate
    : 0;

  // Step 3: Subsidio para el Empleo.
  const subsidyBracket = subsidy.find(
    (b) => monthlyIncome >= b.lower_limit && (b.upper_limit === null || monthlyIncome <= b.upper_limit)
  );
  const monthlySubsidy = subsidyBracket?.subsidy ?? 0;

  // Step 4: Net ISR cannot be negative.
  const netMonthlyISR = Math.max(0, rawMonthlyISR - monthlySubsidy);

  // Step 5: Prorate to the period by days_worked (same convention as IMSS).
  const periodISR = roundCurrency((netMonthlyISR / 30) * daysWorked);

  return {
    monthly_income_equivalent: monthlyIncome,
    monthly_isr_gross: roundCurrency(rawMonthlyISR),
    monthly_employment_subsidy: roundCurrency(monthlySubsidy),
    monthly_isr_net: roundCurrency(netMonthlyISR),
    period_isr_withholding: periodISR,
  };
}

// ---------------------------------------------------------------------------
// Vacation days
// ---------------------------------------------------------------------------

/**
 * Calculates how many paid vacation days a worker has earned based on
 * their years of service.
 *
 * LEGAL BASIS: LFT Art. 76 (Vacaciones Dignas, effective Jan 1, 2023).
 */
export function calculateVacationDays(yearsOfService: number, config: RatesConfig): number {
  if (yearsOfService < 1) return 0;

  const table = config.vacation_accrual_table;
  const rule = config.vacation_accrual_rule;

  const exactMatch = table.find((entry: VacationAccrualEntry) => entry.year_of_service === yearsOfService);
  if (exactMatch) return exactMatch.days;

  if (yearsOfService < rule.table_max_year) {
    const applicable = table
      .filter((entry: VacationAccrualEntry) => entry.year_of_service <= yearsOfService)
      .sort((a, b) => b.year_of_service - a.year_of_service)[0];
    return applicable ? applicable.days : 0;
  }

  const lastEntry = table[table.length - 1];
  const extraYears = yearsOfService - rule.table_max_year;
  const extraSteps = Math.ceil(extraYears / rule.extrapolation_step_years);
  return lastEntry.days + extraSteps * rule.extrapolation_step_days;
}

// ---------------------------------------------------------------------------
// Prima Vacacional
// ---------------------------------------------------------------------------

/**
 * Calculates the Prima Vacacional (vacation premium) for a given number
 * of vacation days.
 *
 * LEGAL BASIS: LFT Art. 80 — minimum 25% of the salary for vacation days.
 */
export function calculatePrimaVacacional(
  dailySalary: number,
  vacationDays: number,
  config: RatesConfig
): number {
  return roundCurrency(dailySalary * vacationDays * config.prima_vacacional_minimum_pct);
}

// ---------------------------------------------------------------------------
// Aguinaldo
// ---------------------------------------------------------------------------

/**
 * Calculates the Aguinaldo (Christmas bonus), prorated for days worked
 * in the calendar year.
 *
 * LEGAL BASIS: LFT Art. 87 — minimum 15 days of salary, payable by Dec 20,
 * prorated for partial years of service.
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
 * Rounds a peso amount to 2 decimal places.
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculates a worker's completed years of service as of a given date.
 * Only counts full, completed years (e.g. 11 months = 0 years).
 */
export function calculateYearsOfService(startDate: string, asOfDate: string): number {
  const start = new Date(startDate);
  const asOf = new Date(asOfDate);

  let years = asOf.getFullYear() - start.getFullYear();
  const anniversaryThisYear = new Date(asOf.getFullYear(), start.getMonth(), start.getDate());
  if (asOf < anniversaryThisYear) years -= 1;

  return Math.max(0, years);
}

/**
 * Calculates the number of days between two dates, inclusive of both endpoints.
 */
export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}
