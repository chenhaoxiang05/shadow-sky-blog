import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["MEMBER", "CONTRIBUTOR", "AUTHOR", "EDITOR", "ADMIN", "OWNER"]);
export const postStatusEnum = pgEnum("post_status", ["DRAFT", "IN_REVIEW", "PUBLISHED", "HIDDEN"]);
export const visibilityEnum = pgEnum("visibility", ["PUBLIC", "MEMBERS", "PRIVATE"]);
export const commentStatusEnum = pgEnum("comment_status", ["VISIBLE", "PENDING", "HIDDEN", "DELETED"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  handle: text("handle").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarKey: text("avatar_key"),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").default("MEMBER").notNull(),
  disabled: boolean("disabled").default(false).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_uq").on(table.email), uniqueIndex("users_handle_uq").on(table.handle), index("users_role_idx").on(table.role)]);

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  role: roleEnum("role").default("MEMBER").notNull(),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("invitations_token_hash_uq").on(table.tokenHash), index("invitations_email_idx").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("sessions_token_hash_uq").on(table.tokenHash), index("sessions_user_idx").on(table.userId)]);

export const categories = pgTable("categories", { id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), description: text("description"), ...timestamps }, (t) => [uniqueIndex("categories_slug_uq").on(t.slug)]);
export const tags = pgTable("tags", { id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [uniqueIndex("tags_slug_uq").on(t.slug)]);

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(), authorId: uuid("author_id").notNull().references(() => users.id), categoryId: uuid("category_id").references(() => categories.id),
  slug: text("slug").notNull(), title: text("title").notNull(), excerpt: text("excerpt").notNull(), bodySource: text("body_source").notNull(), bodyHtml: text("body_html").notNull(), coverKey: text("cover_key"),
  status: postStatusEnum("status").default("DRAFT").notNull(), visibility: visibilityEnum("visibility").default("PUBLIC").notNull(), featured: boolean("featured").default(false).notNull(),
  viewCount: integer("view_count").default(0).notNull(), likeCount: integer("like_count").default(0).notNull(), publishedAt: timestamp("published_at", { withTimezone: true }), reviewedBy: uuid("reviewed_by").references(() => users.id), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), ...timestamps,
}, (t) => [uniqueIndex("posts_slug_uq").on(t.slug), index("posts_feed_idx").on(t.status, t.visibility, t.publishedAt), index("posts_author_idx").on(t.authorId, t.updatedAt)]);

export const postTags = pgTable("post_tags", { postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }) }, (t) => [primaryKey({ columns: [t.postId, t.tagId] })]);
export const comments = pgTable("comments", { id: uuid("id").defaultRandom().primaryKey(), postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), authorId: uuid("author_id").notNull().references(() => users.id), parentId: uuid("parent_id"), body: text("body").notNull(), status: commentStatusEnum("status").default("VISIBLE").notNull(), ...timestamps }, (t) => [index("comments_post_idx").on(t.postId, t.createdAt)]);
export const bookmarks = pgTable("bookmarks", { userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);
export const postLikes = pgTable("post_likes", { userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);
export const mediaAssets = pgTable("media_assets", { id: uuid("id").defaultRandom().primaryKey(), ownerId: uuid("owner_id").notNull().references(() => users.id), storageKey: text("storage_key").notNull(), mimeType: text("mime_type").notNull(), byteSize: integer("byte_size").notNull(), width: integer("width"), height: integer("height"), sha256: text("sha256").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [uniqueIndex("media_storage_key_uq").on(t.storageKey), index("media_owner_idx").on(t.ownerId)]);
export const auditLogs = pgTable("audit_logs", { id: uuid("id").defaultRandom().primaryKey(), actorId: uuid("actor_id").references(() => users.id), action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id"), requestId: text("request_id").notNull(), ipHash: text("ip_hash"), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (t) => [index("audit_target_idx").on(t.targetType, t.targetId), index("audit_created_idx").on(t.createdAt)]);
