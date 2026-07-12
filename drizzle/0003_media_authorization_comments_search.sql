CREATE TYPE "public"."media_purpose" AS ENUM('AVATAR', 'COVER', 'CONTENT');--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_depth_ck" CHECK ("depth" IN (0, 1));--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "purpose" "media_purpose";--> statement-breakpoint
UPDATE "media_assets" SET "purpose" = 'CONTENT' WHERE "purpose" IS NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "purpose" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "linked_user_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "linked_post_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_linked_post_id_posts_id_fk" FOREIGN KEY ("linked_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_single_binding_ck" CHECK (NOT ("linked_user_id" IS NOT NULL AND "linked_post_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_purpose_ck" CHECK ("linked_user_id" IS NULL OR "purpose" = 'AVATAR');--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_post_purpose_ck" CHECK ("linked_post_id" IS NULL OR "purpose" IN ('COVER', 'CONTENT'));--> statement-breakpoint
CREATE INDEX "media_user_binding_idx" ON "media_assets" USING btree ("linked_user_id","purpose");--> statement-breakpoint
CREATE INDEX "media_post_binding_idx" ON "media_assets" USING btree ("linked_post_id","purpose");
