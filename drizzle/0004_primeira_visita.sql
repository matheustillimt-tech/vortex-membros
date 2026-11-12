CREATE TABLE "product_first_visits" (
	"user_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_first_visits_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE INDEX "schedule_products_product_idx" ON "schedule_products" USING btree ("product_id");