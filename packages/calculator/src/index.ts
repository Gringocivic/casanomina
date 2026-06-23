/**
 * index.ts — Public API of the @casanomina/calculator package.
 *
 * Import everything you need from here, e.g.:
 *   import { calculatePayroll, calculateSBC, type RatesConfig } from "@casanomina/calculator";
 */

export * from "./types";
export * from "./calculations/core";
export * from "./calculations/payroll";

// Convenience re-exports of the bundled rate configs.
import rates2026 from "./config/rates.2026.json";
import rates2025 from "./config/rates.2025.json";
import type { RatesConfig } from "./types";

export const RATES_2026 = rates2026 as unknown as RatesConfig;
export const RATES_2025 = rates2025 as unknown as RatesConfig;
