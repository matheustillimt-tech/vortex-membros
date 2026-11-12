ALTER TABLE "users" ADD COLUMN "admin_role" text;--> statement-breakpoint
-- Admins que já existiam são Super Admin (único nível por enquanto).
UPDATE "users" SET "admin_role" = 'root' WHERE "role" = 'admin';
