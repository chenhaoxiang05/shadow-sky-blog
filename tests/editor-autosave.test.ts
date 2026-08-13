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
  editorEmergencyDraftForScope,
  editorDraftPersistedOnSuspend,
  editorDraftStorageFailureNeedsEmergencyCopy,
  editorDraftRevision,
  editorDraftScope,
  editorDraftStorageKey,
  editorIdentityRequestIsCurrent,
  editorUnauthorizedInvalidatesIdentity,
  editorSessionExpiryMessage,
  EDITOR_SESSION_EXPIRED_SAVED_MESSAGE,
  EDITOR_SESSION_EXPIRED_UNSAVED_MESSAGE,
  flushPendingEditorDraft,
  parseStoredEditorDraft,
  readEditorDraft,
  rebaseEditorDraftAfterExternalRemoval,
  resolveExternalEditorDraftConflict,
  removeEditorDraft,
  removeEditorDraftAfterServerSave,
  removeEditorDraftIfRevisionMatches,
  removeEditorDraftIfFieldsMatch,
  safeFlushPendingEditorDraft,
  serverSaveContainsLatestFields,
  writeEditorDraft,
  writeEditorDraftSnapshot,
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
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

class ThrowingStorage extends MemoryStorage {
  override setItem() { throw new Error("storage details must stay private"); }
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

test("失效后只有原账户能恢复对应作用域内容", () => {
  const storage = new MemoryStorage();
  writeEditorDraft(storage, scope, fields);
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, fields);
  assert.equal(readEditorDraft(storage, editorDraftScope(userTwo, "new")!), null);
});

test("本地存储失败后的内存副本只允许原账户和原草稿恢复", () => {
  const emergency = { userId: userOne, draftId: "new", fields };
  assert.deepEqual(editorEmergencyDraftForScope(emergency, userOne, "new"), fields);
  assert.equal(editorEmergencyDraftForScope(emergency, userTwo, "new"), null);
  assert.equal(editorEmergencyDraftForScope(emergency, userOne, "post-2"), null);
  assert.equal(editorEmergencyDraftForScope(emergency, null, "new"), null);
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

test("Session 失效发生在防抖前时仍可同步保存最新编辑", () => {
  const storage = new MemoryStorage();
  const latest = { ...fields, content: `${fields.content}\n尚未等到防抖的输入` };
  const result = flushPendingEditorDraft(storage, { scope, fields: latest, dirty: true, recoveryPending: false });
  assert.equal(result?.written, true);
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, latest);
});

test("Session 失效不会覆盖尚未处理的恢复草稿", () => {
  const storage = new MemoryStorage();
  writeEditorDraft(storage, scope, fields);
  const result = flushPendingEditorDraft(storage, { scope, fields: { ...fields, content: "空白初始表单" }, dirty: true, recoveryPending: true });
  assert.equal(result, null);
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, fields);
});

test("同步刷新和防抖重复到达时不会无意义重复写入", () => {
  const storage = new MemoryStorage();
  assert.equal(writeEditorDraftIfChanged(storage, scope, fields).written, true);
  assert.equal(writeEditorDraftIfChanged(storage, scope, fields).written, false);
  assert.equal(flushPendingEditorDraft(storage, { scope, fields, dirty: true, recoveryPending: false })?.written, false);
  assert.equal(storage.setCalls, 1);
});

test("旧标签页的延迟刷新不能覆盖另一标签页的新草稿", () => {
  const storage = new MemoryStorage();
  const newer = { ...fields, content: "标签页 B 的新内容" };
  const stale = { ...fields, content: "标签页 A 的旧内容" };
  const savedByB = writeEditorDraftIfChanged(storage, scope, newer, new Date("2026-07-13T02:00:00.000Z"), {
    expectedRevision: null,
    writerId: "tab-b",
    revision: editorDraftRevision("tab-b", 1, new Date("2026-07-13T02:00:00.000Z")),
  });
  assert.equal(savedByB.written, true);
  const staleFlush = writeEditorDraftIfChanged(storage, scope, stale, new Date("2026-07-13T02:00:01.000Z"), {
    expectedRevision: null,
    writerId: "tab-a",
    revision: editorDraftRevision("tab-a", 1, new Date("2026-07-13T02:00:01.000Z")),
  });
  assert.equal(staleFlush.conflict, true);
  assert.equal(staleFlush.written, false);
  assert.deepEqual(readEditorDraft(storage, scope)?.fields, newer);
});

test("两个标签页同时通过旧基线写入时各自版本都被保留", () => {
  const storage = new MemoryStorage();
  const first = writeEditorDraft(storage, scope, { ...fields, content: "标签页 A" }, new Date("2026-07-13T02:00:00.000Z"), {
    writerId: "tab-a",
    revision: "tab-a:1",
  });
  const second = writeEditorDraft(storage, scope, { ...fields, content: "标签页 B" }, new Date("2026-07-13T02:00:01.000Z"), {
    writerId: "tab-b",
    revision: "tab-b:1",
  });

  assert.equal(storage.values.size, 2);
  assert.equal(readEditorDraft(storage, scope)?.revision, second.revision);
  assert.equal(removeEditorDraftIfRevisionMatches(storage, scope, second.revision).removed, false);
  assert.equal(readEditorDraft(storage, scope)?.revision, first.revision);
});

test("外部删除当前基线后，脏草稿会重定位到空基线并重新保存", () => {
  assert.deepEqual(
    rebaseEditorDraftAfterExternalRemoval({ dirty: true, recoveryPending: false, baselineRevision: "deleted" }),
    { action: "flush", baselineRevision: null },
  );
  assert.deepEqual(
    rebaseEditorDraftAfterExternalRemoval({ dirty: false, recoveryPending: true, baselineRevision: "deleted" }),
    { action: "clear-recovery", baselineRevision: null },
  );
});

test("外部冲突到达时先持久化当前标签页脏内容再阻塞编辑", () => {
  assert.deepEqual(
    resolveExternalEditorDraftConflict({ currentDirty: true, currentRevision: "tab-a:0", externalRevision: "tab-b:1" }),
    { persistCurrentBeforeBlocking: true, conflictRevision: "tab-b:1" },
  );
  assert.equal(
    resolveExternalEditorDraftConflict({ currentDirty: false, currentRevision: "tab-a:0", externalRevision: "tab-b:1" }).persistCurrentBeforeBlocking,
    false,
  );
  assert.equal(editorDraftStorageFailureNeedsEmergencyCopy({ dirty: true, persistResultKind: "written" }), false);
  assert.equal(editorDraftStorageFailureNeedsEmergencyCopy({ dirty: true, persistResultKind: "error" }), true);

  const storage = new MemoryStorage();
  writeEditorDraft(storage, scope, { ...fields, content: "外部标签页" }, new Date("2026-07-13T02:20:00.000Z"), { writerId: "tab-b", revision: "tab-b:1" });
  const snapshot = writeEditorDraftSnapshot(storage, scope, { ...fields, content: "当前标签页尚未防抖" }, new Date("2026-07-13T02:20:01.000Z"), { writerId: "tab-a", revision: "tab-a:1" });
  assert.equal(snapshot.kind, "written");
  assert.equal(readEditorDraft(storage, scope)?.fields.content, "当前标签页尚未防抖");
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

test("放弃启动恢复不会删除另一标签页刚写入的较新版本", () => {
  const storage = new MemoryStorage();
  const shown = writeEditorDraft(storage, scope, fields, new Date("2026-07-13T02:00:00.000Z"), { writerId: "tab-a", revision: "shown-a" });
  writeEditorDraft(storage, scope, { ...fields, content: "另一标签页的新内容" }, new Date("2026-07-13T02:00:01.000Z"), { writerId: "tab-b", revision: "newer-b" });

  const result = removeEditorDraftIfRevisionMatches(storage, scope, shown.revision);
  assert.equal(result.removed, false);
  assert.equal(result.current?.revision, "newer-b");
  assert.equal(readEditorDraft(storage, scope)?.fields.content, "另一标签页的新内容");

  const latest = result.current;
  assert.ok(latest);
  assert.equal(removeEditorDraftIfRevisionMatches(storage, scope, latest.revision).removed, true);
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

test("恢复基线后快速正式保存会清理旧恢复副本但保留其他标签页更新", () => {
  const storage = new MemoryStorage();
  const recovered = writeEditorDraft(storage, scope, fields, new Date("2026-07-13T03:00:00.000Z"), { writerId: "tab-a", revision: "baseline-a" });
  const editedThenSaved = { ...fields, content: "恢复后立刻修改并正式保存" };
  assert.equal(removeEditorDraftAfterServerSave(storage, scope, editedThenSaved, recovered.revision), true);
  assert.equal(readEditorDraft(storage, scope), null);

  writeEditorDraft(storage, scope, { ...fields, content: "其他标签页更新" }, new Date("2026-07-13T03:00:01.000Z"), { writerId: "tab-b", revision: "newer-b" });
  assert.equal(removeEditorDraftAfterServerSave(storage, scope, editedThenSaved, recovered.revision), false);
  assert.equal(readEditorDraft(storage, scope)?.revision, "newer-b");
});

test("服务器保存使用启动时基线，不会把稍后出现的外部冲突当作可清理基线", () => {
  const storage = new MemoryStorage();
  const accepted = writeEditorDraft(storage, scope, fields, new Date("2026-07-13T03:10:00.000Z"), { writerId: "tab-a", revision: "accepted-a" });
  const submitted = { ...fields, content: "本标签页已提交服务器" };
  writeEditorDraft(storage, scope, { ...fields, content: "另一标签页尚未提交" }, new Date("2026-07-13T03:10:01.000Z"), { writerId: "tab-b", revision: "external-b" });

  assert.equal(removeEditorDraftAfterServerSave(storage, scope, submitted, accepted.revision), false);
  assert.equal(readEditorDraft(storage, scope)?.revision, "external-b");
});

test("服务器保存会清理已接受基线之前的旧 writer 记录但保留之后的新冲突", () => {
  const storage = new MemoryStorage();
  writeEditorDraft(storage, scope, { ...fields, content: "更旧的其他 writer" }, new Date("2026-07-13T03:09:59.000Z"), { writerId: "tab-old", revision: "old-external" });
  const accepted = writeEditorDraft(storage, scope, fields, new Date("2026-07-13T03:10:00.000Z"), { writerId: "tab-a", revision: "accepted-a" });
  const submitted = { ...fields, content: "服务器成功保存" };
  assert.equal(removeEditorDraftAfterServerSave(storage, scope, submitted, accepted.revision), true);
  assert.equal(readEditorDraft(storage, scope), null);

  writeEditorDraft(storage, scope, fields, new Date("2026-07-13T03:10:00.000Z"), { writerId: "tab-a", revision: "accepted-a-2" });
  writeEditorDraft(storage, scope, { ...fields, content: "稍后的其他标签页" }, new Date("2026-07-13T03:10:01.000Z"), { writerId: "tab-new", revision: "new-external" });
  assert.equal(removeEditorDraftAfterServerSave(storage, scope, submitted, "accepted-a-2"), false);
  assert.equal(readEditorDraft(storage, scope)?.revision, "new-external");
});

test("401 提示只在本地持久化成功时声明内容已保存", () => {
  assert.equal(editorDraftPersistedOnSuspend({ dirty: true }, "written"), true);
  assert.equal(editorDraftPersistedOnSuspend({ dirty: true }, "unchanged"), true);
  assert.equal(editorDraftPersistedOnSuspend({ dirty: true }, "error"), false);
  assert.equal(editorDraftPersistedOnSuspend({ dirty: true }, "conflict"), false);
  assert.equal(editorDraftPersistedOnSuspend({ dirty: false }, "skipped"), true);
  assert.equal(editorDraftPersistedOnSuspend({ dirty: true }, "skipped"), false);
  assert.equal(editorSessionExpiryMessage(true), EDITOR_SESSION_EXPIRED_SAVED_MESSAGE);
  assert.equal(editorSessionExpiryMessage(false), EDITOR_SESSION_EXPIRED_UNSAVED_MESSAGE);
  assert.equal(EDITOR_SESSION_EXPIRED_SAVED_MESSAGE, "登录状态已失效，最新内容已保存在本地，请重新登录");
  assert.doesNotMatch(EDITOR_SESSION_EXPIRED_UNSAVED_MESSAGE, /已保存在本地/);
});

test("实际本地存储异常会返回安全的未保存结果", () => {
  const result = safeFlushPendingEditorDraft(new ThrowingStorage(), {
    scope,
    fields,
    dirty: true,
    recoveryPending: false,
    writerId: "tab-error",
    revision: "tab-error:1",
  });
  assert.deepEqual(result, { kind: "error" });
  assert.equal(editorDraftPersistedOnSuspend({ dirty: true }, result.kind), false);
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
  assert.match(source, /function applyAuthenticatedEditorIdentity\(userId: string\)/);
  assert.match(source, /function handleEditorSessionExpired\(\)/);
  assert.match(source, /handleEditorSessionExpired\(\)/);
  assert.match(source, /sessionExpiryNotifiedRef\.current/);
  assert.match(source, /editorSessionExpiryMessage\(persisted\)/);
  const upload = source.slice(source.indexOf("async function uploadImage"), source.indexOf("async function createDraft"));
  assert.doesNotMatch(upload, /setBusy\(true\)/);
  assert.doesNotMatch(upload, /setBusy\(false\)/);
  assert.match(source, /new AbortController\(\)/);
});

test("身份失效先刷新草稿再丢弃活动作用域", () => {
  const source = readFileSync(new URL("../app/use-editor-autosave.ts", import.meta.url), "utf8");
  const suspend = source.slice(source.indexOf("function suspendForIdentityLoss"), source.indexOf("return { recovery:"));
  assert.ok(suspend.indexOf("flushActiveDraft(active)") < suspend.indexOf("activeDraftRef.current = null"));
});

test("关闭编辑器会重置恢复就绪状态并在重开时重新检查", () => {
  const source = readFileSync(new URL("../app/use-editor-autosave.ts", import.meta.url), "utf8");
  const deactivate = source.slice(source.indexOf("function deactivate"), source.indexOf("return { recovery:"));
  assert.match(deactivate, /flushActiveDraft\(active\)/);
  assert.match(deactivate, /setLoadedScopeKey\(null\)/);
  assert.match(source, /const ready = Boolean\(currentLifecycleKey && loadedScopeKey === currentLifecycleKey\)/);
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /view === "editor" && next !== "editor"\) \{ localDraft\.deactivate\(\)/);
});
