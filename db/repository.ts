import { and, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { AuditEvent, InvitationRecord, PostRecord, PublishingPolicy, Role, SessionRecord, UserRecord, UserStatus } from "../lib/domain";
import type { NewPost, PostChanges, Repository, SessionWithUser } from "../lib/repository";
import { getDb } from "./index";
import { auditLogs, invitations, loginAttempts, posts, postTags, sessions, tags, users } from "./schema";

const userShape = (row: typeof users.$inferSelect): UserRecord => ({ ...row, role: row.role as Exclude<Role, "VISITOR">, publishingPolicy: row.publishingPolicy as PublishingPolicy, status: row.status as UserStatus });
const inviteShape = (row: typeof invitations.$inferSelect): InvitationRecord => ({ ...row, role: row.role as Exclude<Role, "VISITOR">, publishingPolicy: row.publishingPolicy as PublishingPolicy });

export class PostgresRepository implements Repository {
  private db = getDb();
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
  async updateUserProfile(id: string, changes: { displayName?: string; bio?: string | null; avatarKey?: string | null }, now: Date) { const [row] = await this.db.update(users).set({ ...changes, updatedAt: now }).where(and(eq(users.id, id), isNull(users.deletedAt))).returning(); return row ? userShape(row) : null; }
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

  private async tagsFor(postId: string) { const rows = await this.db.select({ name: tags.name }).from(postTags).innerJoin(tags, eq(tags.id, postTags.tagId)).where(eq(postTags.postId, postId)); return rows.map((row) => row.name); }
  private async syncTags(tx: typeof this.db, postId: string, names: string[]) { await tx.delete(postTags).where(eq(postTags.postId, postId)); for (const name of names) { const slug = name.toLowerCase().replace(/[^a-z0-9\p{Letter}]+/gu, "-"); const [tag] = await tx.insert(tags).values({ name, slug }).onConflictDoUpdate({ target: tags.slug, set: { name } }).returning(); await tx.insert(postTags).values({ postId, tagId: tag.id }).onConflictDoNothing(); } }
  private postShape(row: typeof posts.$inferSelect, tagNames: string[]): PostRecord { return { ...row, coverImage: row.coverImage, categoryId: row.categoryId, tags: tagNames, status: row.status as PostRecord["status"], visibility: row.visibility as PostRecord["visibility"] }; }
}
