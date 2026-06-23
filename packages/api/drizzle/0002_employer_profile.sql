-- Phase 8: add employer profile columns
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "rfc" varchar(13);
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "email" varchar(255);
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();
