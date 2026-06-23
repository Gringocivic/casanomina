/**
 * calculations/payroll.ts
 *
 * The "big picture" calculations that combine the basic building blocks
 * from core.ts into the numbers that actually go on a payslip or a
 * severance settlement.
 *
 * PLAIN LANGUAGE OVERVIEW:
 * - calculatePayroll(): "How much do I pay this person THIS period, and
 *   how much does it cost me in total once I add IMSS/INFONAVIT?"
 * - calculateFiniquito(): "This worker is leaving on good terms (they
 *   resigned, or the job naturally ended) — what do I owe them for
 *   their last days, unused vacation, and partial-year bonus?"
 * - calculateLiquidacion(): "I'm letting this worker go without a legally
 *   recognized justified cause — what is the FULL severance I owe,
 *   including the finiquito items PLUS the legal severance penalty?"
 */

import type {
  RatesConfig,
  WorkerRecord,
  PayPeriod,
  PayrollResult,
  FiniquitoBreakdown,
  LiquidacionBreakdown,
} from "../types";
import {
  calculateSBC,
  calculateIMSSContributions,
  calculateINFONAVIT,
  calculateAguinaldo,
  calculateVacationDays,
  calculatePrimaVacacional,
  calculateYearsOfService,
  daysBetweenInclusive,
  roundCurrency,
} from "./core";

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

/**
 * Calculates a full payroll result for one worker for one pay period.
 *
 * PLAIN LANGUAGE: This is the main "run payroll" function. Give it a
 * worker, a pay period (with how many days they actually worked), and
 * the year's rate config — it returns everything you need: the gross
 * wages, the IMSS/INFONAVIT contributions (split between what the
 * employer pays and what comes out of the worker's pay), the worker's
 * take-home pay, and the employer's total cost.
 *
 * LEGAL BASIS: Combines LSS Art. 27 (SBC), LSS Arts. 71-168 (IMSS
 * branches), and Ley del INFONAVIT Art. 29 (housing fund). See
 * docs/CALCULATIONS.md for the full citation list.
 *
 * @param worker - The worker's employment record.
 * @param period - The pay period being calculated, including days worked.
 * @param config - The rates configuration for the relevant year.
 * @returns A full PayrollResult with gross pay, deductions, net pay,
 *   and total employer cost.
 */
export function calculatePayroll(
  worker: WorkerRecord,
  period: PayPeriod,
  config: RatesConfig
): PayrollResult {
  // Step 1: Gross wages = daily salary x days worked.
  const grossWages = roundCurrency(worker.daily_salary * period.days_worked);

  // Step 2: Calculate the SBC (the slightly-higher number used only for
  // IMSS/INFONAVIT math, not for the worker's actual pay).
  const sbc = calculateSBC(worker.daily_salary, config);

  // Step 3: Calculate IMSS contributions based on the SBC.
  // NOTE: IMSS contributions are normally calculated per full
  // contribution period (commonly bi-weekly). Here we apply the daily
  // SBC rate proportionally to the days worked in this period for
  // simplicity; production systems should align this with IMSS's
  // official bimestral/bisemanal billing cycle.
  const dailyImss = calculateIMSSContributions(sbc, config);
  const periodFactor = period.days_worked;

  const imssForPeriod = {
    sbc: dailyImss.sbc,
    branches: scaleImssBranches(dailyImss.branches, periodFactor),
    total_employer: roundCurrency(dailyImss.total_employer * periodFactor),
    total_worker: roundCurrency(dailyImss.total_worker * periodFactor),
    total: roundCurrency(dailyImss.total * periodFactor),
  };

  // Step 4: Calculate INFONAVIT (employer-only), also scaled to the period.
  const dailyInfonavit = calculateINFONAVIT(sbc, config);
  const infonavitForPeriod = roundCurrency(dailyInfonavit * periodFactor);

  // Step 5: The worker's take-home pay is their gross wages minus their
  // share of IMSS contributions.
  const totalDeductions = imssForPeriod.total_worker;
  const netPay = roundCurrency(grossWages - totalDeductions);

  // Step 6: The employer's total cost is the gross wages PLUS the
  // employer's IMSS share PLUS INFONAVIT. (The worker's IMSS share is
  // already included in gross wages — it's withheld from the worker,
  // not paid extra by the employer.)
  const employerTotalCost = roundCurrency(grossWages + imssForPeriod.total_employer + infonavitForPeriod);

  return {
    worker_id: worker.id,
    period,
    config_id: config.config_id,
    gross_wages: grossWages,
    imss: imssForPeriod,
    infonavit_employer_contribution: infonavitForPeriod,
    total_deductions: totalDeductions,
    net_pay: netPay,
    employer_total_cost: employerTotalCost,
  };
}

/**
 * Helper: scales every branch's employer/worker amounts by a factor
 * (e.g. number of days), rounding each to 2 decimals.
 */
function scaleImssBranches(
  branches: ReturnType<typeof calculateIMSSContributions>["branches"],
  factor: number
): ReturnType<typeof calculateIMSSContributions>["branches"] {
  const scaled = {} as ReturnType<typeof calculateIMSSContributions>["branches"];
  for (const key of Object.keys(branches) as Array<keyof typeof branches>) {
    scaled[key] = {
      employer: roundCurrency(branches[key].employer * factor),
      worker: roundCurrency(branches[key].worker * factor),
    };
  }
  return scaled;
}

// ---------------------------------------------------------------------------
// Finiquito (settlement for voluntary resignation / justified termination)
// ---------------------------------------------------------------------------

/**
 * Calculates the "finiquito" — the final settlement owed to a worker
 * who is leaving WITHOUT severance pay being owed (e.g. they resigned
 * voluntarily, or there was a legally justified cause for dismissal
 * under LFT Art. 47).
 *
 * PLAIN LANGUAGE: Even when no severance is owed, the employer must
 * still pay out everything the worker has already EARNED but not yet
 * received: any outstanding wages, a proportional Christmas bonus
 * (aguinaldo) for the part of the year worked, and proportional unused
 * vacation days plus their vacation premium.
 *
 * LEGAL BASIS:
 *  - Proportional aguinaldo: LFT Art. 87
 *  - Proportional vacation pay: LFT Arts. 76, 79 (vacation cannot be
 *    "bought out" while employed, but unused accrued vacation must be
 *    paid out upon termination)
 *  - Prima vacacional on that vacation pay: LFT Art. 80
 *
 * @param worker - The worker's employment record.
 * @param terminationDate - ISO date the employment ends, e.g. "2026-06-15".
 * @param config - The rates configuration for the relevant year.
 * @returns An itemized FiniquitoBreakdown.
 */
export function calculateFiniquito(
  worker: WorkerRecord,
  terminationDate: Date,
  config: RatesConfig
): FiniquitoBreakdown {
  const terminationDateStr = terminationDate.toISOString().split("T")[0];

  // --- Outstanding wages ---
  // NOTE: This simplified version assumes 0 pending wages, since actual
  // pending wages depend on payroll records the calculator does not have
  // access to (it's a pure function with no DB access). The API layer
  // should populate `pending_wages` from the worker's payment history
  // before persisting the finiquito record, or pass it in via a richer
  // worker/payroll context object in a future version.
  const pendingWages = 0;

  // --- Proportional aguinaldo ---
  // How many days has the worker worked THIS calendar year, up to the
  // termination date?
  const yearStart = `${terminationDate.getFullYear()}-01-01`;
  const daysWorkedThisYear = daysBetweenInclusive(yearStart, terminationDateStr);
  const proportionalAguinaldo = calculateAguinaldo(worker.daily_salary, daysWorkedThisYear, config);

  // --- Proportional vacation ---
  // Years of service determine how many vacation days the worker has
  // earned for their CURRENT (incomplete) year of service. We calculate
  // the days owed for the most recently completed year, then prorate
  // for the fraction of the new year worked so far.
  const yearsOfService = calculateYearsOfService(worker.start_date, terminationDateStr);
  const vacationDaysForCurrentCycle = calculateVacationDays(yearsOfService + 1, config);

  // Fraction of the current service-year that has elapsed.
  const anniversaryThisCycle = getAnniversaryDate(worker.start_date, yearsOfService, terminationDateStr);
  const daysIntoCurrentCycle = daysBetweenInclusive(
    anniversaryThisCycle,
    terminationDateStr
  );
  const fractionOfYear = Math.min(1, daysIntoCurrentCycle / 365);
  const proportionalVacationDays = vacationDaysForCurrentCycle * fractionOfYear;

  const proportionalVacationPay = roundCurrency(worker.daily_salary * proportionalVacationDays);
  const proportionalPrimaVacacional = calculatePrimaVacacional(
    worker.daily_salary,
    proportionalVacationDays,
    config
  );

  const total = roundCurrency(
    pendingWages + proportionalAguinaldo + proportionalVacationPay + proportionalPrimaVacacional
  );

  return {
    worker_id: worker.id,
    termination_date: terminationDateStr,
    config_id: config.config_id,
    pending_wages: pendingWages,
    proportional_aguinaldo: proportionalAguinaldo,
    proportional_vacation: proportionalVacationPay,
    proportional_prima_vacacional: proportionalPrimaVacacional,
    total,
  };
}

// ---------------------------------------------------------------------------
// Liquidacion (severance for unjustified dismissal)
// ---------------------------------------------------------------------------

/**
 * Calculates the "liquidacion" — the full severance package owed when an
 * employer dismisses a worker WITHOUT a legally justified cause.
 *
 * PLAIN LANGUAGE: This includes everything from the finiquito (unpaid
 * wages, proportional bonus, proportional vacation) PLUS three
 * additional legal penalties for letting someone go without cause:
 *  1. Three months of pay (the "constitutional indemnity")
 *  2. 20 extra days of pay for each year worked
 *  3. A smaller "seniority bonus" (prima de antiguedad) of 12 days per
 *     year worked, capped at twice the minimum wage
 *
 * LEGAL BASIS:
 *  - 3 months' indemnity: LFT Art. 50, fraccion III
 *  - 20 days per year of service: LFT Art. 50, fraccion II (this applies
 *    when the worker has more than 1 year of service; for less than 1
 *    year it is generally not owed, but this calculator includes it
 *    proportionally for transparency — consult a labor attorney for
 *    edge cases)
 *  - Prima de antiguedad (12 days/year, capped): LFT Art. 162
 *
 * @param worker - The worker's employment record.
 * @param terminationDate - ISO date the employment ends, e.g. "2026-06-15".
 * @param config - The rates configuration for the relevant year.
 * @returns An itemized LiquidacionBreakdown (finiquito items + severance items).
 */
export function calculateLiquidacion(
  worker: WorkerRecord,
  terminationDate: Date,
  config: RatesConfig
): LiquidacionBreakdown {
  const finiquito = calculateFiniquito(worker, terminationDate, config);
  const terminationDateStr = finiquito.termination_date;

  const yearsOfService = calculateYearsOfService(worker.start_date, terminationDateStr);
  // For the severance calculations, partial years count proportionally.
  const exactYearsOfService = getExactYearsOfService(worker.start_date, terminationDateStr);

  // --- 3 months' constitutional indemnity (LFT Art. 50-III) ---
  const monthlyEquivalent = worker.daily_salary * 30; // standard 30-day month convention
  const constitutionalIndemnity = roundCurrency(
    monthlyEquivalent * config.liquidacion_constitutional_indemnity_months
  );

  // --- 20 days per year of service (LFT Art. 50-II) ---
  const twentyDaysPerYear = roundCurrency(
    worker.daily_salary * config.liquidacion_seniority_premium_days_per_year * exactYearsOfService
  );

  // --- Prima de antiguedad (LFT Art. 162) ---
  // 12 days of salary per year of service, but the DAILY RATE used for
  // this calculation is capped at twice the general minimum daily wage
  // if the worker's actual salary exceeds that cap.
  const seniorityCapDailyRate = Math.min(
    worker.daily_salary,
    config.minimum_daily_wage_general * config.seniority_premium_cap_multiplier_of_min_wage
  );
  const seniorityPremium = roundCurrency(
    seniorityCapDailyRate * config.seniority_premium_days_per_year * exactYearsOfService
  );

  const total = roundCurrency(
    finiquito.total + constitutionalIndemnity + twentyDaysPerYear + seniorityPremium
  );

  return {
    ...finiquito,
    constitutional_indemnity: constitutionalIndemnity,
    twenty_days_per_year: twentyDaysPerYear,
    seniority_premium: seniorityPremium,
    total,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Finds the date of the worker's most recent "service anniversary" —
 * the start of their current (possibly incomplete) year of service.
 *
 * Example: if a worker started on 2023-06-01 and today is 2026-08-15,
 * their completed years of service is 3 (as of 2026-06-01), so this
 * returns "2026-06-01" — the anniversary that begins their 4th year.
 */
function getAnniversaryDate(startDate: string, completedYears: number, asOfDate: string): string {
  const start = new Date(startDate);
  const anniversary = new Date(start.getFullYear() + completedYears, start.getMonth(), start.getDate());
  return anniversary.toISOString().split("T")[0];
}

/**
 * Calculates years of service as a DECIMAL (e.g. 2.5 years), used for
 * proportionally calculating severance amounts for partial years.
 */
function getExactYearsOfService(startDate: string, asOfDate: string): number {
  const start = new Date(startDate);
  const asOf = new Date(asOfDate);
  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
  const years = (asOf.getTime() - start.getTime()) / msPerYear;
  return Math.max(0, Math.round(years * 100) / 100);
}
