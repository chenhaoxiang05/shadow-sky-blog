import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["MEMBER", "CONTRIBUTOR", "AUTHOR", "EDITOR", "ADMIN", "OWNER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "DISABLED"]);
export const publishingPolicyEnum = pgEnum("publishing_policy", ["REVIEW_REQUIRED", "DIRECT_PUBLISH"]);
export const postStatusEnum = pgEnum("post_status", ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "HIDDEN", "DELETED"]);
export const visibilityEnum = pgEnum("visibility", ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"]);
export const commentStatusEnum = pgEnum("comment_status", ["VISIBLE", "PENDING", "HIDDEN", "DELETED"]);
export const mediaPurposeEnum = pgEnum("media_purpose", ["AVATAR", "COVER", "CONTENT"]);
export const mediaCleanupStatusEnum = pgEnum("media_cleanup_status", ["NONE", "PENDING", "COMPLETED"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email"), handle: text("handle").notNull(), displayName: text("display_name").notNull(), bio: text("bio"), avatarKey: text("avatar_key"), githubUrl: text("github_url"), websiteUrl: text("website_url"),
  passwordHash: text("password_hash").notNull(), role: roleEnum("role").default("MEMBER").notNull(), status: userStatusEnum("status").default("ACTIVE").notNull(), publishingPolicy: publishingPolicyEnum("publishing_policy").default("REVIEW_REQUIRED").notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(), passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }), lastLoginAt: timestamp("last_login_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps,
}, (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_handle_uq").on(t.handle), index("users_status_role_idx").on(t.status, t.role), index("users_deleted_idx").on(t.deletedAt)]);

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(), tokenHash: text("token_hash").notNull(), role: roleEnum("role").default("MEMBER").notNull(), publishingPolicy: publishingPolicyEnum("publishing_policy").default("REVIEW_REQUIRED").notNull(), invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }), note: text("note"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), acceptedAt: timestamp("accepted_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("invitations_token_hash_uq").on(t.tokenHash), index("invitations_state_idx").on(t.expiresAt, t.acceptedAt, t.revokedAt)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), tokenHash: text("token_hash").notNull(), csrfHash: text("csrf_hash").notNull(), ipHash: text("ip_hash"), userAgent: text("user_agent"), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_active_idx").on(t.userId, t.revokedAt, t.expiresAt)]);

export const loginAttempts = pgTable("login_attempts", {
  keyHash: text("key_hash").primaryKey(), count: integer("count").default(0).notNull(), windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(), lockedUntil: timestamp("locked_until", { withTimezone: true }), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable("categories", { id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), description: text("description"), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("categories_slug_uq").on(t.slug)]);
export const tags = pgTable("tags", { id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [uniqueIndex("tags_slug_uq").on(t.slug)]);

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(), authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "restrict" }), categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  slug: text("slug").notNull(), title: text("title").notNull(), summary: text("summary").notNull(), content: text("content").notNull(), contentHtml: text("content_html").notNull(), coverImage: text("cover_image"),
  status: postStatusEnum("status").default("DRAFT").notNull(), visibility: visibilityEnum("visibility").default("PUBLIC").notNull(), featured: boolean("featured").default(false).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }), reviewReason: text("review_reason"), publishedAt: timestamp("published_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }),
  viewCount: integer("view_count").default(0).notNull(), likeCount: integer("like_count").default(0).notNull(), revision: integer("revision").default(1).notNull(), ...timestamps,
}, (t) => [uniqueIndex("posts_slug_uq").on(t.slug), index("posts_public_feed_idx").on(t.status, t.visibility, t.publishedAt), index("posts_author_status_idx").on(t.authorId, t.status, t.updatedAt), index("posts_review_queue_idx").on(t.status, t.submittedAt), index("posts_deleted_idx").on(t.deletedAt)]);

export const postTags = pgTable("post_tags", { postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }) }, (t) => [primaryKey({ columns: [t.postId, t.tagId] })]);
export const comments = pgTable("comments", { id: uuid("id").defaultRandom().primaryKey(), postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "restrict" }), parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }), depth: integer("depth").default(0).notNull(), body: text("body").notNull(), status: commentStatusEnum("status").default("VISIBLE").notNull(), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [index("comments_post_idx").on(t.postId, t.createdAt), index("comments_deleted_idx").on(t.deletedAt)]);
export const bookmarks = pgTable("bookmarks", { userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);
export const postLikes = pgTable("post_likes", { userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);
export const mediaAssets = pgTable("media_assets", { id: uuid("id").defaultRandom().primaryKey(), ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }), purpose: mediaPurposeEnum("purpose").notNull(), linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }), linkedPostId: uuid("linked_post_id").references(() => posts.id, { onDelete: "set null" }), storageKey: text("storage_key").notNull(), mimeType: text("mime_type").notNull(), byteSize: integer("byte_size").notNull(), width: integer("width"), height: integer("height"), sha256: text("sha256").notNull(), deletedAt: timestamp("deleted_at", { withTimezone: true }), cleanupStatus: mediaCleanupStatusEnum("cleanup_status").default("NONE").notNull(), cleanupRequestedAt: timestamp("cleanup_requested_at", { withTimezone: true }), cleanupCompletedAt: timestamp("cleanup_completed_at", { withTimezone: true }), cleanupAttempts: integer("cleanup_attempts").default(0).notNull(), cleanupLastErrorCode: text("cleanup_last_error_code"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [uniqueIndex("media_storage_key_uq").on(t.storageKey), index("media_owner_idx").on(t.ownerId), index("media_user_binding_idx").on(t.linkedUserId, t.purpose), index("media_post_binding_idx").on(t.linkedPostId, t.purpose), index("media_cleanup_pending_idx").on(t.cleanupStatus, t.cleanupRequestedAt)]);
export const auditLogs = pgTable("audit_logs", { id: uuid("id").defaultRandom().primaryKey(), actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }), action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id"), requestId: text("request_id").notNull(), outcome: text("outcome").default("SUCCESS").notNull(), ipHash: text("ip_hash"), reason: text("reason"), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [index("audit_target_idx").on(t.targetType, t.targetId), index("audit_actor_created_idx").on(t.actorId, t.createdAt), index("audit_retention_idx").on(t.createdAt)]);
