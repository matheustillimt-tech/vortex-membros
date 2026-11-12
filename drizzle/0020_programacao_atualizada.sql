ALTER TABLE "schedules" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "schedules" SET "updated_at" = "created_at";
