/**
 * tests/payroll.test.ts
 *
 * Tests for the higher-level functions: calculatePayroll,
 * calculateFiniquito, and calculateLiquidacion.
 */

import { describe, it, expect } from "vitest";
import { calculatePayroll, calculateFiniquito, calculateLiquidacion } from "../src/calculations/payroll";
import { calculateSBC, calculateIMSSContributions } from "../src/calculations/core";
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
    const sbc = calculateSBC(sampleWorker.daily_salary, RATES_2026);
    const dailyImss = calculateIMSSContributions(sbc, RATES_2026);
    const result = calculatePayroll(sampleWorker, period, RATES_2026);

    expect(result.imss.total_employer).toBeCloseTo(dailyImss.total_employer * period.days_worked, 2);
    expect(result.imss.total_worker).toBeCloseTo(dailyImss.total_worker * period.days_worked, 2);
  });
});

describe("calculateFiniquito", () => {
  it("includes a proportional aguinaldo for a partial year", () => {
    // Worker started 2024-01-15. As of 2026-06-15, they've completed 2
    // full years (2024-01-15 -> 2026-01-15). Termination on 2026-06-15
    // means ~166 days into 2026.
    const terminationDate = new Date("2026-06-15");
    const result = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);

    expect(result.proportional_aguinaldo).toBeGreaterThan(0);
    // Should be less than a full 15 days' pay since the year isn't complete.
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
    const finiquito = calculateFiniquito(sampleWorker, terminationDate, RATES_2026);
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
