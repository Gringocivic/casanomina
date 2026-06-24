/**
 * db/schema.ts — PostgreSQL schema with Drizzle ORM.
 *
 * KEY DESIGN PRINCIPLE: every financial record stores the config_id of
 * the RatesConfig used when it was calculated, making all past records
 * fully auditable and reproducible regardless of future rate changes.
 */
import {
  pgTable, text, varchar, integer, numeric, boolean,
  timestamp, date, uuid, jsonb, pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const wageZoneEnum = pgEnum("wage_zone", ["general", "northern_border"]);
export const payFrequencyEnum = pgEnum("pay_frequency", ["daily", "weekly", "biweekly", "monthly"]);
export const payrollStatusEnum = pgEnum("payroll_status", ["draft", "approved", "paid", "cancelled"]);

// Accounts & employment-linking enums (see docs/ACCOUNTS_AND_PORTALS_PLAN.md).
export const initiatedByEnum = pgEnum("initiated_by", ["employer", "worker"]);
export const employmentStatusEnum = pgEnum("employment_status", ["proposed", "active"]);
export const inviteStatusEnum = pgEnum("invite_status", ["not_invited", "pending", "claimed"]);

// ── employers ────────────────────────────────────────────────────────────────
// One row per employer account. Created the first time someone signs up
// via Clerk and chooses the "employer" role.
export const employers = pgTable("employers", {
  id:            uuid("id").primaryKey().defaultRandom(),
  clerk_user_id: text("clerk_user_id").notNull().unique(),
  business_name: varchar("business_name", { length: 255 }),
  rfc:           varchar("rfc", { length: 13 }),
  phone:         varchar("phone", { length: 20 }),
  address:       text("address"),
  email:         varchar("email", { length: 255 }),
  created_at:    timestamp("created_at").notNull().defaultNow(),
  updated_at:    timestamp("updated_at").defaultNow(),
});

// ── worker_accounts ───────────────────────────────────────────────────────────
// One row per worker's own identity — separate from any single employment,
// since one worker can be linked to many `workers` rows (one per employer).
export const workerAccounts = pgTable("worker_accounts", {
  id:            uuid("id").primaryKey().defaultRandom(),
  clerk_user_id: text("clerk_user_id").notNull().unique(),
  full_name:     varchar("full_name", { length: 255 }).notNull(),
  phone:         varchar("phone", { length: 20 }),
  email:         varchar("email", { length: 255 }),
  created_at:    timestamp("created_at").notNull().defaultNow(),
});

// ── rate_configs ────────────────────────────────────────────────────────────
// One row per year's legal parameters. To update rates: INSERT a new row,
// never UPDATE existing rows (preserves the audit trail).
export const rateConfigs = pgTable("rate_configs", {
  id:             uuid("id").primaryKey().defaultRandom(),
  config_key:     varchar("config_key", { length: 100 }).notNull().unique(),
  year:           integer("year").notNull(),
  effective_date: date("effective_date").notNull(),
  // Full RatesConfig JSON — single source of truth for all legal numbers.
  config_data:    jsonb("config_data").notNull(),
  is_active:      boolean("is_active").notNull().default(false),
  created_at:     timestamp("created_at").notNull().defaultNow(),
  created_by:     uuid("created_by"),
});

// ── workers (employment records) ──────────────────────────────────────────────
// Despite the name, a row here represents an *employment relationship*, not
// just "a worker." Either side can originate it (see `initiated_by`):
//   - employer-initiated: employer_id is set immediately, worker_account_id
//     is null until the invited worker claims it.
//   - worker-initiated: worker_account_id is set immediately, employer_id is
//     null until the invited employer claims it.
// Invariant (enforced in application code, not the DB): employer_id and
// worker_account_id are never BOTH null. `employment_status` only becomes
// "active" once both sides are linked — payroll runs and contract generation
// require "active" (see routes/payroll.ts, routes/documents.ts).
export const workers = pgTable("workers", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  employer_id:        uuid("employer_id").references(() => employers.id),
  worker_account_id:  uuid("worker_account_id").references(() => workerAccounts.id),
  initiated_by:       initiatedByEnum("initiated_by").notNull(),
  employment_status:  employmentStatusEnum("employment_status").notNull().default("proposed"),
  // Contact info for whichever side hasn't joined yet, used to send the invite.
  invite_contact:     varchar("invite_contact", { length: 255 }),
  invite_status:      inviteStatusEnum("invite_status").notNull().default("not_invited"),
  invite_token:       text("invite_token"),
  invited_at:         timestamp("invited_at"),
  full_name:          varchar("full_name", { length: 255 }).notNull(),
  start_date:         date("start_date").notNull(),
  end_date:           date("end_date"),
  daily_salary:       numeric("daily_salary", { precision: 10, scale: 2 }).notNull(),
  wage_zone:          wageZoneEnum("wage_zone").notNull().default("general"),
  pay_frequency:      payFrequencyEnum("pay_frequency").notNull().default("weekly"),
  days_per_week:      integer("days_per_week").notNull().default(6),
  role:               varchar("role", { length: 100 }),     // e.g. "housekeeper"
  curp:               varchar("curp", { length: 18 }),      // 18-char national ID
  imss_nss:           varchar("imss_nss", { length: 11 }),  // IMSS affiliation #
  is_imss_registered: boolean("is_imss_registered").notNull().default(false),
  live_in:            boolean("live_in").notNull().default(false),      // live-in vs. live-out
  notes:              text("notes"),
  created_at:         timestamp("created_at").notNull().defaultNow(),
  updated_at:         timestamp("updated_at").notNull().defaultNow(),
});

// ── payroll_runs ─────────────────────────────────────────────────────────────
export const payrollRuns = pgTable("payroll_runs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  worker_id:    uuid("worker_id").notNull().references(() => workers.id),
  // config_id is the audit key: always reproducible from config_data.
  config_id:    uuid("config_id").notNull().references(() => rateConfigs.id),
  period_start: date("period_start").notNull(),
  period_end:   date("period_end").notNull(),
  days_worked:  integer("days_worked").notNull(),
  status:       payrollStatusEnum("status").notNull().default("draft"),
  gross_wages:               numeric("gross_wages", { precision: 10, scale: 2 }).notNull(),
  imss_worker_deduction:     numeric("imss_worker_deduction", { precision: 10, scale: 2 }).notNull(),
  imss_employer_contribution: numeric("imss_employer_contribution", { precision: 10, scale: 2 }).notNull(),
  infonavit_employer_contribution: numeric("infonavit_employer_contribution", { precision: 10, scale: 2 }).notNull(),
  isr_withholding:       numeric("isr_withholding", { precision: 10, scale: 2 }).notNull().default("0"),
  net_pay:               numeric("net_pay", { precision: 10, scale: 2 }).notNull(),
  employer_total_cost:   numeric("employer_total_cost", { precision: 10, scale: 2 }).notNull(),
  // Full PayrollResult JSON for payslip generation and audit trail.
  breakdown_json: jsonb("breakdown_json").notNull(),
  paid_at:        timestamp("paid_at"),
  approved_at:    timestamp("approved_at"),
  approved_by:    text("approved_by"),
  created_at:     timestamp("created_at").notNull().defaultNow(),
});

// ── payslips ─────────────────────────────────────────────────────────────────
export const payslips = pgTable("payslips", {
  id:              uuid("id").primaryKey().defaultRandom(),
  payroll_run_id:  uuid("payroll_run_id").notNull().references(() => payrollRuns.id),
  worker_id:       uuid("worker_id").notNull().references(() => workers.id),
  // Path: "payslips/{worker_id}/{year}/{period_start}.pdf"
  file_path:       text("file_path").notNull(),
  generated_at:    timestamp("generated_at").notNull().defaultNow(),
});

// ── contracts ────────────────────────────────────────────────────────────────
export const contracts = pgTable("contracts", {
  id:            uuid("id").primaryKey().defaultRandom(),
  worker_id:     uuid("worker_id").notNull().references(() => workers.id),
  config_id:     uuid("config_id").notNull().references(() => rateConfigs.id),
  contract_date: date("contract_date").notNull(),
  file_path:     text("file_path").notNull(),
  language:      varchar("language", { length: 5 }).notNull().default("es"),
  generated_at:  timestamp("generated_at").notNull().defaultNow(),
});

// ── cms_content ───────────────────────────────────────────────────────────────
// Bilingual Laws & Rights content. Each row = one language variant of one
// content block. CMS-driven: update without code changes.
export const cmsContent = pgTable("cms_content", {
  id:             uuid("id").primaryKey().defaultRandom(),
  // Stable key used in code, e.g. "rights.aguinaldo", "rights.vacations"
  content_key:    varchar("content_key", { length: 200 }).notNull(),
  language:       varchar("language", { length: 5 }).notNull(), // "en" or "es"
  title:          text("title").notNull(),
  body:           text("body").notNull(),                       // Markdown
  legal_citation: varchar("legal_citation", { length: 200 }),
  is_published:   boolean("is_published").notNull().default(true),
  created_at:     timestamp("created_at").notNull().defaultNow(),
  updated_at:     timestamp("updated_at").notNull().defaultNow(),
});

// ── Relations ────────────────────────────────────────────────────────────────
export const employersRelations = relations(employers, ({ many }) => ({
  workers: many(workers),
}));

export const workerAccountsRelations = relations(workerAccounts, ({ many }) => ({
  employments: many(workers),
}));

export const workersRelations = relations(workers, ({ one, many }) => ({
  employer: one(employers, { fields: [workers.employer_id], references: [employers.id] }),
  workerAccount: one(workerAccounts, { fields: [workers.worker_account_id], references: [workerAccounts.id] }),
  payrollRuns: many(payrollRuns),
  contracts: many(contracts),
  payslips: many(payslips),
}));

export const payrollRunsRelations = relations(payrollRuns, ({ one }) => ({
  worker: one(workers, { fields: [payrollRuns.worker_id], references: [workers.id] }),
  config: one(rateConfigs, { fields: [payrollRuns.config_id], references: [rateConfigs.id] }),
  payslip: one(payslips, { fields: [payrollRuns.id], references: [payslips.payroll_run_id] }),
}));
