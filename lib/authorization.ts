import type { Actor, PostRecord, Role, UserRecord } from "./domain";

const level: Record<Role, number> = { VISITOR: 0, MEMBER: 1, CONTRIBUTOR: 2, AUTHOR: 3, EDITOR: 4, ADMIN: 5, OWNER: 6 };
export const isActive = (actor: Actor) => actor.status === "ACTIVE";
export const hasRole = (actor: Actor, minimum: Role) => isActive(actor) && level[actor.role] >= level[minimum];
export const canCreatePost = (actor: Actor) => hasRole(actor, "CONTRIBUTOR");
export const canReviewPosts = (actor: Actor) => hasRole(actor, "EDITOR");
export const canManageUsers = (actor: Actor) => hasRole(actor, "ADMIN");
export const canManageSite = (actor: Actor) => hasRole(actor, "OWNER");

const adminAssignableRoles: ReadonlySet<Role> = new Set(["MEMBER", "CONTRIBUTOR", "AUTHOR", "EDITOR"]);
const ownerAssignableRoles: ReadonlySet<Role> = new Set([...adminAssignableRoles, "ADMIN"]);
type ManagedTarget = Pick<UserRecord, "id" | "role">;

export function canManageTarget(actor: Actor, target: ManagedTarget) {
  if (!isActive(actor) || !actor.userId || actor.userId === target.id || target.role === "OWNER") return false;
  if (actor.role === "OWNER") return true;
  return actor.role === "ADMIN" && adminAssignableRoles.has(target.role);
}

export function canAssignRole(actor: Actor, targetRole: Role) {
  if (!isActive(actor) || targetRole === "VISITOR" || targetRole === "OWNER") return false;
  if (actor.role === "OWNER") return ownerAssignableRoles.has(targetRole);
  return actor.role === "ADMIN" && adminAssignableRoles.has(targetRole);
}

export const canCreateInvitationForRole = (actor: Actor, invitedRole: Role) => canAssignRole(actor, invitedRole);

export function canResetPassword(actor: Actor, target: ManagedTarget) {
  return canManageTarget(actor, target);
}

export function canReadPost(actor: Actor, post: PostRecord) {
  if (post.deletedAt || post.status === "DELETED") return hasRole(actor, "ADMIN") || actor.userId === post.authorId;
  if (post.status === "HIDDEN") return hasRole(actor, "ADMIN") || actor.userId === post.authorId;
  if (post.visibility === "PRIVATE") return hasRole(actor, "ADMIN") || actor.userId === post.authorId;
  if (post.visibility === "MEMBERS_ONLY" && !hasRole(actor, "MEMBER")) return false;
  return post.status === "PUBLISHED" || actor.userId === post.authorId || canReviewPosts(actor);
}

export const canEditPost = (actor: Actor, post: PostRecord) => isActive(actor) && (actor.userId === post.authorId || hasRole(actor, "ADMIN"));
export const canDirectPublish = (actor: Actor, post: PostRecord) => isActive(actor) && actor.publishingPolicy === "DIRECT_PUBLISH" && actor.userId === post.authorId;
export const canReviewPost = (actor: Actor, post: PostRecord) => canReviewPosts(actor) && actor.userId !== post.authorId && post.status === "PENDING_REVIEW";
export const canHidePost = (actor: Actor, post: PostRecord) => hasRole(actor, "EDITOR") || actor.userId === post.authorId;
