-- S3: Split payroll_day into payroll_dow (day-of-week) and payroll_dom (day-of-month).
-- The original column conflated two incompatible meaning systems in one integer,
-- causing silent data corruption when pay_frequency changed.
--
-- payroll_dow  integer  0=Mon … 6=Sun   — used by weekly/biweekly workers
-- payroll_dom  integer  1-28            — used by monthly workers
-- Both NULL for semi-monthly (always 15th and last day of month).
--
-- This migration is idempotent: safe to re-run if it was previously applied
-- manually outside of Drizzle's migration runner.

ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "payroll_dow" integer;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "payroll_dom" integer;

-- Migrate existing data only if the old payroll_day column still exists.
-- Wrapped in a DO block so the UPDATE is a no-op on a DB that was already migrated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workers' AND column_name = 'payroll_day'
  ) THEN
    UPDATE "workers"
      SET "payroll_dow" = LEAST(GREATEST("payroll_day", 0), 6)
      WHERE "pay_frequency" IN ('weekly', 'biweekly')
        AND "payroll_day" IS NOT NULL;

    UPDATE "workers"
      SET "payroll_dom" = LEAST(GREATEST("payroll_day", 1), 28)
      WHERE "pay_frequency" = 'monthly'
        AND "payroll_day" IS NOT NULL;
  END IF;
END $$;

-- Drop the old overloaded column.
ALTER TABLE "workers" DROP COLUMN IF EXISTS "payroll_day";
