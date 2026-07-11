import type { AuditEvent, InvitationRecord, PostRecord, PublishingPolicy, Role, SessionRecord, UserRecord, UserStatus, Visibility } from "./domain";

export type SessionWithUser = { session: SessionRecord; user: UserRecord };
export type NewPost = Pick<PostRecord, "authorId" | "title" | "slug" | "summary" | "content" | "contentHtml" | "visibility"> & { coverImage?: string | null; categoryId?: string | null; tags?: string[] };
export type PostChanges = Partial<Pick<PostRecord, "title" | "slug" | "summary" | "content" | "contentHtml" | "coverImage" | "categoryId" | "tags" | "visibility">>;

export interface Repository {
  findUserByLogin(login: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  listUsers(): Promise<Array<Omit<UserRecord, "passwordHash">>>;
  acceptInvitation(input: { tokenHash: string; passwordHash: string; handle: string; displayName: string; now: Date }): Promise<UserRecord | null>;
  createInvitation(input: { email: string; tokenHash: string; role: Exclude<Role, "VISITOR">; publishingPolicy: PublishingPolicy; invitedBy: string; expiresAt: Date }): Promise<InvitationRecord>;
  revokeInvitation(id: string, now: Date): Promise<boolean>;
  updateUserAccess(id: string, changes: { role?: Exclude<Role, "VISITOR">; publishingPolicy?: PublishingPolicy; status?: UserStatus }, now: Date): Promise<UserRecord | null>;
  updateUserProfile(id: string, changes: { displayName?: string; bio?: string | null; avatarKey?: string | null }, now: Date): Promise<UserRecord | null>;
  updatePassword(id: string, passwordHash: string, now: Date): Promise<void>;
  createSession(input: { userId: string; tokenHash: string; csrfHash: string; expiresAt: Date; ipHash?: string; userAgent?: string; now: Date }): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null>;
  revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<void>;
  revokeAllUserSessions(userId: string, now: Date): Promise<void>;
  getLoginLimit(keyHash: string, now: Date): Promise<{ count: number; lockedUntil?: Date | null }>;
  recordLoginFailure(keyHash: string, now: Date): Promise<void>;
  clearLoginFailures(keyHash: string): Promise<void>;
  audit(event: AuditEvent): Promise<void>;
  listAudit(limit?: number): Promise<Array<AuditEvent & { createdAt: Date }>>;

  createPost(input: NewPost, now: Date): Promise<PostRecord>;
  findPostById(id: string): Promise<PostRecord | null>;
  findPostBySlug(slug: string): Promise<PostRecord | null>;
  listPosts(input: { actorId?: string; status?: PostRecord["status"]; visibility?: Visibility; search?: string; authorId?: string }): Promise<PostRecord[]>;
  updatePost(id: string, changes: PostChanges, expectedRevision: number, now: Date): Promise<PostRecord | null>;
  transitionPost(id: string, changes: Partial<Pick<PostRecord, "status" | "submittedAt" | "reviewedAt" | "reviewedBy" | "reviewReason" | "publishedAt" | "deletedAt">>, now: Date): Promise<PostRecord | null>;
}
