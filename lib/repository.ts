import type { Actor, AuditEvent, CommentRecord, InvitationRecord, MediaAssetRecord, MediaPurpose, PostRecord, PublicProfile, PublishingPolicy, Role, SessionRecord, UserRecord, UserStatus, Visibility } from "./domain";

export type SessionWithUser = { session: SessionRecord; user: UserRecord };
export type NewPost = Pick<PostRecord, "authorId" | "title" | "slug" | "summary" | "content" | "contentHtml" | "visibility"> & { coverImage?: string | null; categoryId?: string | null; tags?: string[] };
export type PostChanges = Partial<Pick<PostRecord, "title" | "slug" | "summary" | "content" | "contentHtml" | "coverImage" | "categoryId" | "tags" | "visibility">>;
export type SearchInput = { actor: Actor; q?: string; page: number; pageSize: number; category?: string; tag?: string; author?: string; from?: Date; to?: Date };
export type SearchPage = { posts: PostRecord[]; total: number; page: number; pageSize: number; nextPage: number | null };

export interface Repository {
  findUserByLogin(login: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  listUsers(): Promise<Array<Omit<UserRecord, "passwordHash">>>;
  acceptInvitation(input: { tokenHash: string; passwordHash: string; handle: string; displayName: string; now: Date }): Promise<UserRecord | null>;
  createInvitation(input: { tokenHash: string; role: Exclude<Role, "VISITOR">; publishingPolicy: PublishingPolicy; invitedBy: string; note?: string | null; expiresAt: Date }): Promise<InvitationRecord>;
  findInvitationById(id: string): Promise<InvitationRecord | null>;
  listInvitations(): Promise<InvitationRecord[]>;
  revokeInvitation(id: string, now: Date): Promise<boolean>;
  updateUserAccess(id: string, changes: { role?: Exclude<Role, "VISITOR">; publishingPolicy?: PublishingPolicy; status?: UserStatus }, now: Date): Promise<UserRecord | null>;
  updateUserProfile(id: string, changes: { displayName?: string; bio?: string | null; avatarKey?: string | null; githubUrl?: string | null; websiteUrl?: string | null }, now: Date): Promise<UserRecord | null>;
  findPublicProfile(handle: string): Promise<PublicProfile | null>;
  updatePassword(id: string, passwordHash: string, mustChangePassword: boolean, now: Date): Promise<void>;
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
  searchPosts(input: SearchInput): Promise<SearchPage>;
  createComment(input: { postId: string; authorId: string; parentId?: string | null; depth: number; body: string }, now: Date): Promise<CommentRecord>;
  findCommentById(id: string): Promise<CommentRecord | null>;
  listComments(postId: string): Promise<CommentRecord[]>;
  countRecentComments(authorId: string, since: Date): Promise<number>;
  updateComment(id: string, body: string, now: Date): Promise<CommentRecord | null>;
  softDeleteComment(id: string, status: "DELETED" | "HIDDEN", now: Date): Promise<CommentRecord | null>;
  restoreComment(id: string, now: Date): Promise<CommentRecord | null>;
  setLike(userId: string, postId: string, liked: boolean, now: Date): Promise<{ active: boolean; likeCount: number }>;
  setBookmark(userId: string, postId: string, bookmarked: boolean, now: Date): Promise<boolean>;
  listBookmarkedPosts(userId: string): Promise<PostRecord[]>;
  createMediaAsset(input: Omit<MediaAssetRecord, "id" | "createdAt" | "deletedAt" | "linkedUserId" | "linkedPostId"> & { purpose: MediaPurpose }): Promise<MediaAssetRecord>;
  findMediaAssetById(id: string): Promise<MediaAssetRecord | null>;
  listMediaAssetsForPost(postId: string): Promise<MediaAssetRecord[]>;
  bindMediaToUser(id: string, userId: string): Promise<MediaAssetRecord | null>;
  bindMediaToPost(id: string, postId: string): Promise<MediaAssetRecord | null>;
  unbindMedia(id: string): Promise<MediaAssetRecord | null>;
  softDeleteMedia(id: string, now: Date): Promise<MediaAssetRecord | null>;
}
