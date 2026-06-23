DO $$ BEGIN
 CREATE TYPE "public"."employment_status" AS ENUM('proposed', 'active');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."initiated_by" AS ENUM('employer', 'worker');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."invite_status" AS ENUM('not_invited', 'pending', 'claimed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"business_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employers_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "worker_accounts_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
-- Hand-edited below this point (drizzle-kit's naive auto-diff isn't safe for
-- this column, since it would try to ALTER COLUMN employer_id SET DATA TYPE
-- uuid directly — which fails on existing free-text values like
-- "dev-employer" that aren't valid UUIDs). See docs/ACCOUNTS_AND_PORTALS_PLAN.md.
--
-- Insert a placeholder employer row at a FIXED, well-known id, so existing
-- rows (and the application code's current "dev-employer" placeholder,
-- until Phase 1 wires up real Clerk auth) have something real to point at.
INSERT INTO "employers" ("id", "clerk_user_id", "business_name")
VALUES ('00000000-0000-0000-0000-000000000001', 'dev-employer', 'Local Dev Placeholder')
ON CONFLICT ("clerk_user_id") DO NOTHING;
--> statement-breakpoint
-- Add the new uuid column alongside the old text one, backfill every
-- existing row (today they ALL have employer_id = 'dev-employer', since
-- there's no real auth yet) to point at the placeholder employer, then
-- swap it in for the old text column.
ALTER TABLE "workers" ADD COLUMN "employer_id_new" uuid;
--> statement-breakpoint
UPDATE "workers" SET "employer_id_new" = '00000000-0000-0000-0000-000000000001'
WHERE "employer_id" = 'dev-employer';
--> statement-breakpoint
-- Defensive catch-all: any row with some OTHER unrecognized employer_id
-- text value also gets pointed at the placeholder rather than left null,
-- so the upcoming NOT-both-null invariant can't be silently violated by
-- pre-existing data this migration doesn't know how to map.
UPDATE "workers" SET "employer_id_new" = '00000000-0000-0000-0000-000000000001'
WHERE "employer_id_new" IS NULL;
--> statement-breakpoint
ALTER TABLE "workers" DROP COLUMN "employer_id";
--> statement-breakpoint
ALTER TABLE "workers" RENAME COLUMN "employer_id_new" TO "employer_id";
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "worker_account_id" uuid;
--> statement-breakpoint
-- initiated_by has no default by design (every NEW row must explicitly say
-- who initiated it), but existing rows predate the concept entirely — they
-- were all created through the employer-only flow, so backfill accordingly
-- before enforcing NOT NULL.
ALTER TABLE "workers" ADD COLUMN "initiated_by" "initiated_by";
--> statement-breakpoint
UPDATE "workers" SET "initiated_by" = 'employer' WHERE "initiated_by" IS NULL;
--> statement-breakpoint
ALTER TABLE "workers" ALTER COLUMN "initiated_by" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "employment_status" "employment_status" DEFAULT 'proposed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "invite_contact" varchar(255);
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "invite_status" "invite_status" DEFAULT 'not_invited' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "invite_token" text;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "invited_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workers" ADD CONSTRAINT "workers_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workers" ADD CONSTRAINT "workers_worker_account_id_worker_accounts_id_fk" FOREIGN KEY ("worker_account_id") REFERENCES "public"."worker_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
