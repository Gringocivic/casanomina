-- S3: Split payroll_day into payroll_dow (day-of-week) and payroll_dom (day-of-month).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS are no-ops
-- if columns already exist / have already been dropped.
-- Data migration was applied manually; UPDATE statements are intentionally omitted here.
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "payroll_dow" integer;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "payroll_dom" integer;
--> statement-breakpoint
ALTER TABLE "workers" DROP COLUMN IF EXISTS "payroll_day";
