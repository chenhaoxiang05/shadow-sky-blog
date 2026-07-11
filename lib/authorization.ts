/** Portable, server-side authorization policy. UI visibility is never authoritative. */
export const roles = ["VISITOR", "MEMBER", "CONTRIBUTOR", "AUTHOR", "EDITOR", "ADMIN", "OWNER"] as const;
export type Role = (typeof roles)[number];
export type PostStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "HIDDEN";
export type Visibility = "PUBLIC" | "MEMBERS" | "PRIVATE";

const level: Record<Role, number> = {
  VISITOR: 0, MEMBER: 1, CONTRIBUTOR: 2, AUTHOR: 3, EDITOR: 4, ADMIN: 5, OWNER: 6,
};

export type Actor = { userId?: string; role: Role; disabled?: boolean };
export type PostResource = { authorId: string; status: PostStatus; visibility: Visibility };

export function canReadPost(actor: Actor, post: PostResource) {
  if (post.status === "HIDDEN" && level[actor.role] < level.ADMIN) return post.authorId === actor.userId;
  if (post.visibility === "PUBLIC") return post.status === "PUBLISHED" || post.authorId === actor.userId || level[actor.role] >= level.EDITOR;
  if (post.visibility === "MEMBERS") return level[actor.role] >= level.MEMBER && (post.status === "PUBLISHED" || post.authorId === actor.userId || level[actor.role] >= level.EDITOR);
  return post.authorId === actor.userId || level[actor.role] >= level.ADMIN;
}

export function canCreatePost(actor: Actor) { return !actor.disabled && level[actor.role] >= level.CONTRIBUTOR; }
export function canPublishOwnPost(actor: Actor) { return !actor.disabled && level[actor.role] >= level.AUTHOR; }
export function canSubmitForReview(actor: Actor, post: PostResource) { return !actor.disabled && actor.userId === post.authorId && level[actor.role] >= level.CONTRIBUTOR; }
export function canReviewPosts(actor: Actor) { return !actor.disabled && level[actor.role] >= level.EDITOR; }
export function canModerateComments(actor: Actor) { return !actor.disabled && level[actor.role] >= level.ADMIN; }
export function canManageUsers(actor: Actor) { return !actor.disabled && level[actor.role] >= level.ADMIN; }
export function canManageSite(actor: Actor) { return !actor.disabled && actor.role === "OWNER"; }

export function requirePermission(allowed: boolean): asserts allowed {
  if (!allowed) throw new Error("FORBIDDEN");
}
