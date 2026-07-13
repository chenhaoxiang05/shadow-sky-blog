import { and, count, countDistinct, desc, eq, gt, gte, ilike, isNotNull, isNull, lte, notInArray, or, sql, sum } from "drizzle-orm";
import type { Actor, AuditEvent, CommentRecord, InvitationRecord, MediaAssetRecord, MediaPurpose, PostRecord, PublishingPolicy, Role, SessionRecord, UserRecord, UserStatus } from "../lib/domain";
import type { NewPost, PostChanges, Repository, SearchInput, SearchPostProjection, SessionWithUser } from "../lib/repository";
import type { Database } from "./index";
import { auditLogs, bookmarks, categories, comments, invitations, loginAttempts, mediaAssets, postLikes, posts, postTags, sessions, tags, users } from "./schema";

const userShape = (row: typeof users.$inferSelect): UserRecord => ({ ...row, role: row.role as Exclude<Role, "VISITOR">, publishingPolicy: row.publishingPolicy as PublishingPolicy, status: row.status as UserStatus });
const inviteShape = (row: typeof invitations.$inferSelect): InvitationRecord => ({ ...row, role: row.role as Exclude<Role, "VISITOR">, publishingPolicy: row.publishingPolicy as PublishingPolicy });

export class PostgresRepository implements Repository {
  constructor(private readonly db: Database) {}
  async transaction<T>(work: (repository: Repository) => Promise<T>): Promise<T> { return this.db.transaction(async (tx): Promise<T> => work(new PostgresRepository(tx as unknown as Database))); }
  async findUserByLogin(login: string) { const [row] = await this.db.select().from(users).where(and(eq(users.handle, login), isNull(users.deletedAt))).limit(1); return row ? userShape(row) : null; }
  async findUserById(id: string) { const [row] = await this.db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1); return row ? userShape(row) : null; }
  async listUsers() { const rows = await this.db.select().from(users).where(isNull(users.deletedAt)).orderBy(desc(users.createdAt)); return rows.map((row) => { const safe: Partial<UserRecord> = userShape(row); delete safe.passwordHash; return safe as Omit<UserRecord, "passwordHash">; }); }

  async acceptInvitation(input: { tokenHash: string; passwordHash: string; handle: string; displayName: string; now: Date }) {
    return this.db.transaction(async (tx) => {
      const [invitation] = await tx.select().from(invitations).where(and(eq(invitations.tokenHash, input.tokenHash), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, input.now))).limit(1).for("update");
      if (!invitation) return null;
      const [created] = await tx.insert(users).values({ handle: input.handle.trim().toLowerCase(), displayName: input.displayName.trim(), passwordHash: input.passwordHash, role: invitation.role, publishingPolicy: invitation.publishingPolicy, status: "ACTIVE", mustChangePassword: false }).returning();
      await tx.update(invitations).set({ acceptedAt: input.now }).where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)));
      return userShape(created);
    });
  }

  async createInvitation(input: { tokenHash: string; role: Exclude<Role, "VISITOR">; publishingPolicy: PublishingPolicy; invitedBy: string; note?: string | null; expiresAt: Date }) { const [row] = await this.db.insert(invitations).values(input).returning(); return inviteShape(row); }
  async findInvitationById(id: string) { const [row] = await this.db.select().from(invitations).where(eq(invitations.id, id)).limit(1); return row ? inviteShape(row) : null; }
  async listInvitations() { const rows = await this.db.select().from(invitations).orderBy(desc(invitations.createdAt)).limit(100); return rows.map(inviteShape); }
  async revokeInvitation(id: string, now: Date) { const rows = await this.db.update(invitations).set({ revokedAt: now }).where(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt))).returning({ id: invitations.id }); return rows.length === 1; }
  async updateUserAccess(id: string, changes: { role?: Exclude<Role, "VISITOR">; publishingPolicy?: PublishingPolicy; status?: UserStatus }, now: Date) { const [row] = await this.db.update(users).set({ ...changes, updatedAt: now }).where(and(eq(users.id, id), isNull(users.deletedAt))).returning(); return row ? userShape(row) : null; }
  async updateUserProfile(id: string, changes: { displayName?: string; bio?: string | null; avatarKey?: string | null; githubUrl?: string | null; websiteUrl?: string | null }, now: Date) { const [row] = await this.db.update(users).set({ ...changes, updatedAt: now }).where(and(eq(users.id, id), isNull(users.deletedAt))).returning(); return row ? userShape(row) : null; }
  async findPublicProfile(handle: string) { const [user] = await this.db.select().from(users).where(and(eq(users.handle, handle), eq(users.status, "ACTIVE"), isNull(users.deletedAt))).limit(1); if (!user) return null; const [stats] = await this.db.select({ articleCount: count(posts.id), likeCount: sum(posts.likeCount) }).from(posts).where(and(eq(posts.authorId, user.id), eq(posts.status, "PUBLISHED"), eq(posts.visibility, "PUBLIC"), isNull(posts.deletedAt))); return { id: user.id, handle: user.handle, displayName: user.displayName, bio: user.bio, avatarUrl: user.avatarKey, githubUrl: user.githubUrl, websiteUrl: user.websiteUrl, articleCount: Number(stats.articleCount ?? 0), likeCount: Number(stats.likeCount ?? 0) }; }
  async updatePassword(id: string, passwordHash: string, mustChangePassword: boolean, now: Date) { await this.db.update(users).set({ passwordHash, mustChangePassword, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, id)); }

  async createSession(input: { userId: string; tokenHash: string; csrfHash: string; expiresAt: Date; ipHash?: string; userAgent?: string; now: Date }) { const [row] = await this.db.insert(sessions).values({ ...input, createdAt: input.now, lastSeenAt: input.now }).returning(); return row as SessionRecord; }
  async findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null> { const [row] = await this.db.select({ session: sessions, user: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.tokenHash, tokenHash)).limit(1); return row ? { session: row.session as SessionRecord, user: userShape(row.user) } : null; }
  async revokeSessionByTokenHash(tokenHash: string, now: Date) { await this.db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt))); }
  async revokeAllUserSessions(userId: string, now: Date) { await this.db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))); }
  async getLoginLimit(keyHash: string) { const [row] = await this.db.select().from(loginAttempts).where(eq(loginAttempts.keyHash, keyHash)).limit(1); return row ? { count: row.count, lockedUntil: row.lockedUntil } : { count: 0, lockedUntil: null }; }
  async recordLoginFailure(keyHash: string, now: Date) { const [current] = await this.db.select().from(loginAttempts).where(eq(loginAttempts.keyHash, keyHash)).limit(1); const count = (current?.count ?? 0) + 1; await this.db.insert(loginAttempts).values({ keyHash, count, windowStartedAt: current?.windowStartedAt ?? now, lockedUntil: count >= 8 ? new Date(now.getTime() + 15 * 60_000) : null, updatedAt: now }).onConflictDoUpdate({ target: loginAttempts.keyHash, set: { count, lockedUntil: count >= 8 ? new Date(now.getTime() + 15 * 60_000) : null, updatedAt: now } }); }
  async clearLoginFailures(keyHash: string) { await this.db.delete(loginAttempts).where(eq(loginAttempts.keyHash, keyHash)); }

  async audit(event: AuditEvent) { await this.db.insert(auditLogs).values({ actorId: event.actorId, action: event.action, targetType: event.targetType, targetId: event.targetId, requestId: event.requestId, outcome: event.outcome ?? "SUCCESS", reason: event.reason, metadata: event.metadata ?? {} }); }
  async listAudit(limit = 100) { const rows = await this.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(limit, 500)); return rows.map((row) => ({ actorId: row.actorId ?? undefined, action: row.action as AuditEvent["action"], targetType: row.targetType as AuditEvent["targetType"], targetId: row.targetId ?? undefined, requestId: row.requestId, outcome: row.outcome as "SUCCESS" | "FAILURE", reason: row.reason ?? undefined, metadata: row.metadata, createdAt: row.createdAt })); }

  async createPost(input: NewPost, now: Date) { return this.db.transaction(async (tx) => { const [row] = await tx.insert(posts).values({ ...input, createdAt: now, updatedAt: now }).returning(); await this.syncTags(tx as never, row.id, input.tags ?? []); return this.postShape(row, input.tags ?? []); }); }
  async findPostById(id: string) { const [row] = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1); return row ? this.postShape(row, await this.tagsFor(row.id)) : null; }
  async findPostBySlug(slug: string) { const [row] = await this.db.select().from(posts).where(eq(posts.slug, slug)).limit(1); return row ? this.postShape(row, await this.tagsFor(row.id)) : null; }
  async listPosts(input: { status?: PostRecord["status"]; search?: string; authorId?: string }) { const conditions = [input.status ? eq(posts.status, input.status) : undefined, input.authorId ? eq(posts.authorId, input.authorId) : undefined, input.search ? or(ilike(posts.title, `%${input.search}%`), ilike(posts.summary, `%${input.search}%`)) : undefined].filter(Boolean); const rows = await this.db.select().from(posts).where(conditions.length ? and(...(conditions as never[])) : undefined).orderBy(desc(posts.updatedAt)).limit(100); return Promise.all(rows.map(async (row) => this.postShape(row, await this.tagsFor(row.id)))); }
  async updatePost(id: string, changes: PostChanges, expectedRevision: number, now: Date) { return this.db.transaction(async (tx) => { const { tags: tagNames, ...values } = changes; const [row] = await tx.update(posts).set({ ...values, revision: sql`${posts.revision} + 1`, updatedAt: now }).where(and(eq(posts.id, id), eq(posts.revision, expectedRevision))).returning(); if (!row) return null; if (tagNames) await this.syncTags(tx as never, id, tagNames); return this.postShape(row, tagNames ?? await this.tagsFor(id)); }); }
  async transitionPost(id: string, changes: Partial<Pick<PostRecord, "status" | "submittedAt" | "reviewedAt" | "reviewedBy" | "reviewReason" | "publishedAt" | "deletedAt">>, now: Date) { const [row] = await this.db.update(posts).set({ ...changes, revision: sql`${posts.revision} + 1`, updatedAt: now }).where(eq(posts.id, id)).returning(); return row ? this.postShape(row, await this.tagsFor(id)) : null; }

  async searchPosts(input: SearchInput) {
    const conditions = [this.searchVisibility(input.actor), input.category ? eq(categories.slug, input.category) : undefined, input.tag ? eq(tags.slug, input.tag) : undefined, input.author ? eq(users.handle, input.author) : undefined, input.from ? gte(posts.publishedAt, input.from) : undefined, input.to ? lte(posts.publishedAt, input.to) : undefined];
    if (input.q) { const searchQuery = sql`websearch_to_tsquery('simple', ${input.q})`; conditions.push(or(sql`to_tsvector('simple', coalesce(${posts.title}, '') || ' ' || coalesce(${posts.summary}, '') || ' ' || coalesce(${posts.content}, '')) @@ ${searchQuery}`, sql`to_tsvector('simple', coalesce(${users.displayName}, '') || ' ' || coalesce(${users.handle}, '')) @@ ${searchQuery}`, sql`to_tsvector('simple', coalesce(${categories.name}, '')) @@ ${searchQuery}`, sql`to_tsvector('simple', coalesce(${tags.name}, '')) @@ ${searchQuery}`)); }
    const where = and(...conditions.filter(Boolean) as never[]);
    const base = this.db.selectDistinct({
      id: posts.id,
      authorId: posts.authorId,
      title: posts.title,
      summary: posts.summary,
      status: posts.status,
      visibility: posts.visibility,
      publishedAt: posts.publishedAt,
      deletedAt: posts.deletedAt,
      authorDisplayName: users.displayName,
      authorHandle: users.handle,
      readTimeMinutes: sql<number>`greatest(1, ceil(char_length(${posts.content}) / 500.0))::integer`,
    }).from(posts).leftJoin(users, eq(users.id, posts.authorId)).leftJoin(categories, eq(categories.id, posts.categoryId)).leftJoin(postTags, eq(postTags.postId, posts.id)).leftJoin(tags, eq(tags.id, postTags.tagId)).where(where);
    const rows = await base.orderBy(sql`${posts.publishedAt} desc nulls last`, desc(posts.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    const [totalRow] = await this.db.select({ value: countDistinct(posts.id) }).from(posts).leftJoin(users, eq(users.id, posts.authorId)).leftJoin(categories, eq(categories.id, posts.categoryId)).leftJoin(postTags, eq(postTags.postId, posts.id)).leftJoin(tags, eq(tags.id, postTags.tagId)).where(where);
    const result: SearchPostProjection[] = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      authorId: row.authorId,
      title: row.title,
      summary: row.summary,
      tags: await this.tagsFor(row.id),
      status: row.status as PostRecord["status"],
      visibility: row.visibility as PostRecord["visibility"],
      publishedAt: row.publishedAt,
      deletedAt: row.deletedAt,
      authorDisplayName: row.authorDisplayName ?? row.authorHandle ?? "社区成员",
      authorHandle: row.authorHandle ?? "",
      readTimeMinutes: Number(row.readTimeMinutes),
    }))); const total = Number(totalRow.value); return { posts: result, total, page: input.page, pageSize: input.pageSize, nextPage: input.page * input.pageSize < total ? input.page + 1 : null };
  }

  async createComment(input: { postId: string; authorId: string; parentId?: string | null; depth: number; body: string }, now: Date) { const [row] = await this.db.insert(comments).values({ ...input, createdAt: now, updatedAt: now }).returning(); return row as CommentRecord; }
  async findCommentById(id: string) { const [row] = await this.db.select().from(comments).where(eq(comments.id, id)).limit(1); return row ? row as CommentRecord : null; }
  async listComments(postId: string) { const rows = await this.db.select().from(comments).where(eq(comments.postId, postId)).orderBy(comments.createdAt, comments.id); return rows as CommentRecord[]; }
  async countRecentComments(authorId: string, since: Date) { const [row] = await this.db.select({ value: count() }).from(comments).where(and(eq(comments.authorId, authorId), gt(comments.createdAt, since))); return Number(row.value); }
  async updateComment(id: string, body: string, now: Date) { const [row] = await this.db.update(comments).set({ body, updatedAt: now }).where(and(eq(comments.id, id), eq(comments.status, "VISIBLE"), isNull(comments.deletedAt))).returning(); return row ? row as CommentRecord : null; }
  async softDeleteComment(id: string, status: "DELETED" | "HIDDEN", now: Date) { const [row] = await this.db.update(comments).set({ status, deletedAt: now, updatedAt: now }).where(eq(comments.id, id)).returning(); return row ? row as CommentRecord : null; }
  async restoreComment(id: string, now: Date) { const [row] = await this.db.update(comments).set({ status: "VISIBLE", deletedAt: null, updatedAt: now }).where(and(eq(comments.id, id), eq(comments.status, "HIDDEN"))).returning(); return row ? row as CommentRecord : null; }
  async setLike(userId: string, postId: string, liked: boolean, now: Date) { return this.db.transaction(async (tx) => { if (liked) await tx.insert(postLikes).values({ userId, postId, createdAt: now }).onConflictDoNothing(); else await tx.delete(postLikes).where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId))); const [updated] = await tx.update(posts).set({ likeCount: sql`(select count(*)::int from ${postLikes} where ${postLikes.postId} = ${postId})` }).where(eq(posts.id, postId)).returning({ likeCount: posts.likeCount }); const [active] = await tx.select({ userId: postLikes.userId }).from(postLikes).where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId))).limit(1); return { active: Boolean(active), likeCount: updated?.likeCount ?? 0 }; }); }
  async setBookmark(userId: string, postId: string, bookmarked: boolean, now: Date) { if (bookmarked) await this.db.insert(bookmarks).values({ userId, postId, createdAt: now }).onConflictDoNothing(); else await this.db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.postId, postId))); const [active] = await this.db.select({ userId: bookmarks.userId }).from(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.postId, postId))).limit(1); return Boolean(active); }
  async listBookmarkedPosts(userId: string) { const rows = await this.db.select({ post: posts }).from(bookmarks).innerJoin(posts, eq(posts.id, bookmarks.postId)).where(eq(bookmarks.userId, userId)).orderBy(desc(bookmarks.createdAt)); return Promise.all(rows.map(async ({ post }) => this.postShape(post, await this.tagsFor(post.id)))); }
  async createMediaAsset(input: Omit<MediaAssetRecord, "id" | "createdAt" | "deletedAt" | "linkedUserId" | "linkedPostId"> & { purpose: MediaPurpose }) { const [row] = await this.db.insert(mediaAssets).values(input).returning(); return row as MediaAssetRecord; }
  async findMediaAssetById(id: string) { const [row] = await this.db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).limit(1); return row ? row as MediaAssetRecord : null; }
  async listMediaAssetsForPost(postId: string) { const rows = await this.db.select().from(mediaAssets).where(and(eq(mediaAssets.linkedPostId, postId), isNull(mediaAssets.deletedAt))); return rows as MediaAssetRecord[]; }
  async bindMediaToUser(id: string, userId: string) { const [row] = await this.db.update(mediaAssets).set({ linkedUserId: userId, linkedPostId: null }).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).returning(); return row ? row as MediaAssetRecord : null; }
  async bindMediaToPost(id: string, postId: string) { const [row] = await this.db.update(mediaAssets).set({ linkedPostId: postId, linkedUserId: null }).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).returning(); return row ? row as MediaAssetRecord : null; }
  async unbindMedia(id: string) { const [row] = await this.db.update(mediaAssets).set({ linkedPostId: null, linkedUserId: null }).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).returning(); return row ? row as MediaAssetRecord : null; }
  async softDeleteMedia(id: string, now: Date) { const [row] = await this.db.update(mediaAssets).set({ deletedAt: now, linkedPostId: null, linkedUserId: null, cleanupStatus: "PENDING", cleanupRequestedAt: now, cleanupCompletedAt: null, cleanupLastErrorCode: null }).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).returning(); return row ? row as MediaAssetRecord : null; }
  async listPendingMediaCleanup(limit = 100) { const rows = await this.db.select().from(mediaAssets).where(and(eq(mediaAssets.cleanupStatus, "PENDING"), isNotNull(mediaAssets.deletedAt), isNull(mediaAssets.linkedUserId), isNull(mediaAssets.linkedPostId))).orderBy(mediaAssets.cleanupRequestedAt, mediaAssets.id).limit(Math.min(Math.max(limit, 1), 500)); return rows as MediaAssetRecord[]; }
  async markMediaCleanupCompleted(id: string, now: Date) { const rows = await this.db.update(mediaAssets).set({ cleanupStatus: "COMPLETED", cleanupCompletedAt: now, cleanupLastErrorCode: null }).where(and(eq(mediaAssets.id, id), eq(mediaAssets.cleanupStatus, "PENDING"), isNotNull(mediaAssets.deletedAt), isNull(mediaAssets.linkedUserId), isNull(mediaAssets.linkedPostId))).returning({ id: mediaAssets.id }); return rows.length === 1; }
  async recordMediaCleanupFailure(id: string, errorCode: string) { const rows = await this.db.update(mediaAssets).set({ cleanupAttempts: sql`${mediaAssets.cleanupAttempts} + 1`, cleanupLastErrorCode: errorCode }).where(and(eq(mediaAssets.id, id), eq(mediaAssets.cleanupStatus, "PENDING"), isNotNull(mediaAssets.deletedAt), isNull(mediaAssets.linkedUserId), isNull(mediaAssets.linkedPostId))).returning({ id: mediaAssets.id }); return rows.length === 1; }

  private async tagsFor(postId: string) { const rows = await this.db.select({ name: tags.name }).from(postTags).innerJoin(tags, eq(tags.id, postTags.tagId)).where(eq(postTags.postId, postId)); return rows.map((row) => row.name); }
  private searchVisibility(actor: Actor) { if (actor.role === "VISITOR" || actor.status !== "ACTIVE") return and(eq(posts.status, "PUBLISHED"), eq(posts.visibility, "PUBLIC"), isNull(posts.deletedAt)); const own = actor.userId ? eq(posts.authorId, actor.userId) : sql`false`; const admin = ["ADMIN", "OWNER"].includes(actor.role); const reviewer = ["EDITOR", "ADMIN", "OWNER"].includes(actor.role); const visibleVisibility = admin ? sql`true` : or(eq(posts.visibility, "PUBLIC"), eq(posts.visibility, "MEMBERS_ONLY"), and(eq(posts.visibility, "PRIVATE"), own)); const normal = and(isNull(posts.deletedAt), notInArray(posts.status, ["HIDDEN", "DELETED"]), visibleVisibility, or(eq(posts.status, "PUBLISHED"), own, reviewer ? sql`true` : sql`false`)); const restricted = and(or(isNotNull(posts.deletedAt), sql`${posts.status} in ('HIDDEN','DELETED')`), admin ? sql`true` : own); return or(normal, restricted); }
  private async syncTags(tx: typeof this.db, postId: string, names: string[]) { await tx.delete(postTags).where(eq(postTags.postId, postId)); for (const name of names) { const slug = name.toLowerCase().replace(/[^a-z0-9\p{Letter}]+/gu, "-"); const [tag] = await tx.insert(tags).values({ name, slug }).onConflictDoUpdate({ target: tags.slug, set: { name } }).returning(); await tx.insert(postTags).values({ postId, tagId: tag.id }).onConflictDoNothing(); } }
  private postShape(row: typeof posts.$inferSelect, tagNames: string[]): PostRecord { return { ...row, coverImage: row.coverImage, categoryId: row.categoryId, tags: tagNames, status: row.status as PostRecord["status"], visibility: row.visibility as PostRecord["visibility"] }; }
}
