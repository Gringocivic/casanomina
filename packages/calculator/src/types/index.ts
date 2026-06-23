/**
 * types/index.ts
 *
 * Core data shapes used throughout the calculator package.
 *
 * PLAIN-LANGUAGE OVERVIEW:
 * - `RatesConfig` is the "rulebook" for a given year — every number that
 *   the law sets (minimum wage, IMSS percentages, vacation days, etc.)
 *   lives here. When the government updates these numbers each January,
 *   we add a NEW rates file (e.g. rates.2027.json) rather than editing
 *   code. Nothing in calculations.ts should ever contain a hardcoded
 *   legal number — it should all come from a RatesConfig object.
 * - `WorkerRecord` describes one domestic worker: their pay, start date,
 *   schedule, and which minimum-wage zone they live in.
 * - The various `*Breakdown` / `*Result` types describe the itemized
 *   output of each calculation, so the UI can show "here's exactly how
 *   we got this number."
 */

// ---------------------------------------------------------------------------
// Configuration (the "rulebook")
// ---------------------------------------------------------------------------

/** One entry in the CEAV phased-contribution schedule (2024-2030 transition). */
export interface CeavScheduleEntry {
  year: number;
  /** Effective combined employer contribution rate, as a decimal (0.08 = 8%). */
  employer_rate: number;
}

/** One entry in the vacation accrual table (LFT Art. 76). */
export interface VacationAccrualEntry {
  /** Completed years of service (1 = after the worker's 1st anniversary). */
  year_of_service: number;
  /** Paid vacation days earned for that year of service. */
  days: number;
}

/** Rule for extending the vacation table beyond its last explicit row. */
export interface VacationAccrualRule {
  extrapolation_step_years: number;
  extrapolation_step_days: number;
  table_max_year: number;
}

/** One official mandatory rest day (LFT Art. 74). */
export interface MandatoryHoliday {
  /** ISO date string, e.g. "2026-01-01". */
  date: string;
  name: string;
  /** Always true under current law (LFT Art. 75): working this day = triple pay. */
  triple_pay: boolean;
}

/** Sickness & Maternity (Enfermedad y Maternidad) branch rates. */
export interface ImssEnfermedadMaternidad {
  cuota_fija_employer_pct_of_uma: number;
  excedente_three_uma_employer_pct: number;
  excedente_three_uma_worker_pct: number;
  prestaciones_dinero_employer_pct: number;
  prestaciones_dinero_worker_pct: number;
  gastos_medicos_pensionados_employer_pct: number;
  gastos_medicos_pensionados_worker_pct: number;
}

/** A simple employer/worker percentage pair, used by several IMSS branches. */
export interface ImssBranchRate {
  employer_pct: number;
  worker_pct: number;
  /** Present only on Riesgos de Trabajo. */
  risk_class?: string;
}

/** All IMSS contribution branches ("ramos de seguro"). */
export interface ImssRates {
  enfermedad_maternidad: ImssEnfermedadMaternidad;
  invalidez_vida: ImssBranchRate;
  retiro: ImssBranchRate;
  cesantia_vejez: ImssBranchRate;
  guarderias_prestaciones_sociales: ImssBranchRate;
  riesgos_trabajo: ImssBranchRate;
}

/**
 * The full "rulebook" for one year. Loaded from rates.<year>.json.
 * Every calculation function takes one of these as a parameter —
 * never reads legal numbers from anywhere else.
 */
export interface RatesConfig {
  config_id: string;
  year: number;
  /** ISO date the config takes effect, e.g. "2026-01-01". */
  effective_date: string;
  currency: "MXN";

  minimum_daily_wage_general: number;
  minimum_daily_wage_northern_border: number;

  uma_daily_value: number;
  /** Optional: UMA value that applied in January, before the Feb 1 update. */
  uma_daily_value_jan_2026?: number;
  uma_daily_value_jan_2025?: number;
  uma_effective_date: string;

  sbc_integration_factor: number;

  imss_rates: ImssRates;

  infonavit_employer_pct: number;

  ceav_schedule: CeavScheduleEntry[];

  vacation_accrual_table: VacationAccrualEntry[];
  vacation_accrual_rule: VacationAccrualRule;

  aguinaldo_minimum_days: number;
  prima_vacacional_minimum_pct: number;

  liquidacion_constitutional_indemnity_months: number;
  liquidacion_seniority_premium_days_per_year: number;
  seniority_premium_cap_multiplier_of_min_wage: number;
  seniority_premium_days_per_year: number;

  mandatory_holidays_2026?: MandatoryHoliday[];
  mandatory_holidays_2025?: MandatoryHoliday[];
}

// ---------------------------------------------------------------------------
// Worker & payroll
// ---------------------------------------------------------------------------

/** Which minimum-wage zone a worker is in (affects legal minimum pay). */
export type WageZone = "general" | "northern_border";

/**
 * A domestic worker's employment record — the inputs every calculation
 * needs about the PERSON (as opposed to the legal rates, which come from
 * RatesConfig).
 */
export interface WorkerRecord {
  id: string;
  full_name: string;
  /** ISO date the worker started this job, e.g. "2023-06-01". */
  start_date: string;
  /** Agreed daily salary in MXN. Must be >= the applicable minimum wage. */
  daily_salary: number;
  wage_zone: WageZone;
  /** Days per week the worker is scheduled to work (for context only). */
  days_per_week?: number;
}

/** A pay period for which a payroll run is being calculated. */
export interface PayPeriod {
  /** ISO date, inclusive. */
  start_date: string;
  /** ISO date, inclusive. */
  end_date: string;
  /** Number of days actually worked in this period (excludes unpaid absences). */
  days_worked: number;
}

// ---------------------------------------------------------------------------
// Calculation results
// ---------------------------------------------------------------------------

/** Itemized IMSS contributions, split by branch and by who pays. */
export interface IMSSBreakdown {
  /** Salario Base de Cotizacion used for this calculation. */
  sbc: number;
  branches: {
    enfermedad_maternidad: { employer: number; worker: number };
    invalidez_vida: { employer: number; worker: number };
    retiro: { employer: number; worker: number };
    cesantia_vejez: { employer: number; worker: number };
    guarderias_prestaciones_sociales: { employer: number; worker: number };
    riesgos_trabajo: { employer: number; worker: number };
  };
  total_employer: number;
  total_worker: number;
  total: number;
}

/** Output of calculatePayroll(): one pay period's full breakdown. */
export interface PayrollResult {
  worker_id: string;
  period: PayPeriod;
  /** config_id of the RatesConfig used, for audit trail. */
  config_id: string;

  gross_wages: number;
  imss: IMSSBreakdown;
  infonavit_employer_contribution: number;

  /** Worker's IMSS share, deducted from gross pay. */
  total_deductions: number;
  /** What the worker actually receives. */
  net_pay: number;
  /** What the employer pays in total (wages + employer contributions). */
  employer_total_cost: number;
}

/** Output of calculateFiniquito(): voluntary resignation / justified termination. */
export interface FiniquitoBreakdown {
  worker_id: string;
  termination_date: string;
  config_id: string;

  /** Outstanding salary owed up to the termination date (not yet paid). */
  pending_wages: number;
  /** Proportional aguinaldo for the partial year worked (LFT Art. 87). */
  proportional_aguinaldo: number;
  /** Proportional vacation days owed but not yet taken, in pesos (LFT Art. 76, 79). */
  proportional_vacation: number;
  /** Prima vacacional on the proportional vacation amount (LFT Art. 80). */
  proportional_prima_vacacional: number;

  total: number;
}

/** Output of calculateLiquidacion(): unjustified dismissal severance. */
export interface LiquidacionBreakdown extends FiniquitoBreakdown {
  /** 3 months of SBC-based salary (LFT Art. 50). */
  constitutional_indemnity: number;
  /** 20 days per year of service (LFT Art. 50-II/III). */
  twenty_days_per_year: number;
  /** Prima de antiguedad — 12 days per year, capped (LFT Art. 162). */
  seniority_premium: number;
}
