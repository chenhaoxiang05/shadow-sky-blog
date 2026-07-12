ALTER TABLE "users" ADD COLUMN "github_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_search_document_idx" ON "posts" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("content", '')));--> statement-breakpoint
CREATE INDEX "users_search_document_idx" ON "users" USING gin (to_tsvector('simple', coalesce("display_name", '') || ' ' || coalesce("handle", '')));--> statement-breakpoint
CREATE INDEX "categories_search_document_idx" ON "categories" USING gin (to_tsvector('simple', coalesce("name", '')));--> statement-breakpoint
CREATE INDEX "tags_search_document_idx" ON "tags" USING gin (to_tsvector('simple', coalesce("name", '')));
