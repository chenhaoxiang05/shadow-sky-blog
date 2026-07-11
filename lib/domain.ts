export const roles = ["VISITOR", "MEMBER", "CONTRIBUTOR", "AUTHOR", "EDITOR", "ADMIN", "OWNER"] as const;
export type Role = (typeof roles)[number];
export type UserStatus = "ACTIVE" | "DISABLED";
export type PublishingPolicy = "REVIEW_REQUIRED" | "DIRECT_PUBLISH";
export type PostStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "HIDDEN" | "DELETED";
export type Visibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

export type Actor = { userId?: string; role: Role; status: UserStatus; publishingPolicy: PublishingPolicy };
export type UserRecord = { id: string; email?: string | null; handle: string; displayName: string; bio?: string | null; avatarKey?: string | null; githubUrl?: string | null; websiteUrl?: string | null; passwordHash: string; role: Exclude<Role, "VISITOR">; status: UserStatus; publishingPolicy: PublishingPolicy; mustChangePassword: boolean; deletedAt?: Date | null };
export type InvitationRecord = { id: string; tokenHash: string; role: Exclude<Role, "VISITOR">; publishingPolicy: PublishingPolicy; invitedBy: string; note?: string | null; expiresAt: Date; acceptedAt?: Date | null; revokedAt?: Date | null; createdAt?: Date };
export type SessionRecord = { id: string; userId: string; tokenHash: string; csrfHash: string; expiresAt: Date; revokedAt?: Date | null };
export type PostRecord = { id: string; authorId: string; title: string; slug: string; summary: string; content: string; contentHtml: string; coverImage?: string | null; categoryId?: string | null; tags: string[]; status: PostStatus; visibility: Visibility; submittedAt?: Date | null; reviewedAt?: Date | null; reviewedBy?: string | null; reviewReason?: string | null; publishedAt?: Date | null; deletedAt?: Date | null; viewCount?: number; likeCount?: number; revision: number; createdAt: Date; updatedAt: Date };
export type CommentStatus = "VISIBLE" | "PENDING" | "HIDDEN" | "DELETED";
export type CommentRecord = { id: string; postId: string; authorId: string; parentId?: string | null; body: string; status: CommentStatus; deletedAt?: Date | null; createdAt: Date; updatedAt: Date };
export type MediaAssetRecord = { id: string; ownerId: string; storageKey: string; mimeType: string; byteSize: number; width?: number | null; height?: number | null; sha256: string; deletedAt?: Date | null; createdAt: Date };
export type PublicProfile = { id: string; handle: string; displayName: string; bio?: string | null; avatarUrl?: string | null; githubUrl?: string | null; websiteUrl?: string | null; articleCount: number; likeCount: number };

export type AuditAction = "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT" | "PASSWORD_CHANGED" | "ADMIN_PASSWORD_RESET" | "OWNER_PASSWORD_MAINTENANCE_RESET" | "INVITATION_CREATED" | "INVITATION_ACCEPTED" | "INVITATION_REVOKED" | "USER_CREATED" | "USER_STATUS_CHANGED" | "USER_ROLE_CHANGED" | "PUBLISHING_POLICY_CHANGED" | "SECURITY_AUTHORIZATION_DENIED" | "POST_CREATED" | "POST_UPDATED" | "POST_SUBMITTED" | "POST_APPROVED" | "POST_REJECTED" | "POST_PUBLISHED" | "POST_HIDDEN" | "POST_DELETED" | "POST_RESTORED" | "COMMENT_CREATED" | "COMMENT_UPDATED" | "COMMENT_DELETED" | "COMMENT_MODERATED" | "POST_LIKED" | "POST_UNLIKED" | "BOOKMARK_ADDED" | "BOOKMARK_REMOVED" | "MEDIA_UPLOADED";
export type AuditEvent = { actorId?: string; action: AuditAction; targetType: "AUTH" | "USER" | "INVITATION" | "POST" | "COMMENT" | "MEDIA"; targetId?: string; requestId: string; outcome?: "SUCCESS" | "FAILURE"; reason?: string; metadata?: Record<string, unknown> };
export const defaultPublishingPolicy = (role: Exclude<Role, "VISITOR">): PublishingPolicy => ["OWNER", "ADMIN", "EDITOR"].includes(role) ? "DIRECT_PUBLISH" : "REVIEW_REQUIRED";

export class DomainError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT" | "RATE_LIMITED" | "SESSION_EXPIRED" | "PASSWORD_CHANGE_REQUIRED", message: string, public status: number) { super(message); }
}
