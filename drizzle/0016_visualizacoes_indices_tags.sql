CREATE TABLE "lesson_views" (
	"user_id" bigint NOT NULL,
	"lesson_id" bigint NOT NULL,
	"views" integer DEFAULT 1 NOT NULL,
	"first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_views_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";--> statement-breakpoint
CREATE INDEX "lesson_views_lesson_idx" ON "lesson_views" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_lesson_idx" ON "lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_reactions_lesson_idx" ON "lesson_reactions" USING btree ("lesson_id");--> statement-breakpoint
-- Tags repetidas sem diferenciar maiúsculas: fica a de menor id; vínculos passam para ela.
CREATE TEMP TABLE "tag_dupes" AS
	SELECT t.id AS dup_id, k.keep_id
	FROM "tags" t
	JOIN (SELECT lower(name) AS lname, min(id) AS keep_id FROM "tags" GROUP BY lower(name) HAVING count(*) > 1) k ON lower(t.name) = k.lname
	WHERE t.id <> k.keep_id;--> statement-breakpoint
INSERT INTO "user_tags" ("user_id", "tag_id") SELECT ut.user_id, d.keep_id FROM "user_tags" ut JOIN "tag_dupes" d ON d.dup_id = ut.tag_id ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "delivery_tags" ("delivery_id", "tag_id") SELECT dt.delivery_id, d.keep_id FROM "delivery_tags" dt JOIN "tag_dupes" d ON d.dup_id = dt.tag_id ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "user_tags" WHERE "tag_id" IN (SELECT dup_id FROM "tag_dupes");--> statement-breakpoint
DELETE FROM "delivery_tags" WHERE "tag_id" IN (SELECT dup_id FROM "tag_dupes");--> statement-breakpoint
DELETE FROM "tags" WHERE "id" IN (SELECT dup_id FROM "tag_dupes");--> statement-breakpoint
DROP TABLE "tag_dupes";--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_uq" ON "tags" USING btree (lower("name"));