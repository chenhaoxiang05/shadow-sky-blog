import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceEditorIdentityState,
  applyEditorMediaResult,
  appendContentImage,
  createSingleFlightLock,
  createStoredEditorDraft,
  editorAsyncCompletionIsCurrent,
  editorAsyncTargetMatches,
  editorDraftCanEdit,
  editorDraftScope,
  editorDraftStorageKey,
  editorIdentityRequestIsCurrent,
  editorUnauthorizedInvalidatesIdentity,
  flushPendingEditorDraft,
  parseStoredEditorDraft,
  readEditorDraft,
  removeEditorDraft,
  removeEditorDraftIfFieldsMatch,
  serverSaveContainsLatestFields,
  writeEditorDraft,
  writeEditorDraftIfChanged,
  type DraftStorage,
  type EditorDraftFields,
} from "../lib/editor-autosave";

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  setCalls = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.setCalls += 1; this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const fields: EditorDraftFields = {
  title: "本地草稿",
  summary: "防止误关闭造成内容丢失",
  content: "# 正文\n\n只保存编辑字段。",
  visibility: "MEMBERS_ONLY",
  tags: "Next.js, UX",
  coverImage: "",
};

const userOne = "00000000-0000-4000-8000-000000000001";
const userTwo = "00000000-0000-4000-8000-000000000002";
const scope = editorDraftScope(userOne, "new")!;

test("存储键按稳定用户 ID 与草稿 ID 隔离并安全编码", () => {
  assert.notEqual(editorDraftStorageKey(userOne, "new"), editorDraftStorageKey(userTwo, "new"));
  assert.notEqual(editorDraftStorageKey(userOne, "new"), editorDraftStorageKey(userOne, "post-1"));
  assert.match(editorDraftStorageKey(userOne, "文章 / 1"), /%2F/);
  assert.equal(editorDraftScope(null, "new"), null);
  assert.equal(editorDraftScope("", "new"), null);
});

test("本地草稿可以完整写入和恢复", () => {
  const storage = new MemoryStorage();
  const savedAt = new Date("2026-07-13T01:02:03.000Z");
  writeEditorDraft(storage, scope, fields, savedAt);
  assert.deepEqual(readEditorDraft(storage, scope), createStoredEditorDraft(scope, fields, savedAt));
});

test("两个账户共用浏览器时不能读取彼此草稿", () => {
  const storage = new MemoryStorage();
  const firstScope = editorDraftScope(userOne, "shared-post")!;
  const secondScope = editorDraftScope(userTwo, "shared-post")!;
  writeEditorDraft(storage, firstScope, { ...fields, content: "用户一内容" });
  writeEditorDraft(storage, secondScope, { ...fields, content: "用户二内容" });
  assert.equal(readEditorDraft(storage, firstScope)?.fields.content, "用户一内容");
  assert.equal(readEditorDraft(storage, secondScope)?.fields.content, "用户二内容");
  assert.equal(storage.values.size, 2);
});

test("损坏、错误版本、其他账户和其他文章的草稿被安全拒绝", () => {
  const stored = createStoredEditorDraft(scope, fields);
  assert.equal(parseStoredEditorDraft("not-json", userOne, "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify({ ...stored, version: 1 }), userOne, "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify(stored), userTwo, "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify(stored), userOne, "post-2"), null);
});

test("解析只投影用户作用域和编辑字段，不保留 Session 或敏感资料", () => {
  const stored = createStoredEditorDraft(scope, fields, new Date("2026-07-13T01:02:03.000Z"));
  const raw = JSON.stringify({ ...stored, password: "ignored", session: "ignored", displayName: "ignored", fields: { ...stored.fields, token: "ignored" } });
  const parsed = parseStoredEditorDraft(raw, userOne, "new");
  assert.deepEqual(parsed, stored);
  assert.equal(JSON.stringify(parsed).includes("ignored"), false);
});

test("本应用写入的超服务端长度草稿仍可完整恢复", () => {
  const storage = new MemoryStorage();
  const overServerLimit = { ...fields, title: "长".repeat(181), summary: "摘要".repeat(251), tags: "标签,".repeat(251) };
  writeEditorDraft(storage, scope, overServerLimit);
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, overServerLimit);
});

test("字段类型损坏和无效可见性不会进入编辑器", () => {
  const stored = createStoredEditorDraft(scope, fields);
  assert.equal(parseStoredEditorDraft(JSON.stringify({ ...stored, fields: { ...fields, title: 181 } }), userOne, "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify({ ...stored, fields: { ...fields, visibility: "OWNER_ONLY" } }), userOne, "new"), null);
});

test("900ms 防抖触发前离开编辑器会同步刷新 dirty 草稿", () => {
  const storage = new MemoryStorage();
  const leftAt = new Date("2026-07-13T01:02:03.400Z");
  const result = flushPendingEditorDraft(storage, { scope, fields, dirty: true, recoveryPending: false }, leftAt);
  assert.equal(result?.written, true);
  assert.equal(readEditorDraft(storage, scope)?.savedAt, leftAt.toISOString());
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, fields);
});

test("同步刷新和防抖重复到达时不会无意义重复写入", () => {
  const storage = new MemoryStorage();
  assert.equal(writeEditorDraftIfChanged(storage, scope, fields).written, true);
  assert.equal(writeEditorDraftIfChanged(storage, scope, fields).written, false);
  assert.equal(flushPendingEditorDraft(storage, { scope, fields, dirty: true, recoveryPending: false })?.written, false);
  assert.equal(storage.setCalls, 1);
});

test("恢复提示未处理或身份未知时编辑器保持锁定且不会刷新覆盖", () => {
  const storage = new MemoryStorage();
  assert.equal(editorDraftCanEdit({ identityResolved: false, userId: null, recoveryChecked: false, recoveryPending: false }), false);
  assert.equal(editorDraftCanEdit({ identityResolved: true, userId: userOne, recoveryChecked: true, recoveryPending: true }), false);
  assert.equal(editorDraftCanEdit({ identityResolved: true, userId: userOne, recoveryChecked: true, recoveryPending: false }), true);
  assert.equal(flushPendingEditorDraft(storage, { scope, fields, dirty: true, recoveryPending: true }), null);
  assert.equal(storage.setCalls, 0);
});

test("正文图片上传完成时基于最新输入追加而不覆盖异步期间文字", () => {
  const submittedBeforeUpload = { ...fields, content: "上传开始前" };
  const latestWhileUploading = { ...submittedBeforeUpload, content: "上传开始前\n上传期间继续输入" };
  const next = appendContentImage(latestWhileUploading, "/api/media/content-id");
  assert.match(next.content, /上传期间继续输入/);
  assert.match(next.content, /!\[图片\]\(\/api\/media\/content-id\)$/);
  assert.equal(submittedBeforeUpload.content, "上传开始前");
});

test("服务器保存期间出现新修改时保留最新 dirty 草稿", () => {
  const storage = new MemoryStorage();
  const submitted = { ...fields, content: "提交快照" };
  const latest = { ...fields, content: "提交快照\n请求期间的新修改" };
  assert.equal(serverSaveContainsLatestFields(submitted, submitted), true);
  assert.equal(serverSaveContainsLatestFields(latest, submitted), false);
  const retained = flushPendingEditorDraft(storage, { scope, fields: latest, dirty: true, recoveryPending: false });
  assert.equal(retained?.written, true);
  assert.equal(readEditorDraft(storage, scope)?.fields.content, latest.content);
});

test("正式保存或放弃恢复可以幂等清理当前用户的本地草稿", () => {
  const storage = new MemoryStorage();
  writeEditorDraft(storage, scope, fields);
  removeEditorDraft(storage, scope);
  removeEditorDraft(storage, scope);
  assert.equal(readEditorDraft(storage, scope), null);
});

test("服务器保存完成只清理与提交快照匹配的本地版本", () => {
  const storage = new MemoryStorage();
  const submitted = { ...fields, content: "标签页一提交快照" };
  const newerTabDraft = { ...fields, content: "标签页二稍后写入的新内容" };
  writeEditorDraft(storage, scope, submitted);
  writeEditorDraft(storage, scope, newerTabDraft);
  assert.equal(removeEditorDraftIfFieldsMatch(storage, scope, submitted), false);
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, newerTabDraft);
  assert.equal(removeEditorDraftIfFieldsMatch(storage, scope, newerTabDraft), true);
  assert.equal(readEditorDraft(storage, scope), null);
});

test("保存请求完成前切换用户、草稿或 generation 会使回调失效", () => {
  const started = { userId: userOne, draftId: "post-a", generation: 4 };
  assert.equal(editorAsyncTargetMatches({ ...started }, started), true);
  assert.equal(editorAsyncTargetMatches({ ...started, draftId: "post-b" }, started), false);
  assert.equal(editorAsyncTargetMatches({ ...started, userId: userTwo }, started), false);
  assert.equal(editorAsyncTargetMatches({ ...started, generation: 5 }, started), false);
  assert.equal(editorAsyncCompletionIsCurrent(started, started, 8, 8), true);
  assert.equal(editorAsyncCompletionIsCurrent(started, started, 9, 8), false);
});

test("旧保存 finally 不能覆盖同一草稿中新操作的 busy 状态", () => {
  const target = { userId: userOne, draftId: "post-a", generation: 4 };
  const oldOperationId = 12;
  const newOperationId = 13;
  assert.equal(editorAsyncCompletionIsCurrent(target, target, newOperationId, oldOperationId), false);
  assert.equal(editorAsyncCompletionIsCurrent(target, target, newOperationId, newOperationId), true);
});

test("媒体上传结果只应用到启动时的草稿并保留最新输入", () => {
  const started = { userId: userOne, draftId: "post-a", generation: 4 };
  const switched = { ...started, draftId: "post-b", generation: 5 };
  const latest = { ...fields, content: "上传期间继续输入" };
  assert.equal(applyEditorMediaResult(switched, started, latest, "CONTENT", "/api/media/image"), null);
  const applied = applyEditorMediaResult(started, started, latest, "CONTENT", "/api/media/image");
  assert.match(applied?.content ?? "", /上传期间继续输入/);
  assert.match(applied?.content ?? "", /!\[图片\]\(\/api\/media\/image\)$/);
  assert.equal(applyEditorMediaResult(switched, started, latest, "COVER", "/api/media/cover"), null);
});

test("媒体上传单飞锁会即时拒绝第二次启动并只允许持有者释放", () => {
  const lock = createSingleFlightLock();
  const first = lock.tryAcquire();
  assert.equal(typeof first, "number");
  assert.equal(lock.isLocked(), true);
  assert.equal(lock.tryAcquire(), null);
  assert.equal(lock.release((first ?? 0) + 1), false);
  assert.equal(lock.isLocked(), true);
  assert.equal(lock.release(first!), true);
  assert.equal(lock.isLocked(), false);
  assert.notEqual(lock.tryAcquire(), null);
});

test("401 身份失效会清空用户并递增 revision、generation 和 operation", () => {
  const current = { revision: 7, operationId: 12, target: { userId: userOne, draftId: "post-a", generation: 4 } };
  assert.equal(editorUnauthorizedInvalidatesIdentity(7, 7), true);
  const invalidated = advanceEditorIdentityState(current, null);
  assert.equal(invalidated.revision, 8);
  assert.equal(invalidated.operationId, 13);
  assert.equal(invalidated.target.userId, null);
  assert.equal(invalidated.target.generation, 5);
  assert.equal(editorAsyncCompletionIsCurrent(invalidated.target, current.target, invalidated.operationId, current.operationId), false);
  assert.equal(editorUnauthorizedInvalidatesIdentity(8, 7), false);
  assert.equal(editorUnauthorizedInvalidatesIdentity(7, 7, false), false);
});

test("迟到的初始 Session 或旧 401 不能覆盖较新的登录身份", () => {
  const bootstrapRevision = 2;
  const afterLogin = advanceEditorIdentityState({ revision: bootstrapRevision, operationId: 5, target: { userId: null, draftId: "new", generation: 1 } }, userTwo);
  assert.equal(editorIdentityRequestIsCurrent(afterLogin.revision, bootstrapRevision), false);
  assert.equal(editorUnauthorizedInvalidatesIdentity(afterLogin.revision, bootstrapRevision), false);
  assert.equal(afterLogin.target.userId, userTwo);
});

test("媒体上传入口在单飞期间由 UI 原生 disabled", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal([...source.matchAll(/<input[^>]*disabled=\{mediaUploadBusy \|\| busy\}/g)].length, 3);
  assert.match(source, /editorMutationLock\.tryAcquire\(\)/);
  assert.match(source, /invalidateIdentityOn401: false/);
  assert.match(source, /localDraft\.suspendForIdentityLoss\(\)/);
  assert.match(source, /new AbortController\(\)/);
});
