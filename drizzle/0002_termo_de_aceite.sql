CREATE TABLE "terms_acceptance" (
	"user_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptance_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
