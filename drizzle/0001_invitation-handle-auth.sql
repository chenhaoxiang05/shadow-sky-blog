DROP INDEX IF EXISTS "invitations_email_state_idx";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified_at";--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "email";--> statement-breakpoint
CREATE INDEX "invitations_state_idx" ON "invitations" USING btree ("expires_at", "accepted_at", "revoked_at");
