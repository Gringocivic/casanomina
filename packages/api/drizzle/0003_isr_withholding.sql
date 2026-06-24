-- Phase 9: add ISR withholding column to payroll_runs
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "isr_withholding" numeric(10, 2) NOT NULL DEFAULT 0;
