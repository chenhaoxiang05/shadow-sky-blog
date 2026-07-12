import { canReadPost, hasRole } from "./authorization";
import { DomainError, type Actor, type MediaAssetRecord, type MediaPurpose } from "./domain";
import type { Repository } from "./repository";
import type { StorageProvider } from "./storage";

const types = [
  { mime: "image/png", ext: "png", test: (b: Uint8Array) => b.length > 8 && [137,80,78,71,13,10,26,10].every((v, i) => b[i] === v) },
  { mime: "image/jpeg", ext: "jpg", test: (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b: Uint8Array) => b.length > 12 && text(b, 0, 4) === "RIFF" && text(b, 8, 12) === "WEBP" },
  { mime: "image/gif", ext: "gif", test: (b: Uint8Array) => b.length > 6 && ["GIF87a", "GIF89a"].includes(text(b, 0, 6)) },
] as const;

export type MediaCleanupTask = Pick<MediaAssetRecord, "id" | "storageKey">;
export type MediaCleanupResult = { completed: number; failed: number };

export class MediaService {
  constructor(private repo: Repository, private storage: StorageProvider) {}

  withRepository(repository: Repository) { return new MediaService(repository, this.storage); }

  async upload(actor: Actor, input: { data: Uint8Array; declaredMime: string; purpose: MediaPurpose; requestId: string }) {
    if (!hasRole(actor, input.purpose === "AVATAR" ? "MEMBER" : "CONTRIBUTOR")) throw new DomainError("FORBIDDEN", "当前角色不能上传此类图片", 403);
    const max = input.purpose === "AVATAR" ? 5_000_000 : 10_000_000;
    if (!input.data.length || input.data.length > max) throw new DomainError("INVALID_INPUT", `图片大小必须小于 ${max / 1_000_000}MB`, 400);
    const detected = types.find((type) => type.test(input.data));
    if (!detected || detected.mime !== input.declaredMime) throw new DomainError("INVALID_INPUT", "文件内容与允许的图片类型不匹配", 400);
    const storageKey = await this.storage.put(input.data, detected.ext);
    try {
      const buffer = new ArrayBuffer(input.data.byteLength); new Uint8Array(buffer).set(input.data);
      const sha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
      const asset = await this.repo.transaction(async (repo) => {
        const created = await repo.createMediaAsset({ ownerId: actor.userId!, purpose: input.purpose, storageKey, mimeType: detected.mime, byteSize: input.data.length, sha256 });
        await repo.audit({ actorId: actor.userId, action: "MEDIA_UPLOADED", targetType: "MEDIA", targetId: created.id, requestId: input.requestId, metadata: { purpose: input.purpose, mimeType: detected.mime, byteSize: input.data.length } });
        return created;
      });
      return { ...asset, url: mediaUrl(asset.id) };
    } catch (error) { await this.storage.delete(storageKey); throw error; }
  }

  async read(actor: Actor, id: string) {
    const asset = await this.requiredAsset(id); let publiclyCacheable = false;
    if (asset.purpose === "AVATAR" && asset.linkedUserId) {
      const user = await this.repo.findUserById(asset.linkedUserId);
      const publicAvatar = Boolean(user && user.status === "ACTIVE" && !user.deletedAt && user.avatarKey === mediaUrl(asset.id));
      if (!publicAvatar && !this.canManage(actor, asset)) throw new DomainError("NOT_FOUND", "图片不存在", 404);
      publiclyCacheable = publicAvatar;
    } else if ((asset.purpose === "COVER" || asset.purpose === "CONTENT") && asset.linkedPostId) {
      const post = await this.repo.findPostById(asset.linkedPostId);
      if (!post || !canReadPost(actor, post)) throw new DomainError("NOT_FOUND", "图片不存在", 404);
      publiclyCacheable = post.status === "PUBLISHED" && post.visibility === "PUBLIC" && !post.deletedAt;
    } else if (!this.canManage(actor, asset)) throw new DomainError("NOT_FOUND", "图片不存在", 404);
    return { asset, data: await this.storage.get(asset.storageKey), cacheControl: publiclyCacheable ? "public, max-age=60, must-revalidate" : "private, no-store" };
  }

  async setAvatar(actor: Actor, url: string | null, requestId: string, now = new Date()) {
    const result = await this.repo.transaction(async (repo) => {
      const media = this.withRepository(repo);
      const user = await repo.findUserById(actor.userId!); if (!user) throw new DomainError("NOT_FOUND", "用户不存在", 404);
      const previousId = parseMediaId(user.avatarKey); const nextId = parseMediaId(url);
      if (url && !nextId) throw new DomainError("INVALID_INPUT", "头像必须使用内部媒体地址", 400);
      if (nextId) { const asset = await media.requiredAsset(nextId); media.assertBinding(actor, asset, "AVATAR"); if (asset.linkedPostId || (asset.linkedUserId && asset.linkedUserId !== user.id)) throw new DomainError("CONFLICT", "媒体已被其他内容使用", 409); await repo.bindMediaToUser(asset.id, user.id); await repo.audit({ actorId: actor.userId, action: "MEDIA_BOUND", targetType: "MEDIA", targetId: asset.id, requestId, metadata: { usage: "AVATAR", userId: user.id } }); }
      const updated = await repo.updateUserProfile(user.id, { avatarKey: url }, now); if (!updated) throw new DomainError("NOT_FOUND", "用户不存在", 404);
      const cleanup = previousId && previousId !== nextId ? [await media.queueRetirement(previousId, actor, requestId, now)].filter(Boolean) as MediaCleanupTask[] : [];
      return { updated, cleanup };
    });
    await this.cleanupAfterCommit(result.cleanup, requestId, now);
    return result.updated;
  }

  async validatePostMedia(actor: Actor, coverImage: string | null | undefined, content: string, postId?: string) {
    const refs = this.postReferences(coverImage, content);
    for (const ref of refs) { const asset = await this.requiredAsset(ref.id); this.assertBinding(actor, asset, ref.purpose); if (asset.linkedUserId || (asset.linkedPostId && asset.linkedPostId !== postId)) throw new DomainError("CONFLICT", "媒体已被其他内容使用", 409); }
    return refs;
  }

  async bindPostMedia(actor: Actor, postId: string, coverImage: string | null | undefined, content: string, requestId: string, now = new Date()) {
    const refs = await this.validatePostMedia(actor, coverImage, content, postId); const currentIds = new Set(refs.map((ref) => ref.id)); const cleanup: MediaCleanupTask[] = [];
    for (const ref of refs) { await this.repo.bindMediaToPost(ref.id, postId); await this.repo.audit({ actorId: actor.userId, action: "MEDIA_BOUND", targetType: "MEDIA", targetId: ref.id, requestId, metadata: { usage: ref.purpose, postId } }); }
    for (const old of await this.repo.listMediaAssetsForPost(postId)) if (!currentIds.has(old.id)) { const task = await this.queueRetirement(old.id, actor, requestId, now); if (task) cleanup.push(task); }
    return cleanup;
  }

  async delete(actor: Actor, id: string, requestId: string, now = new Date()) {
    const cleanup = await this.repo.transaction(async (repo) => {
      const media = this.withRepository(repo); const asset = await media.requiredAsset(id);
      if (!media.canManage(actor, asset)) throw new DomainError("FORBIDDEN", "不能删除此图片", 403);
      if (asset.linkedPostId || asset.linkedUserId) throw new DomainError("CONFLICT", "媒体仍被内容引用，不能删除", 409);
      const task = await media.queueRetirement(id, actor, requestId, now); return task ? [task] : [];
    });
    await this.cleanupAfterCommit(cleanup, requestId, now);
    return { ok: true };
  }

  async cleanupAfterCommit(tasks: MediaCleanupTask[], requestId: string, now = new Date()): Promise<MediaCleanupResult> {
    let completed = 0; let failed = 0;
    for (const task of tasks) {
      try {
        await this.storage.delete(task.storageKey);
        if (await this.repo.markMediaCleanupCompleted(task.id, now)) {
          completed++;
          await this.repo.audit({ action: "MEDIA_CLEANUP_COMPLETED", targetType: "MEDIA", targetId: task.id, requestId });
        }
      } catch {
        failed++;
        try {
          await this.repo.recordMediaCleanupFailure(task.id, "STORAGE_DELETE_FAILED", now);
          await this.repo.audit({ action: "MEDIA_CLEANUP_FAILED", targetType: "MEDIA", targetId: task.id, requestId, outcome: "FAILURE", reason: "STORAGE_DELETE_FAILED" });
        } catch { console.error("MEDIA_CLEANUP_STATE_UPDATE_FAILED"); }
        console.error("MEDIA_CLEANUP_FAILED");
      }
    }
    return { completed, failed };
  }

  async prunePending(limit = 100, requestId = crypto.randomUUID(), now = new Date()) {
    const pending = await this.repo.listPendingMediaCleanup(limit);
    return this.cleanupAfterCommit(pending.map(({ id, storageKey }) => ({ id, storageKey })), requestId, now);
  }

  private async requiredAsset(id: string) { const asset = await this.repo.findMediaAssetById(id); if (!asset) throw new DomainError("NOT_FOUND", "图片不存在", 404); return asset; }
  private canManage(actor: Actor, asset: MediaAssetRecord) { return actor.userId === asset.ownerId || hasRole(actor, "ADMIN"); }
  private assertBinding(actor: Actor, asset: MediaAssetRecord, purpose: MediaPurpose) { if (asset.purpose !== purpose) throw new DomainError("INVALID_INPUT", "媒体用途与使用位置不匹配", 400); if (!this.canManage(actor, asset)) throw new DomainError("FORBIDDEN", "不能引用其他用户的媒体", 403); }
  private postReferences(coverImage: string | null | undefined, content: string) { const refs: Array<{ id: string; purpose: "COVER" | "CONTENT" }> = []; const coverId = parseMediaId(coverImage); if (coverImage?.startsWith("/api/media/") && !coverId) throw new DomainError("INVALID_INPUT", "封面媒体地址无效", 400); if (coverId) refs.push({ id: coverId, purpose: "COVER" }); const ids = new Set<string>(); for (const match of content.matchAll(/\/api\/media\/([0-9a-f-]{36})/g)) ids.add(match[1]); for (const id of ids) refs.push({ id, purpose: "CONTENT" }); return refs; }
  private async queueRetirement(id: string, actor: Actor, requestId: string, now: Date): Promise<MediaCleanupTask | null> { const asset = await this.requiredAsset(id); const deleted = await this.repo.softDeleteMedia(id, now); if (!deleted) return null; await this.repo.audit({ actorId: actor.userId, action: "MEDIA_DELETED", targetType: "MEDIA", targetId: id, requestId }); return { id: asset.id, storageKey: asset.storageKey }; }
}

export const mediaUrl = (id: string) => `/api/media/${id}`;
export function parseMediaId(value: string | null | undefined) { return value?.match(/^\/api\/media\/([0-9a-f-]{36})$/)?.[1] ?? null; }
function text(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.slice(start, end)); }
function bytesToHex(bytes: Uint8Array) { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
