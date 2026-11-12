CREATE TABLE "platform_terms_acceptance" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
