export type EditorDraftFields = {
  title: string;
  summary: string;
  content: string;
  visibility: "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
  tags: string;
  coverImage: string;
};

export type EditorDraftScope = {
  userId: string;
  draftId: string;
};

export type EditorAsyncTarget = {
  userId: string | null;
  draftId: string;
  generation: number;
};

export type StoredEditorDraft = {
  version: 2;
  userId: string;
  draftId: string;
  savedAt: string;
  fields: EditorDraftFields;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const prefix = "shadow-sky:editor-draft:v2:";

export function editorDraftScope(userId: string | null | undefined, draftId: string): EditorDraftScope | null {
  const stableUserId = userId?.trim();
  if (!stableUserId) return null;
  return { userId: stableUserId, draftId: draftId.trim() || "new" };
}

export function editorDraftStorageKey(userId: string, draftId: string) {
  const scope = editorDraftScope(userId, draftId);
  if (!scope) throw new Error("EDITOR_DRAFT_IDENTITY_REQUIRED");
  return `${prefix}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.draftId)}`;
}

function localString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function parseStoredEditorDraft(raw: string | null, expectedUserId: string, expectedDraftId: string): StoredEditorDraft | null {
  const scope = editorDraftScope(expectedUserId, expectedDraftId);
  if (!raw || !scope) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 2 || record.userId !== scope.userId || record.draftId !== scope.draftId || typeof record.savedAt !== "string") return null;
    if (!record.fields || typeof record.fields !== "object") return null;
    const fields = record.fields as Record<string, unknown>;
    const title = localString(fields.title);
    const summary = localString(fields.summary);
    const content = localString(fields.content);
    const tags = localString(fields.tags);
    const coverImage = localString(fields.coverImage);
    const visibility = fields.visibility;
    if (title === null || summary === null || content === null || tags === null || coverImage === null) return null;
    if (visibility !== "PUBLIC" && visibility !== "MEMBERS_ONLY" && visibility !== "PRIVATE") return null;
    if (Number.isNaN(Date.parse(record.savedAt))) return null;
    return { version: 2, userId: scope.userId, draftId: scope.draftId, savedAt: record.savedAt, fields: { title, summary, content, visibility, tags, coverImage } };
  } catch {
    return null;
  }
}

export function createStoredEditorDraft(scope: EditorDraftScope, fields: EditorDraftFields, savedAt = new Date()): StoredEditorDraft {
  return {
    version: 2,
    userId: scope.userId,
    draftId: scope.draftId,
    savedAt: savedAt.toISOString(),
    fields: { ...fields },
  };
}

export function editorDraftFieldsEqual(left: EditorDraftFields, right: EditorDraftFields) {
  return left.title === right.title
    && left.summary === right.summary
    && left.content === right.content
    && left.visibility === right.visibility
    && left.tags === right.tags
    && left.coverImage === right.coverImage;
}

export function readEditorDraft(storage: DraftStorage, scope: EditorDraftScope) {
  return parseStoredEditorDraft(storage.getItem(editorDraftStorageKey(scope.userId, scope.draftId)), scope.userId, scope.draftId);
}

export function writeEditorDraft(storage: DraftStorage, scope: EditorDraftScope, fields: EditorDraftFields, savedAt = new Date()) {
  const value = createStoredEditorDraft(scope, fields, savedAt);
  storage.setItem(editorDraftStorageKey(scope.userId, scope.draftId), JSON.stringify(value));
  return value;
}

export function writeEditorDraftIfChanged(storage: DraftStorage, scope: EditorDraftScope, fields: EditorDraftFields, savedAt = new Date()) {
  const existing = readEditorDraft(storage, scope);
  if (existing && editorDraftFieldsEqual(existing.fields, fields)) return { draft: existing, written: false } as const;
  return { draft: writeEditorDraft(storage, scope, fields, savedAt), written: true } as const;
}

export function flushPendingEditorDraft(
  storage: DraftStorage,
  input: { scope: EditorDraftScope | null; fields: EditorDraftFields; dirty: boolean; recoveryPending: boolean },
  savedAt = new Date(),
) {
  if (!input.scope || !input.dirty || input.recoveryPending) return null;
  return writeEditorDraftIfChanged(storage, input.scope, input.fields, savedAt);
}

export function removeEditorDraft(storage: DraftStorage, scope: EditorDraftScope) {
  storage.removeItem(editorDraftStorageKey(scope.userId, scope.draftId));
}

export function removeEditorDraftIfFieldsMatch(storage: DraftStorage, scope: EditorDraftScope, savedFields: EditorDraftFields) {
  const current = readEditorDraft(storage, scope);
  if (!current || !editorDraftFieldsEqual(current.fields, savedFields)) return false;
  removeEditorDraft(storage, scope);
  return true;
}

export function appendContentImage(fields: EditorDraftFields, mediaUrl: string): EditorDraftFields {
  return { ...fields, content: `${fields.content}\n\n![图片](${mediaUrl})` };
}

export function editorDraftCanEdit(input: { identityResolved: boolean; userId: string | null; recoveryChecked: boolean; recoveryPending: boolean }) {
  return input.identityResolved && Boolean(input.userId) && input.recoveryChecked && !input.recoveryPending;
}

export function editorAsyncTargetMatches(active: EditorAsyncTarget, started: EditorAsyncTarget) {
  return Boolean(started.userId)
    && active.userId === started.userId
    && active.draftId === started.draftId
    && active.generation === started.generation;
}

export function editorAsyncCompletionIsCurrent(
  active: EditorAsyncTarget,
  started: EditorAsyncTarget,
  activeOperationId: number,
  startedOperationId: number,
) {
  return activeOperationId === startedOperationId && editorAsyncTargetMatches(active, started);
}

export function applyEditorMediaResult(
  active: EditorAsyncTarget,
  started: EditorAsyncTarget,
  fields: EditorDraftFields,
  purpose: "COVER" | "CONTENT",
  mediaUrl: string,
) {
  if (!editorAsyncTargetMatches(active, started)) return null;
  return purpose === "CONTENT" ? appendContentImage(fields, mediaUrl) : { ...fields, coverImage: mediaUrl };
}

export function serverSaveContainsLatestFields(current: EditorDraftFields, submitted: EditorDraftFields) {
  return editorDraftFieldsEqual(current, submitted);
}
