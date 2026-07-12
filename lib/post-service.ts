import { canCreatePost, canDirectPublish, canEditPost, canHidePost, canReadPost, canReviewPost, canReviewPosts } from "./authorization";
import { DomainError, type Actor, type PostRecord, type Visibility } from "./domain";
import { renderSafeMarkdown, slugify } from "./content";
import type { PostChanges, Repository } from "./repository";
import type { MediaService } from "./media-service";

export class PostService {
  constructor(private repo: Repository, private media?: MediaService) {}

  async create(actor: Actor, input: { title: string; slug?: string; summary: string; content: string; visibility: Visibility; coverImage?: string | null; categoryId?: string | null; tags?: string[]; requestId: string }, now = new Date()) {
    if (!canCreatePost(actor)) throw new DomainError("FORBIDDEN", "当前角色不能创建文章", 403);
    const contentHtml = await renderSafeMarkdown(input.content);
    return this.repo.transaction(async (repo) => {
      const media = this.media?.withRepository(repo);
      await media?.validatePostMedia(actor, input.coverImage, input.content);
      const post = await repo.createPost({ authorId: actor.userId!, title: input.title.trim(), slug: slugify(input.slug || input.title), summary: input.summary.trim(), content: input.content, contentHtml, visibility: input.visibility, coverImage: input.coverImage, categoryId: input.categoryId, tags: normalizeTags(input.tags) }, now);
      await media?.bindPostMedia(actor, post.id, post.coverImage, post.content, input.requestId, now);
      await repo.audit({ actorId: actor.userId, action: "POST_CREATED", targetType: "POST", targetId: post.id, requestId: input.requestId });
      return post;
    });
  }

  async update(actor: Actor, id: string, input: PostChanges & { expectedRevision: number; requestId: string }, now = new Date()) {
    const post = await this.requiredPost(id); if (!canEditPost(actor, post)) throw new DomainError("FORBIDDEN", "不能修改此文章", 403);
    if (["PENDING_REVIEW", "DELETED"].includes(post.status)) throw new DomainError("CONFLICT", "当前状态不能编辑", 409);
    const changes: PostChanges = { ...input };
    delete (changes as PostChanges & { expectedRevision?: number }).expectedRevision; delete (changes as PostChanges & { requestId?: string }).requestId;
    if (changes.title) changes.title = changes.title.trim(); if (changes.slug) changes.slug = slugify(changes.slug); if (changes.content !== undefined) changes.contentHtml = await renderSafeMarkdown(changes.content); if (changes.tags) changes.tags = normalizeTags(changes.tags);
    return this.repo.transaction(async (repo) => {
      const media = this.media?.withRepository(repo);
      await media?.validatePostMedia(actor, changes.coverImage !== undefined ? changes.coverImage : post.coverImage, changes.content ?? post.content, post.id);
      const updated = await repo.updatePost(id, changes, input.expectedRevision, now); if (!updated) throw new DomainError("CONFLICT", "文章已被其他编辑更新，请刷新后重试", 409);
      await media?.bindPostMedia(actor, updated.id, updated.coverImage, updated.content, input.requestId, now);
      await repo.audit({ actorId: actor.userId, action: "POST_UPDATED", targetType: "POST", targetId: id, requestId: input.requestId, metadata: { revision: updated.revision } });
      return updated;
    });
  }

  async submit(actor: Actor, id: string, requestId: string, now = new Date()) {
    const post = await this.requiredPost(id); if (post.authorId !== actor.userId || !canCreatePost(actor)) throw new DomainError("FORBIDDEN", "只能提交自己的文章", 403);
    if (!["DRAFT", "REJECTED"].includes(post.status)) throw new DomainError("CONFLICT", "当前状态不能提交审核", 409);
    const updated = await this.repo.transitionPost(id, { status: "PENDING_REVIEW", submittedAt: now, reviewedAt: null, reviewedBy: null, reviewReason: null }, now);
    await this.repo.audit({ actorId: actor.userId, action: "POST_SUBMITTED", targetType: "POST", targetId: id, requestId }); return updated!;
  }

  async publish(actor: Actor, id: string, requestId: string, now = new Date()) {
    const post = await this.requiredPost(id); if (!canDirectPublish(actor, post)) throw new DomainError("FORBIDDEN", "此账户需要先提交审核，或文章不属于当前用户", 403);
    if (!["DRAFT", "REJECTED", "HIDDEN"].includes(post.status)) throw new DomainError("CONFLICT", "当前状态不能直接发布", 409);
    const updated = await this.repo.transitionPost(id, { status: "PUBLISHED", publishedAt: now, reviewedAt: null, reviewedBy: null, reviewReason: null, deletedAt: null }, now);
    await this.repo.audit({ actorId: actor.userId, action: "POST_PUBLISHED", targetType: "POST", targetId: id, requestId, metadata: { mode: "DIRECT_PUBLISH" } }); return updated!;
  }

  async review(actor: Actor, id: string, decision: "APPROVE" | "REJECT", reason: string | undefined, requestId: string, now = new Date()) {
    const post = await this.requiredPost(id); if (!canReviewPost(actor, post)) throw new DomainError("FORBIDDEN", actor.userId === post.authorId ? "审核人不能审核自己的投稿" : "没有审核权限", 403);
    if (decision === "REJECT" && (!reason || reason.trim().length < 3)) throw new DomainError("INVALID_INPUT", "退回时必须填写原因", 400);
    const approved = decision === "APPROVE";
    const updated = await this.repo.transitionPost(id, { status: approved ? "PUBLISHED" : "REJECTED", reviewedAt: now, reviewedBy: actor.userId, reviewReason: reason?.trim() ?? null, publishedAt: approved ? now : null }, now);
    await this.repo.audit({ actorId: actor.userId, action: approved ? "POST_APPROVED" : "POST_REJECTED", targetType: "POST", targetId: id, requestId, reason }); return updated!;
  }

  async hide(actor: Actor, id: string, reason: string, requestId: string, now = new Date()) {
    const post = await this.requiredPost(id); if (!canHidePost(actor, post)) throw new DomainError("FORBIDDEN", "不能隐藏此文章", 403);
    const updated = await this.repo.transitionPost(id, { status: "HIDDEN", reviewReason: reason.trim() || "作者隐藏" }, now); await this.repo.audit({ actorId: actor.userId, action: "POST_HIDDEN", targetType: "POST", targetId: id, requestId, reason }); return updated!;
  }

  async softDelete(actor: Actor, id: string, requestId: string, now = new Date()) {
    const post = await this.requiredPost(id); if (!canEditPost(actor, post)) throw new DomainError("FORBIDDEN", "不能删除此文章", 403);
    const updated = await this.repo.transitionPost(id, { status: "DELETED", deletedAt: now }, now); await this.repo.audit({ actorId: actor.userId, action: "POST_DELETED", targetType: "POST", targetId: id, requestId }); return updated!;
  }

  async restore(actor: Actor, id: string, requestId: string, now = new Date()) {
    const post = await this.requiredPost(id); if (!canEditPost(actor, post)) throw new DomainError("FORBIDDEN", "不能恢复此文章", 403);
    const updated = await this.repo.transitionPost(id, { status: "DRAFT", deletedAt: null }, now); await this.repo.audit({ actorId: actor.userId, action: "POST_RESTORED", targetType: "POST", targetId: id, requestId }); return updated!;
  }

  async read(actor: Actor, idOrSlug: string) { const post = (await this.repo.findPostById(idOrSlug)) ?? (await this.repo.findPostBySlug(idOrSlug)); if (!post || !canReadPost(actor, post)) throw new DomainError("NOT_FOUND", "文章不存在", 404); return post; }
  async list(actor: Actor, input: { status?: PostRecord["status"]; search?: string; mine?: boolean }) { if (input.status === "PENDING_REVIEW" && !canReviewPosts(actor)) throw new DomainError("FORBIDDEN", "没有审核权限", 403); const rows = await this.repo.listPosts({ status: input.status, search: input.search, authorId: input.mine ? actor.userId : undefined, actorId: actor.userId }); return rows.filter((post) => canReadPost(actor, post)); }
  private async requiredPost(id: string) { const post = await this.repo.findPostById(id); if (!post) throw new DomainError("NOT_FOUND", "文章不存在", 404); return post; }
}

function normalizeTags(tags: string[] = []) { return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 10); }
