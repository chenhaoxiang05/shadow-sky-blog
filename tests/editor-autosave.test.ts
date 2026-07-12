import assert from "node:assert/strict";
import test from "node:test";
import {
  createStoredEditorDraft,
  editorDraftStorageKey,
  parseStoredEditorDraft,
  readEditorDraft,
  removeEditorDraft,
  writeEditorDraft,
  type DraftStorage,
  type EditorDraftFields,
} from "../lib/editor-autosave";

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
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

test("新文章和不同文章使用独立且安全编码的存储键", () => {
  assert.notEqual(editorDraftStorageKey("new"), editorDraftStorageKey("post-1"));
  assert.match(editorDraftStorageKey("文章 / 1"), /%2F/);
});

test("本地草稿可以完整写入和恢复", () => {
  const storage = new MemoryStorage();
  const savedAt = new Date("2026-07-13T01:02:03.000Z");
  writeEditorDraft(storage, "new", fields, savedAt);
  assert.deepEqual(readEditorDraft(storage, "new"), createStoredEditorDraft("new", fields, savedAt));
});

test("损坏、错误版本和其他文章的草稿被安全拒绝", () => {
  assert.equal(parseStoredEditorDraft("not-json", "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify({ version: 2 }), "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify(createStoredEditorDraft("post-1", fields)), "post-2"), null);
});

test("解析只投影编辑字段而不会保留认证或 Session 数据", () => {
  const stored = createStoredEditorDraft("new", fields, new Date("2026-07-13T01:02:03.000Z"));
  const raw = JSON.stringify({ ...stored, password: "ignored", session: "ignored", fields: { ...stored.fields, token: "ignored" } });
  const parsed = parseStoredEditorDraft(raw, "new");
  assert.deepEqual(parsed, stored);
  assert.equal(JSON.stringify(parsed).includes("ignored"), false);
});

test("超限内容和无效可见性不会进入编辑器", () => {
  const stored = createStoredEditorDraft("new", fields);
  assert.equal(parseStoredEditorDraft(JSON.stringify({ ...stored, fields: { ...fields, title: "x".repeat(181) } }), "new"), null);
  assert.equal(parseStoredEditorDraft(JSON.stringify({ ...stored, fields: { ...fields, visibility: "OWNER_ONLY" } }), "new"), null);
});

test("正式保存或放弃恢复可以幂等清理本地草稿", () => {
  const storage = new MemoryStorage();
  writeEditorDraft(storage, "new", fields);
  removeEditorDraft(storage, "new");
  removeEditorDraft(storage, "new");
  assert.equal(readEditorDraft(storage, "new"), null);
});
