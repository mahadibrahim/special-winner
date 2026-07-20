CREATE TABLE "host_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_ratings_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "host_ratings_rating_range" CHECK ("host_ratings"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "host_ratings" ADD CONSTRAINT "host_ratings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_ratings" ADD CONSTRAINT "host_ratings_request_id_feedback_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."feedback_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_ratings" ADD CONSTRAINT "host_ratings_session_id_drop_in_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."drop_in_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_ratings" ADD CONSTRAINT "host_ratings_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_ratings_host_created_idx" ON "host_ratings" USING btree ("host_user_id","created_at");--> statement-breakpoint
CREATE INDEX "host_ratings_session_idx" ON "host_ratings" USING btree ("session_id");