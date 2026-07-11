import type { AuditEvent, InvitationRecord, PostRecord, PublishingPolicy, Role, SessionRecord, UserRecord, UserStatus } from "../../lib/domain";
import type { NewPost, PostChanges, Repository } from "../../lib/repository";

export class MemoryRepository implements Repository {
  users = new Map<string, UserRecord>(); invitations = new Map<string, InvitationRecord>(); sessions = new Map<string, SessionRecord>(); posts = new Map<string, PostRecord>(); audits: Array<AuditEvent & { createdAt: Date }> = []; failures = new Map<string, { count: number; lockedUntil?: Date | null }>();
  addUser(user: UserRecord) { this.users.set(user.id, user); return user; }
  addInvitation(invitation: InvitationRecord) { this.invitations.set(invitation.id, invitation); return invitation; }
  addPost(post: PostRecord) { this.posts.set(post.id, post); return post; }
  async findUserByLogin(login: string) { return [...this.users.values()].find((u) => !u.deletedAt && u.handle === login) ?? null; }
  async findUserById(id: string) { const user = this.users.get(id); return user && !user.deletedAt ? structuredClone(user) : null; }
  async listUsers() { return [...this.users.values()].filter((u) => !u.deletedAt).map((user) => { const safe: Partial<UserRecord> = structuredClone(user); delete safe.passwordHash; return safe as Omit<UserRecord, "passwordHash">; }); }
  async acceptInvitation(input: { tokenHash: string; passwordHash: string; handle: string; displayName: string; now: Date }) { const invite = [...this.invitations.values()].find((i) => i.tokenHash === input.tokenHash && !i.acceptedAt && !i.revokedAt && i.expiresAt > input.now); if (!invite) return null; invite.acceptedAt = input.now; const user: UserRecord = { id: crypto.randomUUID(), handle: input.handle, displayName: input.displayName, passwordHash: input.passwordHash, role: invite.role, status: "ACTIVE", publishingPolicy: invite.publishingPolicy, mustChangePassword: false }; this.users.set(user.id, user); return structuredClone(user); }
  async createInvitation(input: { tokenHash: string; role: Exclude<Role, "VISITOR">; publishingPolicy: PublishingPolicy; invitedBy: string; note?: string | null; expiresAt: Date }) { const row: InvitationRecord = { id: crypto.randomUUID(), createdAt: new Date(), ...input }; this.invitations.set(row.id, row); return structuredClone(row); }
  async findInvitationById(id: string) { const row = this.invitations.get(id); return row ? structuredClone(row) : null; }
  async listInvitations() { return structuredClone([...this.invitations.values()]); }
  async revokeInvitation(id: string, now: Date) { const row = this.invitations.get(id); if (!row || row.acceptedAt || row.revokedAt) return false; row.revokedAt = now; return true; }
  async updateUserAccess(id: string, changes: { role?: Exclude<Role, "VISITOR">; publishingPolicy?: PublishingPolicy; status?: UserStatus }) { const row = this.users.get(id); if (!row) return null; Object.assign(row, changes); return structuredClone(row); }
  async updateUserProfile(id: string, changes: { displayName?: string; bio?: string | null; avatarKey?: string | null }) { const row = this.users.get(id); if (!row) return null; Object.assign(row, changes); return structuredClone(row); }
  async updatePassword(id: string, passwordHash: string, mustChangePassword: boolean) { const row = this.users.get(id); if (row) { row.passwordHash = passwordHash; row.mustChangePassword = mustChangePassword; } }
  async createSession(input: { userId: string; tokenHash: string; csrfHash: string; expiresAt: Date; now: Date }) { const row: SessionRecord = { id: crypto.randomUUID(), userId: input.userId, tokenHash: input.tokenHash, csrfHash: input.csrfHash, expiresAt: input.expiresAt }; this.sessions.set(row.tokenHash, row); return structuredClone(row); }
  async findSessionByTokenHash(tokenHash: string) { const session = this.sessions.get(tokenHash); const user = session ? this.users.get(session.userId) : undefined; return session && user ? { session: structuredClone(session), user: structuredClone(user) } : null; }
  async revokeSessionByTokenHash(tokenHash: string, now: Date) { const row = this.sessions.get(tokenHash); if (row) row.revokedAt = now; }
  async revokeAllUserSessions(userId: string, now: Date) { for (const row of this.sessions.values()) if (row.userId === userId) row.revokedAt = now; }
  async getLoginLimit(keyHash: string) { return this.failures.get(keyHash) ?? { count: 0, lockedUntil: null }; }
  async recordLoginFailure(keyHash: string, now: Date) { const row = this.failures.get(keyHash) ?? { count: 0, lockedUntil: null }; row.count++; if (row.count >= 8) row.lockedUntil = new Date(now.getTime() + 900_000); this.failures.set(keyHash, row); }
  async clearLoginFailures(keyHash: string) { this.failures.delete(keyHash); }
  async audit(event: AuditEvent) { this.audits.push({ ...structuredClone(event), createdAt: new Date() }); }
  async listAudit(limit = 100) { return structuredClone(this.audits.slice(-limit).reverse()); }
  async createPost(input: NewPost, now: Date) { const row: PostRecord = { id: crypto.randomUUID(), ...input, tags: input.tags ?? [], status: "DRAFT", revision: 1, createdAt: now, updatedAt: now }; this.posts.set(row.id, row); return structuredClone(row); }
  async findPostById(id: string) { const row = this.posts.get(id); return row ? structuredClone(row) : null; }
  async findPostBySlug(slug: string) { const row = [...this.posts.values()].find((p) => p.slug === slug); return row ? structuredClone(row) : null; }
  async listPosts(input: { status?: PostRecord["status"]; search?: string; authorId?: string }) { return structuredClone([...this.posts.values()].filter((p) => (!input.status || p.status === input.status) && (!input.authorId || p.authorId === input.authorId) && (!input.search || `${p.title} ${p.summary}`.toLowerCase().includes(input.search.toLowerCase())))); }
  async updatePost(id: string, changes: PostChanges, expectedRevision: number, now: Date) { const row = this.posts.get(id); if (!row || row.revision !== expectedRevision) return null; Object.assign(row, changes, { revision: row.revision + 1, updatedAt: now }); return structuredClone(row); }
  async transitionPost(id: string, changes: Partial<Pick<PostRecord, "status" | "submittedAt" | "reviewedAt" | "reviewedBy" | "reviewReason" | "publishedAt" | "deletedAt">>, now: Date) { const row = this.posts.get(id); if (!row) return null; Object.assign(row, changes, { revision: row.revision + 1, updatedAt: now }); return structuredClone(row); }
}

export function actor(id: string, role: Role, publishingPolicy: PublishingPolicy = "REVIEW_REQUIRED") { return { userId: id, role, publishingPolicy, status: "ACTIVE" as const }; }
export function draft(authorId: string, overrides: Partial<PostRecord> = {}): PostRecord { const now = new Date("2026-07-12T00:00:00Z"); return { id: crypto.randomUUID(), authorId, title: "测试文章", slug: crypto.randomUUID(), summary: "摘要", content: "# 正文", contentHtml: "<h1>正文</h1>", tags: [], status: "DRAFT", visibility: "PUBLIC", revision: 1, createdAt: now, updatedAt: now, ...overrides }; }
