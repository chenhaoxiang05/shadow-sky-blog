import sanitizeHtml from "sanitize-html";
import { canReadPost, hasRole } from "./authorization";
import { DomainError, type Actor } from "./domain";
import type { Repository } from "./repository";

const COMMENT_LIMIT = 5;
const COMMENT_WINDOW_MS = 60_000;

export class CommunityService {
  constructor(private repo: Repository) {}

  async listComments(actor: Actor, postId: string) {
    await this.readablePost(actor, postId);
    return (await this.repo.listComments(postId)).map((comment) => comment.status === "VISIBLE" && !comment.deletedAt ? comment : { ...comment, body: comment.status === "HIDDEN" ? "此评论已被管理员隐藏" : "此评论已由作者删除" });
  }

  async createComment(actor: Actor, input: { postId: string; parentId?: string | null; body: string; requestId: string }, now = new Date()) {
    if (!hasRole(actor, "MEMBER")) throw new DomainError("UNAUTHENTICATED", "请先登录", 401);
    await this.readablePost(actor, input.postId);
    if (await this.repo.countRecentComments(actor.userId!, new Date(now.getTime() - COMMENT_WINDOW_MS)) >= COMMENT_LIMIT) throw new DomainError("RATE_LIMITED", "评论过于频繁，请稍后再试", 429);
    let parentId = input.parentId ?? null; let depth = 0;
    if (parentId) { const parent = await this.repo.findCommentById(parentId); if (!parent || parent.postId !== input.postId || parent.status !== "VISIBLE" || parent.deletedAt) throw new DomainError("INVALID_INPUT", "回复目标无效", 400); parentId = parent.depth === 0 ? parent.id : parent.parentId ?? null; depth = 1; if (!parentId) throw new DomainError("INVALID_INPUT", "回复层级无效", 400); }
    const body = cleanComment(input.body);
    const comment = await this.repo.createComment({ postId: input.postId, authorId: actor.userId!, parentId, depth, body }, now);
    await this.repo.audit({ actorId: actor.userId, action: "COMMENT_CREATED", targetType: "COMMENT", targetId: comment.id, requestId: input.requestId, metadata: { postId: input.postId } });
    return comment;
  }

  async updateComment(actor: Actor, id: string, bodyInput: string, requestId: string, now = new Date()) {
    const comment = await this.requiredComment(id);
    await this.readablePost(actor, comment.postId);
    if (comment.authorId !== actor.userId) throw new DomainError("FORBIDDEN", "只能修改自己的评论", 403);
    const updated = await this.repo.updateComment(id, cleanComment(bodyInput), now);
    if (!updated) throw new DomainError("CONFLICT", "评论当前不能修改", 409);
    await this.repo.audit({ actorId: actor.userId, action: "COMMENT_UPDATED", targetType: "COMMENT", targetId: id, requestId });
    return updated;
  }

  async deleteComment(actor: Actor, id: string, requestId: string, now = new Date()) {
    const comment = await this.requiredComment(id);
    await this.readablePost(actor, comment.postId);
    const own = comment.authorId === actor.userId;
    const moderator = hasRole(actor, "ADMIN");
    if (!own && !moderator) throw new DomainError("FORBIDDEN", "不能删除此评论", 403);
    const updated = await this.repo.softDeleteComment(id, own ? "DELETED" : "HIDDEN", now);
    await this.repo.audit({ actorId: actor.userId, action: moderator && !own ? "COMMENT_MODERATED" : "COMMENT_DELETED", targetType: "COMMENT", targetId: id, requestId });
    return updated!;
  }

  async restoreComment(actor: Actor, id: string, requestId: string, now = new Date()) {
    if (!hasRole(actor, "ADMIN")) throw new DomainError("FORBIDDEN", "权限不足", 403);
    const comment = await this.repo.findCommentById(id);
    if (!comment || comment.status !== "HIDDEN") throw new DomainError("NOT_FOUND", "可恢复的评论不存在", 404);
    await this.readablePost(actor, comment.postId);
    const restored = await this.repo.restoreComment(id, now); if (!restored) throw new DomainError("CONFLICT", "评论当前不能恢复", 409);
    await this.repo.audit({ actorId: actor.userId, action: "COMMENT_RESTORED", targetType: "COMMENT", targetId: id, requestId });
    return restored;
  }

  async setLike(actor: Actor, postId: string, active: boolean, requestId: string, now = new Date()) {
    if (!hasRole(actor, "MEMBER")) throw new DomainError("UNAUTHENTICATED", "请先登录", 401);
    await this.readablePost(actor, postId);
    const result = await this.repo.setLike(actor.userId!, postId, active, now);
    await this.repo.audit({ actorId: actor.userId, action: result.active ? "POST_LIKED" : "POST_UNLIKED", targetType: "POST", targetId: postId, requestId });
    return result;
  }

  async setBookmark(actor: Actor, postId: string, active: boolean, requestId: string, now = new Date()) {
    if (!hasRole(actor, "MEMBER")) throw new DomainError("UNAUTHENTICATED", "请先登录", 401);
    await this.readablePost(actor, postId);
    const current = await this.repo.setBookmark(actor.userId!, postId, active, now);
    await this.repo.audit({ actorId: actor.userId, action: current ? "BOOKMARK_ADDED" : "BOOKMARK_REMOVED", targetType: "POST", targetId: postId, requestId });
    return { active: current };
  }

  async bookmarks(actor: Actor) {
    if (!hasRole(actor, "MEMBER")) throw new DomainError("UNAUTHENTICATED", "请先登录", 401);
    const posts = await this.repo.listBookmarkedPosts(actor.userId!);
    return posts.filter((post) => canReadPost(actor, post));
  }

  private async readablePost(actor: Actor, id: string) { const post = await this.repo.findPostById(id); if (!post || !canReadPost(actor, post)) throw new DomainError("NOT_FOUND", "文章不存在", 404); return post; }
  private async requiredComment(id: string) { const comment = await this.repo.findCommentById(id); if (!comment || comment.deletedAt || !["VISIBLE", "HIDDEN"].includes(comment.status)) throw new DomainError("NOT_FOUND", "评论不存在", 404); return comment; }
}

function cleanComment(input: string) {
  const body = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
  if (!body || body.length > 4_000) throw new DomainError("INVALID_INPUT", "评论长度必须为 1–4000 字符", 400);
  return body;
}
