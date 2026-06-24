ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "payroll_day" integer;
ALTER TYPE "pay_frequency" ADD VALUE IF NOT EXISTS 'semi-monthly';
