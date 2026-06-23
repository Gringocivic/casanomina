/**
 * tests/core.test.ts
 *
 * Tests for the basic building-block formulas, using values that can be
 * independently verified against the law or against published examples
 * (e.g. CONASAMI's minimum wage figures, the LFT Art. 76 vacation table).
 */

import { describe, it, expect } from "vitest";
import {
  calculateSBC,
  calculateIMSSContributions,
  calculateINFONAVIT,
  calculateVacationDays,
  calculatePrimaVacacional,
  calculateAguinaldo,
  calculateYearsOfService,
  daysBetweenInclusive,
  roundCurrency,
} from "../src/calculations/core";
import { RATES_2026 } from "../src/index";

describe("calculateSBC", () => {
  it("applies the integration factor to the daily salary", () => {
    // SBC = dailySalary * 1.0493
    const sbc = calculateSBC(315.04, RATES_2026);
    expect(sbc).toBeCloseTo(315.04 * 1.0493, 2);
  });

  it("returns a value greater than the daily salary", () => {
    const sbc = calculateSBC(500, RATES_2026);
    expect(sbc).toBeGreaterThan(500);
  });
});

describe("calculateIMSSContributions", () => {
  it("calculates a non-zero total for a minimum-wage SBC", () => {
    const sbc = calculateSBC(RATES_2026.minimum_daily_wage_general, RATES_2026);
    const result = calculateIMSSContributions(sbc, RATES_2026);

    expect(result.sbc).toBeCloseTo(sbc, 2);
    expect(result.total_employer).toBeGreaterThan(0);
    expect(result.total_worker).toBeGreaterThan(0);
    expect(result.total).toBeCloseTo(result.total_employer + result.total_worker, 2);
  });

  it("has zero worker contribution for retiro, guarderias, and riesgos de trabajo", () => {
    const sbc = calculateSBC(RATES_2026.minimum_daily_wage_general, RATES_2026);
    const result = calculateIMSSContributions(sbc, RATES_2026);

    expect(result.branches.retiro.worker).toBe(0);
    expect(result.branches.guarderias_prestaciones_sociales.worker).toBe(0);
    expect(result.branches.riesgos_trabajo.worker).toBe(0);
  });

  it("applies the excedente only when SBC exceeds 3x UMA", () => {
    // Low SBC: well below 3x UMA, excedente portion should be 0.
    const lowSbc = 200;
    const lowResult = calculateIMSSContributions(lowSbc, RATES_2026);

    // High SBC: above 3x UMA (3 * 117.31 = 351.93)
    const highSbc = 500;
    const highResult = calculateIMSSContributions(highSbc, RATES_2026);

    // At low SBC, enfermedad_maternidad employer contribution should be
    // dominated by the flat cuota_fija (based on UMA, not SBC).
    const expectedCuotaFija = roundCurrency(
      RATES_2026.uma_daily_value * RATES_2026.imss_rates.enfermedad_maternidad.cuota_fija_employer_pct_of_uma
    );

    expect(lowResult.branches.enfermedad_maternidad.employer).toBeGreaterThanOrEqual(expectedCuotaFija);
    // High SBC should produce strictly more total employer contribution
    // than low SBC, since percentage-based branches scale with SBC.
    expect(highResult.total_employer).toBeGreaterThan(lowResult.total_employer);
  });
});

describe("calculateINFONAVIT", () => {
  it("calculates 5% of the SBC", () => {
    const sbc = 330.74;
    const result = calculateINFONAVIT(sbc, RATES_2026);
    expect(result).toBeCloseTo(sbc * 0.05, 2);
  });
});

describe("calculateVacationDays", () => {
  it("returns 0 for less than 1 year of service", () => {
    expect(calculateVacationDays(0, RATES_2026)).toBe(0);
  });

  it("returns 12 days for year 1 (post Vacaciones Dignas reform)", () => {
    expect(calculateVacationDays(1, RATES_2026)).toBe(12);
  });

  it("returns 14 days for year 2", () => {
    expect(calculateVacationDays(2, RATES_2026)).toBe(14);
  });

  it("returns 20 days for year 5", () => {
    expect(calculateVacationDays(5, RATES_2026)).toBe(20);
  });

  it("returns 22 days for years 6 through 10", () => {
    expect(calculateVacationDays(6, RATES_2026)).toBe(22);
    expect(calculateVacationDays(10, RATES_2026)).toBe(22);
  });

  it("returns 24 days for years 11 through 15", () => {
    expect(calculateVacationDays(11, RATES_2026)).toBe(24);
    expect(calculateVacationDays(15, RATES_2026)).toBe(24);
  });

  it("extrapolates beyond the table (year 26 -> 30 days)", () => {
    // Table max is year 21 = 28 days. Year 26 is 5 years past that,
    // so +2 days = 30.
    expect(calculateVacationDays(26, RATES_2026)).toBe(30);
  });
});

describe("calculatePrimaVacacional", () => {
  it("calculates 25% of the vacation pay", () => {
    const dailySalary = 315.04;
    const vacationDays = 12;
    const result = calculatePrimaVacacional(dailySalary, vacationDays, RATES_2026);
    expect(result).toBeCloseTo(dailySalary * vacationDays * 0.25, 2);
  });
});

describe("calculateAguinaldo", () => {
  it("calculates 15 days of pay for a full year worked", () => {
    const dailySalary = 315.04;
    const result = calculateAguinaldo(dailySalary, 365, RATES_2026);
    expect(result).toBeCloseTo(dailySalary * 15, 2);
  });

  it("prorates for half a year worked (~182.5 days)", () => {
    const dailySalary = 315.04;
    const result = calculateAguinaldo(dailySalary, 182.5, RATES_2026);
    // Expect roughly half of 15 days' pay
    expect(result).toBeCloseTo(dailySalary * (15 / 365) * 182.5, 2);
  });

  it("caps proration at 365 days even if more days are passed", () => {
    const dailySalary = 315.04;
    const result = calculateAguinaldo(dailySalary, 400, RATES_2026);
    expect(result).toBeCloseTo(dailySalary * 15, 2);
  });
});

describe("calculateYearsOfService", () => {
  it("returns 0 for a worker employed less than a year", () => {
    expect(calculateYearsOfService("2026-01-01", "2026-06-01")).toBe(0);
  });

  it("returns 1 for a worker employed exactly 1 year", () => {
    expect(calculateYearsOfService("2025-01-01", "2026-01-01")).toBe(1);
  });

  it("returns 0 the day before the anniversary", () => {
    expect(calculateYearsOfService("2025-06-15", "2026-06-14")).toBe(0);
  });

  it("returns 1 on the anniversary date itself", () => {
    expect(calculateYearsOfService("2025-06-15", "2026-06-15")).toBe(1);
  });
});

describe("daysBetweenInclusive", () => {
  it("returns 1 for the same start and end date", () => {
    expect(daysBetweenInclusive("2026-01-01", "2026-01-01")).toBe(1);
  });

  it("returns 365 for a full non-leap year", () => {
    expect(daysBetweenInclusive("2026-01-01", "2026-12-31")).toBe(365);
  });

  it("returns 366 for a full leap year (2028)", () => {
    expect(daysBetweenInclusive("2028-01-01", "2028-12-31")).toBe(366);
  });
});

describe("roundCurrency", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundCurrency(123.456)).toBe(123.46);
    expect(roundCurrency(123.454)).toBe(123.45);
    expect(roundCurrency(100)).toBe(100);
  });
});
