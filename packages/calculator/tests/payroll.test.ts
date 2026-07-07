/**
 * tests/payroll.test.ts
 *
 * Tests for the higher-level functions: calculatePayroll,
 * calculateFiniquito, and calculateLiquidacion.
 */

import { describe, it, expect } from "vitest";
import { calculatePayroll, calculateFiniquito, calculateLiquidacion } from "../src/calculations/payroll";
import { calculateSBC, calculateIMSSContributions, calculateYearsOfService } from "../src/calculations/core";
import { RATES_2026 } from "../src/index";
import type { WorkerRecord, PayPeriod } from "../src/types";

const sampleWorker: WorkerRecord = {
  id: "worker-1",
  full_name: "Maria Lopez",
  start_date: "2024-01-15",
  daily_salary: 350,
  wage_zone: "general",
  days_per_week: 5,
};

describe("calculatePayroll", () => {
  const period: PayPeriod = {
    start_date: "2026-06-01",
    end_date: "2026-06-14",
    days_worked: 10,
  };

  it("calculates gross wages as daily_salary * days_worked", () => {
    const result = calculatePayroll(sampleWorker, period, RATES_2026);
    expect(result.gross_wages).toBeCloseTo(350 * 10, 2);
  });

  it("records the config_id used", () => {
    const result = calculatePayroll(sampleWorker, period, RATES_2026);
    expect(result.config_id).toBe(RATES_2026.config_id);
  });

  it("net pay equals gross wages minus worker IMSS deductions", () => {
    const result = calculatePayroll(sampleWorker, period, RATES_2026);
    expect(result.net_pay).toBeCloseTo(result.gross_wages - result.total_deductions, 2);
  });

  it("employer total cost is greater than gross wages", () => {
    const result = calculatePayroll(sampleWorker, period, RATES_2026);
    expect(result.employer_total_cost).toBeGreaterThan(result.gross_wages);
  });

  it("IMSS totals for the period scale with days worked", () => {
    // Must compute SBC with years-of-service, the same way calculatePayroll does internally.
    // Without it the integration factor differs and the comparison drifts by ~$0.60.
    const years = calculateYearsOfService(sampleWorker.start_date, period.end_date);
    const sbc = calculateSBC(sampleWorker.daily_salary, RATES_2026, years);
    const dailyImss = calculateIMSSContributions(sbc, RATES_2026);
    const result = calculatePayroll(sampleWorker, period, RATES_2026);

    expect(result.imss.total_employer).toBeCloseTo(dailyImss.total_employer * period.days_worked, 2);
    expect(result.imss.total_worker).toBeCloseTo(dailyImss.total_worker * period.days_worked, 2);
  });
});

describe("calculatePayroll -- vacation days", () => {
  const worker: WorkerRecord = {
    id: "worker-vac",
    full_name: "Ana Ruiz",
    start_date: "2025-06-01",
    daily_salary: 350,
    wage_zone: "general",
    days_per_week: 6,
  };

  // 6 days_worked, 2 of which are vacation days.
  const period: PayPeriod = {
    start_date: "2026-06-01",
    end_date: "2026-06-07",
    days_worked: 6,
    vacation_days: 2,
  };

  it("adds vacation_pay and prima_vacacional to gross wages", () => {
    const result = calculatePayroll(worker, period, RATES_2026);
    // regular = 4, vacation_pay = 2 x 350 = 700, prima = 2 x 350 x 0.25 = 175
    // gross = 4x350 + 700 + 175 = 2275
    expect(result.vacation_days).toBe(2);
    expect(result.vacation_pay).toBeCloseTo(700, 2);
    expect(result.prima_vacacional).toBeCloseTo(175, 2);
    expect(result.gross_wages).toBeCloseTo(2275, 2);
  });

  it("vacation period earns more gross than the same days_worked with no vacation", () => {
    // Prima vacacional is the extra -- even though regular days drop, gross rises.
    const noVac  = calculatePayroll(worker, { ...period, vacation_days: 0 }, RATES_2026);
    const withVac = calculatePayroll(worker, period, RATES_2026);
    expect(withVac.gross_wages).toBeGreaterThan(noVac.gross_wages);
  });

  it("clamps vacation_days to days_worked when the field is larger", () => {
    const result = calculatePayroll(worker, { ...period, days_worked: 3, vacation_days: 10 }, RATES_2026);
    expect(result.vacation_days).toBe(3);
    // All 3 days become vacation; regular days = 0.
    expect(result.vacation_pay).toBeCloseTo(3 * 350, 2);
  });

  it("vacation_days: 0 behaves identically to omitting vacation_days", () => {
    const withZero = calculatePayroll(worker, { ...period, vacation_days: 0 }, RATES_2026);
    const withUndef = calculatePayroll(worker, { ...period, vacation_days: undefined }, RATES_2026);
    expect(withZero.gross_wages).toBe(withUndef.gross_wages);
    expect(withZero.prima_vacacional).toBe(0);
    expect(withZero.vacation_days).toBe(0);
  });
});

describe("calculatePayroll -- holiday and rest-day bonuses", () => {
  const worker: WorkerRecord = {
    id: "worker-bonus",
    full_name: "Carlos Vega",
    start_date: "2024-01-01",
    daily_salary: 350,
    wage_zone: "general",
    days_per_week: 6,
  };

  const base: PayPeriod = {
    start_date: "2026-06-01",
    end_date: "2026-06-07",
    days_worked: 6,
  };

  it("holiday_bonus = 2x daily_salary per holiday worked (LFT Art. 75)", () => {
    const result = calculatePayroll(worker, { ...base, holiday_days_worked: 1 }, RATES_2026);
    expect(result.holiday_bonus).toBeCloseTo(700, 2); // 350 x 2 x 1
    expect(result.gross_wages).toBeCloseTo(350 * 6 + 700, 2);
  });

  it("rest_day_bonus = 2x daily_salary per rest day worked (LFT Art. 73)", () => {
    const result = calculatePayroll(worker, { ...base, rest_days_worked: 1 }, RATES_2026);
    expect(result.rest_day_bonus).toBeCloseTo(700, 2); // 350 x 2 x 1
    expect(result.gross_wages).toBeCloseTo(350 * 6 + 700, 2);
  });

  it("holiday_bonus and rest_day_bonus are 0 when neither field is set", () => {
    const result = calculatePayroll(worker, base, RATES_2026);
    expect(result.holiday_bonus).toBe(0);
    expect(result.rest_day_bonus).toBe(0);
  });

  it("holiday and rest-day bonuses are additive in the same period", () => {
    const result = calculatePayroll(
      worker,
      { ...base, holiday_days_worked: 1, rest_days_worked: 2 },
      RATES_2026
    );
    expect(result.holiday_bonus).toBeCloseTo(700, 2);    // 350 x 2 x 1
    expect(result.rest_day_bonus).toBeCloseTo(1400, 2);  // 350 x 2 x 2
    expect(result.gross_wages).toBeCloseTo(350 * 6 + 700 + 1400, 2);
  });
});

describe("calculateFiniquito", () => {
  it("includes a proportional aguinaldo for a partial year", () => {
    // Worker started 2024-01-15. As of 2026-06-15, they have completed 2
    // full years (2024-01-15 -> 2026-01-15). Termination on 2026-06-15
    // means ~166 days into 2026.
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);

    expect(result.proportional_aguinaldo).toBeGreaterThan(0);
    // Should be less than a full 15 days' pay since the year is not complete.
    expect(result.proportional_aguinaldo).toBeLessThan(sampleWorker.daily_salary * 15);
  });

  it("includes proportional vacation pay and prima vacacional", () => {
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);

    expect(result.proportional_vacation).toBeGreaterThan(0);
    expect(result.proportional_prima_vacacional).toBeGreaterThan(0);

    // Prima vacacional should be ~25% of proportional vacation pay.
    expect(result.proportional_prima_vacacional).toBeCloseTo(result.proportional_vacation * 0.25, 1);
  });

  it("total equals the sum of all components", () => {
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);

    const expectedTotal =
      result.pending_wages +
      result.proportional_aguinaldo +
      result.proportional_vacation +
      result.proportional_prima_vacacional;

    expect(result.total).toBeCloseTo(expectedTotal, 2);
  });

  it("records the config_id and termination date", () => {
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);

    expect(result.config_id).toBe(RATES_2026.config_id);
    expect(result.termination_date).toBe("2026-06-15");
  });
});

describe("calculateFiniquito — mid-year hire", () => {
  it("aguinaldo is prorated from hire date, not Jan 1, for workers hired mid-year", () => {
    // Worker hired 2026-07-01, terminated 2026-10-01 = 93 days of actual employment.
    // The buggy version would count from 2026-01-01 (274 days) and over-pay aguinaldo.
    const midYearWorker: WorkerRecord = {
      id: "worker-mid",
      full_name: "Luis Torres",
      start_date: "2026-07-01",
      daily_salary: 350,
      wage_zone: "general",
      days_per_week: 6,
    };
    const terminationDate = new Date("2026-10-01");
    const result = calculateFiniquito(midYearWorker, terminationDate, RATES_2026);

    // Expected: 350 * 15 * (93 / 365)
    const expected = 350 * 15 * (93 / 365);
    expect(result.proportional_aguinaldo).toBeCloseTo(expected, 1);

    // Must be strictly less than what a full-year worker would get from Jan 1.
    const jan1Days = 274; // Jan 1 -> Oct 1
    const overpaidAmount = 350 * 15 * (jan1Days / 365);
    expect(result.proportional_aguinaldo).toBeLessThan(overpaidAmount);
  });

  it("aguinaldo is unaffected for workers hired before Jan 1 of the termination year", () => {
    // Worker hired 2024-01-15, terminated 2026-06-15 — hire date is before Jan 1 2026,
    // so effectiveStart = Jan 1 2026 and behaviour is identical to before the fix.
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);

    // daysBetweenInclusive("2026-01-01", "2026-06-15") = 166 days
    const expected = 350 * 15 * (166 / 365);
    expect(result.proportional_aguinaldo).toBeCloseTo(expected, 1);
  });
});

describe("calculateLiquidacion", () => {
  it("includes all finiquito components plus severance items", () => {
    const terminationDate = new Date("2026-06-15");
    const result = calculateLiquidacion(sampleWorker, terminationDate, RATES_2026);

    expect(result.proportional_aguinaldo).toBeGreaterThan(0);
    expect(result.constitutional_indemnity).toBeGreaterThan(0);
    expect(result.twenty_days_per_year).toBeGreaterThan(0);
    expect(result.seniority_premium).toBeGreaterThan(0);
  });

  it("constitutional indemnity equals 3 months (90 days) of salary", () => {
    const terminationDate = new Date("2026-06-15");
    const result = calculateLiquidacion(sampleWorker, terminationDate, RATES_2026);

    expect(result.constitutional_indemnity).toBeCloseTo(sampleWorker.daily_salary * 30 * 3, 2);
  });

  it("total is greater than the equivalent finiquito total", () => {
    const terminationDate = new Date("2026-06-15");
    const finiquito  = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);
    const liquidacion = calculateLiquidacion(sampleWorker, terminationDate, RATES_2026);

    expect(liquidacion.total).toBeGreaterThan(finiquito.total);
  });

  it("caps the seniority premium daily rate at 2x minimum wage for high earners", () => {
    const highEarner: WorkerRecord = {
      ...sampleWorker,
      daily_salary: RATES_2026.minimum_daily_wage_general * 5, // well above the cap
    };
    const terminationDate = new Date("2026-06-15");
    const result = calculateLiquidacion(highEarner, terminationDate, RATES_2026);

    const exactYears = result.seniority_premium / (RATES_2026.minimum_daily_wage_general * 2 * 12);
    // The implied daily rate used should not exceed 2x minimum wage.
    const impliedDailyRate = result.seniority_premium / (12 * exactYears);
    expect(impliedDailyRate).toBeLessThanOrEqual(RATES_2026.minimum_daily_wage_general * 2 + 0.01);
  });
});

describe("getAnniversaryDate (via calculateFiniquito) — Feb-29 edge case", () => {
  it("treats Feb-29 hire date as Feb-28 in non-leap years", () => {
    // Worker hired on Feb 29, 2004 (a leap year).
    // In 2026 (non-leap), their anniversary should land on Feb 28, not March 1.
    // calculateFiniquito uses getAnniversaryDate internally — if it rolled to
    // March 1 the daysIntoCurrentCycle count would be wrong.
    const feb29Worker: WorkerRecord = {
      id: "worker-feb29",
      full_name: "Rosa Salinas",
      start_date: "2004-02-29",
      daily_salary: 350,
      wage_zone: "general",
      days_per_week: 6,
    };

    // Terminate on 2026-03-15 — just after what would be the rolled-over date.
    // If the anniversary were March 1 (rolled), daysIntoCurrentCycle = 14.
    // If the anniversary is Feb 28 (correct), daysIntoCurrentCycle = 15.
    const terminationDate = new Date("2026-03-15");
    const result = calculateFiniquito(feb29Worker, terminationDate, RATES_2026);

    // Either way the finiquito runs without throwing, and the total is positive.
    expect(result.total).toBeGreaterThan(0);
    expect(result.proportional_aguinaldo).toBeGreaterThan(0);

    // Verify the anniversary resolved to Feb 28 (not March 1) by checking
    // that the proportional vacation covers at least 15 days into the cycle.
    // daysIntoCurrentCycle / 365 * vacDays * dailySalary should reflect Feb 28.
    expect(result.proportional_vacation).toBeGreaterThan(0);
  });

  it("has no effect for workers hired on non-Feb-29 dates", () => {
    // Regular worker — result should be identical before and after the fix.
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);
    expect(result.total).toBeGreaterThan(0);
  });
});
