import assert from "node:assert/strict";
import test from "node:test";
import type { AuditEvent, MediaAssetRecord } from "../lib/domain";
import { MediaService, mediaUrl } from "../lib/media-service";
import { PostService } from "../lib/post-service";
import type { StorageProvider } from "../lib/storage";
import { MemoryRepository, actor, draft } from "./helpers/memory-repository";

class CleanupStorage implements StorageProvider {
  files = new Set<string>(); deleteCalls: string[] = []; failDeletes = 0; beforeDelete?: () => void;
  async put(_data: Uint8Array, extension: string) { const key = `${crypto.randomUUID()}.${extension}`; this.files.add(key); return key; }
  async get() { return new Uint8Array(); }
  async delete(key: string) { this.beforeDelete?.(); this.deleteCalls.push(key); if (this.failDeletes-- > 0) throw new Error("private storage path"); this.files.delete(key); }
}

async function cleanupSetup<T extends MemoryRepository>(repo: T, storage = new CleanupStorage()) {
  const post = repo.addPost(draft("author"));
  const oldMedia = await repo.createMediaAsset({ ownerId: "author", purpose: "COVER", storageKey: `${crypto.randomUUID()}.png`, mimeType: "image/png", byteSize: 9, sha256: "a".repeat(64) });
  const newMedia = await repo.createMediaAsset({ ownerId: "author", purpose: "COVER", storageKey: `${crypto.randomUUID()}.png`, mimeType: "image/png", byteSize: 9, sha256: "b".repeat(64) });
  storage.files.add(oldMedia.storageKey); storage.files.add(newMedia.storageKey);
  await repo.bindMediaToPost(oldMedia.id, post.id); Object.assign(post, { coverImage: mediaUrl(oldMedia.id) }); repo.posts.set(post.id, post);
  const media = new MediaService(repo, storage); const posts = new PostService(repo, media);
  return { repo, storage, post, oldMedia, newMedia, media, posts };
}

test("文章更新事务失败时不删除旧媒体物理文件", async () => {
  class FailingRepository extends MemoryRepository { override async softDeleteMedia(): Promise<never> { throw new Error("transaction failed"); } }
  const state = await cleanupSetup(new FailingRepository());
  await assert.rejects(state.posts.update(actor("author", "AUTHOR"), state.post.id, { coverImage: mediaUrl(state.newMedia.id), expectedRevision: 1, requestId: "tx-fail" }));
  assert.equal(state.storage.files.has(state.oldMedia.storageKey), true);
  assert.equal(state.storage.deleteCalls.length, 0);
});

test("审计失败回滚文章、媒体绑定且保留旧物理文件", async () => {
  class FailingAuditRepository extends MemoryRepository { override async audit(event: AuditEvent) { if (event.action === "POST_UPDATED") throw new Error("audit failed"); return super.audit(event); } }
  const state = await cleanupSetup(new FailingAuditRepository());
  await assert.rejects(state.posts.update(actor("author", "AUTHOR"), state.post.id, { coverImage: mediaUrl(state.newMedia.id), expectedRevision: 1, requestId: "audit-fail" }));
  assert.equal(state.repo.posts.get(state.post.id)?.coverImage, mediaUrl(state.oldMedia.id));
  assert.equal(state.repo.media.get(state.oldMedia.id)?.linkedPostId, state.post.id);
  assert.equal(state.repo.media.get(state.oldMedia.id)?.deletedAt, undefined);
  assert.equal(state.repo.media.get(state.newMedia.id)?.linkedPostId, null);
  assert.equal(state.storage.files.has(state.oldMedia.storageKey), true);
  assert.equal(state.storage.deleteCalls.length, 0);
});

test("只有事务提交成功后才删除物理文件", async () => {
  const state = await cleanupSetup(new MemoryRepository()); let committedBeforeDelete = false;
  state.storage.beforeDelete = () => { committedBeforeDelete = state.repo.posts.get(state.post.id)?.coverImage === mediaUrl(state.newMedia.id) && state.repo.media.get(state.oldMedia.id)?.cleanupStatus === "PENDING"; };
  await state.posts.update(actor("author", "AUTHOR"), state.post.id, { coverImage: mediaUrl(state.newMedia.id), expectedRevision: 1, requestId: "commit-order" });
  assert.equal(committedBeforeDelete, true);
  assert.equal(state.repo.media.get(state.oldMedia.id)?.cleanupStatus, "COMPLETED");
  assert.equal(state.storage.files.has(state.oldMedia.storageKey), false);
});

test("提交后删除失败不回滚文章且保留可重试清理任务", async () => {
  const state = await cleanupSetup(new MemoryRepository()); state.storage.failDeletes = 1;
  const original = console.error; console.error = () => undefined;
  try {
    const updated = await state.posts.update(actor("author", "AUTHOR"), state.post.id, { coverImage: mediaUrl(state.newMedia.id), expectedRevision: 1, requestId: "cleanup-fail" });
    assert.equal(updated.coverImage, mediaUrl(state.newMedia.id));
    assert.equal(await state.repo.findMediaAssetById(state.oldMedia.id), null);
    assert.equal(state.repo.media.get(state.oldMedia.id)?.cleanupStatus, "PENDING");
    assert.equal(state.repo.media.get(state.oldMedia.id)?.cleanupAttempts, 1);
    assert.equal(state.storage.files.has(state.oldMedia.storageKey), true);
    assert.deepEqual(await state.media.prunePending(), { completed: 1, failed: 0 });
    assert.equal(state.repo.media.get(state.oldMedia.id)?.cleanupStatus, "COMPLETED");
    assert.equal(state.storage.files.has(state.oldMedia.storageKey), false);
  } finally { console.error = original; }
});

test("媒体清理维护任务幂等且不处理仍被引用的媒体", async () => {
  const repo = new MemoryRepository(); const storage = new CleanupStorage(); const media = new MediaService(repo, storage);
  const pending: MediaAssetRecord = { id: crypto.randomUUID(), ownerId: "author", purpose: "COVER", storageKey: `${crypto.randomUUID()}.png`, mimeType: "image/png", byteSize: 1, sha256: "c".repeat(64), linkedPostId: null, linkedUserId: null, deletedAt: new Date(), cleanupStatus: "PENDING", cleanupAttempts: 0, createdAt: new Date() };
  const referenced = { ...pending, id: crypto.randomUUID(), storageKey: `${crypto.randomUUID()}.png`, linkedPostId: "post-1" };
  repo.media.set(pending.id, pending); repo.media.set(referenced.id, referenced); storage.files.add(pending.storageKey); storage.files.add(referenced.storageKey);
  assert.deepEqual(await media.prunePending(), { completed: 1, failed: 0 });
  assert.deepEqual(await media.prunePending(), { completed: 0, failed: 0 });
  assert.equal(storage.deleteCalls.filter((key) => key === pending.storageKey).length, 1);
  assert.equal(storage.files.has(referenced.storageKey), true);
});
