/**
 * calculations/payroll.ts
 *
 * The "big picture" calculations that combine the basic building blocks
 * from core.ts into the numbers that actually go on a payslip or a
 * severance settlement.
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
  calculateISR,
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
 * Combines gross wages, IMSS/INFONAVIT contributions, and ISR withholding
 * into a complete PayrollResult.
 *
 * LEGAL BASIS: LSS Art. 27 (SBC), LSS Arts. 71-168 (IMSS branches),
 * Ley del INFONAVIT Art. 29, LISR Art. 96 (ISR withholding).
 */
export function calculatePayroll(
  worker: WorkerRecord,
  period: PayPeriod,
  config: RatesConfig
): PayrollResult {
  // Step 1: Gross wages = daily salary x days worked.
  const grossWages = roundCurrency(worker.daily_salary * period.days_worked);

  // Step 2: SBC (slightly higher number used only for IMSS/INFONAVIT math).
  const sbc = calculateSBC(worker.daily_salary, config);

  // Step 3: IMSS contributions, scaled to the period by days_worked.
  const dailyImss = calculateIMSSContributions(sbc, config);
  const periodFactor = period.days_worked;

  const imssForPeriod = {
    sbc: dailyImss.sbc,
    branches: scaleImssBranches(dailyImss.branches, periodFactor),
    total_employer: roundCurrency(dailyImss.total_employer * periodFactor),
    total_worker: roundCurrency(dailyImss.total_worker * periodFactor),
    total: roundCurrency(dailyImss.total * periodFactor),
  };

  // Step 4: INFONAVIT (employer-only), scaled to the period.
  const dailyInfonavit = calculateINFONAVIT(sbc, config);
  const infonavitForPeriod = roundCurrency(dailyInfonavit * periodFactor);

  // Step 5: ISR withholding — withheld from the worker, remitted to SAT.
  // Based on the daily salary projected to a monthly equivalent (x 30),
  // then prorated back to the period by days_worked.
  const isrResult = calculateISR(worker.daily_salary, period.days_worked, config);

  // Step 6: Worker take-home = gross wages minus IMSS share AND ISR.
  const totalDeductions = roundCurrency(imssForPeriod.total_worker + isrResult.period_isr_withholding);
  const netPay = roundCurrency(grossWages - totalDeductions);

  // Step 7: Employer total cost = gross wages + employer IMSS + INFONAVIT.
  // ISR is NOT an additional employer cost — it is the worker's own money
  // withheld by the employer on SAT's behalf.
  const employerTotalCost = roundCurrency(grossWages + imssForPeriod.total_employer + infonavitForPeriod);

  return {
    worker_id: worker.id,
    period,
    config_id: config.config_id,
    gross_wages: grossWages,
    imss: imssForPeriod,
    infonavit_employer_contribution: infonavitForPeriod,
    isr: isrResult,
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
 * who is leaving WITHOUT severance pay being owed.
 *
 * LEGAL BASIS:
 *  - Proportional aguinaldo: LFT Art. 87
 *  - Proportional vacation pay: LFT Arts. 76, 79
 *  - Prima vacacional: LFT Art. 80
 */
export function calculateFiniquito(
  worker: WorkerRecord,
  terminationDate: Date,
  config: RatesConfig
): FiniquitoBreakdown {
  const terminationDateStr = terminationDate.toISOString().split("T")[0];

  // Outstanding wages — simplified to 0 here; the API layer should populate
  // from actual payroll records before persisting the finiquito record.
  const pendingWages = 0;

  // Proportional aguinaldo: days worked this calendar year up to termination.
  const yearStart = `${terminationDate.getFullYear()}-01-01`;
  const daysWorkedThisYear = daysBetweenInclusive(yearStart, terminationDateStr);
  const proportionalAguinaldo = calculateAguinaldo(worker.daily_salary, daysWorkedThisYear, config);

  // Proportional vacation: fraction of current service-year elapsed.
  const yearsOfService = calculateYearsOfService(worker.start_date, terminationDateStr);
  const vacationDaysForCurrentCycle = calculateVacationDays(yearsOfService + 1, config);

  const anniversaryThisCycle = getAnniversaryDate(worker.start_date, yearsOfService, terminationDateStr);
  const daysIntoCurrentCycle = daysBetweenInclusive(anniversaryThisCycle, terminationDateStr);
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
 * LEGAL BASIS:
 *  - 3 months indemnity: LFT Art. 50, fraccion III
 *  - 20 days per year of service: LFT Art. 50, fraccion II
 *  - Prima de antiguedad (12 days/year, capped): LFT Art. 162
 */
export function calculateLiquidacion(
  worker: WorkerRecord,
  terminationDate: Date,
  config: RatesConfig
): LiquidacionBreakdown {
  const finiquito = calculateFiniquito(worker, terminationDate, config);
  const terminationDateStr = finiquito.termination_date;

  const exactYearsOfService = getExactYearsOfService(worker.start_date, terminationDateStr);

  // 3 months constitutional indemnity (LFT Art. 50-III)
  const monthlyEquivalent = worker.daily_salary * 30;
  const constitutionalIndemnity = roundCurrency(
    monthlyEquivalent * config.liquidacion_constitutional_indemnity_months
  );

  // 20 days per year of service (LFT Art. 50-II)
  const twentyDaysPerYear = roundCurrency(
    worker.daily_salary * config.liquidacion_seniority_premium_days_per_year * exactYearsOfService
  );

  // Prima de antiguedad — 12 days per year, capped (LFT Art. 162)
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

function getAnniversaryDate(startDate: string, completedYears: number, asOfDate: string): string {
  const start = new Date(startDate);
  const anniversary = new Date(start.getFullYear() + completedYears, start.getMonth(), start.getDate());
  return anniversary.toISOString().split("T")[0];
}

function getExactYearsOfService(startDate: string, asOfDate: string): number {
  const start = new Date(startDate);
  const asOf = new Date(asOfDate);
  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
  const years = (asOf.getTime() - start.getTime()) / msPerYear;
  return Math.max(0, Math.round(years * 100) / 100);
}
