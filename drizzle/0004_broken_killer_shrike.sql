CREATE TYPE "public"."media_cleanup_status" AS ENUM('NONE', 'PENDING', 'COMPLETED');--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_status" "media_cleanup_status" DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_last_error_code" text;--> statement-breakpoint
CREATE INDEX "media_cleanup_pending_idx" ON "media_assets" USING btree ("cleanup_status","cleanup_requested_at");