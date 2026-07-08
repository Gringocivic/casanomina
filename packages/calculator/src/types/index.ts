/**
 * types/index.ts
 *
 * Core data shapes used throughout the calculator package.
 */

// ---------------------------------------------------------------------------
// Configuration (the "rulebook")
// ---------------------------------------------------------------------------

/** One bracket in the ISR monthly tariff table (Art. 96 LISR). */
export interface ISRTariffBracket {
  lower_limit: number;
  /** null means "no upper cap" — this is the top bracket. */
  upper_limit: number | null;
  /** Fixed tax (cuota fija) owed at the start of this bracket, in MXN. */
  fixed_tax: number;
  /** Marginal rate applied to income ABOVE the lower limit, as a decimal. */
  rate: number;
}

/** One entry in the Subsidio para el Empleo monthly table (Art. 113-B LISR). */
export interface ISRSubsidyBracket {
  lower_limit: number;
  upper_limit: number | null;
  /** Monthly subsidy amount in MXN. Reduces or eliminates ISR for low earners. */
  subsidy: number;
}

/** One entry in the CEAV phased-contribution schedule (2024-2030 transition). */
export interface CeavScheduleEntry {
  year: number;
  employer_rate: number;
}

/** One entry in the vacation accrual table (LFT Art. 76). */
export interface VacationAccrualEntry {
  year_of_service: number;
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
  date: string;
  name: string;
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
 */
export interface RatesConfig {
  config_id: string;
  year: number;
  effective_date: string;
  currency: "MXN";

  minimum_daily_wage_general: number;
  minimum_daily_wage_northern_border: number;

  uma_daily_value: number;
  uma_daily_value_jan_override?: number;  // Previous year's UMA, used for January before Feb-1 transition
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

  /** ISR monthly tariff brackets (Art. 96 LISR). Present in 2025+ configs. */
  isr_monthly_tariff?: ISRTariffBracket[];
  /** Subsidio para el Empleo monthly table (Art. 113-B LISR). Present in 2025+ configs. */
  isr_employment_subsidy_monthly?: ISRSubsidyBracket[];
}

// ---------------------------------------------------------------------------
// Worker & payroll
// ---------------------------------------------------------------------------

export type WageZone = "general" | "northern_border";

export interface WorkerRecord {
  id: string;
  full_name: string;
  start_date: string;
  daily_salary: number;
  wage_zone: WageZone;
  days_per_week?: number;
}

export interface PayPeriod {
  start_date: string;
  end_date: string;
  days_worked: number;
  /** Mandatory holidays the worker actually worked — each earns 2× bonus on top of regular pay (LFT Art. 75). */
  holiday_days_worked?: number;
  /** Rest days (non-holiday scheduled days off) the worker came in — each earns 2× daily salary (LFT Art. 73). */
  rest_days_worked?: number;
  /** Vacation days being paid in this period (LFT Arts. 76, 80). Adds vacation pay + prima vacacional. */
  vacation_days?: number;
}

// ---------------------------------------------------------------------------
// Calculation results
// ---------------------------------------------------------------------------

/**
 * Result of calculateISR(): the ISR withholding for one pay period.
 *
 * LEGAL BASIS: LISR Art. 96 (withholding obligation), Art. 113-B (subsidy).
 */
export interface ISRResult {
  /** Worker's monthly income equivalent used for the bracket lookup (daily_salary x 30). */
  monthly_income_equivalent: number;
  /** Raw ISR from the tariff table, before subsidy (monthly amount). */
  monthly_isr_gross: number;
  /** Subsidio para el Empleo (monthly amount). Offsets the gross ISR. */
  monthly_employment_subsidy: number;
  /** Net monthly ISR = max(0, gross - subsidy). */
  monthly_isr_net: number;
  /** The actual amount withheld THIS period (prorated by days_worked / 30). */
  period_isr_withholding: number;
}

/** Itemized IMSS contributions, split by branch and by who pays. */
export interface IMSSBreakdown {
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
  config_id: string;

  gross_wages: number;
  /** Extra pay for mandatory holidays worked: daily_salary × 2 × holiday_days_worked (LFT Art. 75). */
  holiday_bonus: number;
  /** Extra pay for rest days worked: daily_salary × 2 × rest_days_worked (LFT Art. 73). */
  rest_day_bonus: number;
  /** Vacation days paid this period (0 if none). */
  vacation_days: number;
  /** Vacation pay: daily_salary × vacation_days (LFT Art. 76). */
  vacation_pay: number;
  /** Prima vacacional: vacation_pay × 25% minimum (LFT Art. 80). */
  prima_vacacional: number;
  imss: IMSSBreakdown;
  infonavit_employer_contribution: number;

  /** ISR (income tax) withheld from the worker for this period. */
  isr: ISRResult;

  /** Worker's total deductions: IMSS worker share + ISR withholding. */
  total_deductions: number;
  /** What the worker actually receives (gross - IMSS worker share - ISR). */
  net_pay: number;
  /** What the employer pays in total (wages + employer IMSS + INFONAVIT). */
  employer_total_cost: number;
}

/** Output of calculateFiniquito(): voluntary resignation / justified termination. */
export interface FiniquitoBreakdown {
  worker_id: string;
  termination_date: string;
  config_id: string;

  pending_wages: number;
  proportional_aguinaldo: number;
  proportional_vacation: number;
  proportional_prima_vacacional: number;

  total: number;
}

/** Output of calculateLiquidacion(): unjustified dismissal severance. */
export interface LiquidacionBreakdown extends FiniquitoBreakdown {
  constitutional_indemnity: number;
  twenty_days_per_year: number;
  seniority_premium: number;
}
