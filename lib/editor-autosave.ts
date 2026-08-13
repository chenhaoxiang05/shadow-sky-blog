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

export type EditorEmergencyDraft = {
  userId: string;
  draftId: string;
  fields: EditorDraftFields;
};

export type EditorAsyncTarget = {
  userId: string | null;
  draftId: string;
  generation: number;
};

export type SingleFlightLock = {
  tryAcquire(): number | null;
  release(token: number): boolean;
  isLocked(): boolean;
};

export type EditorIdentityState = {
  revision: number;
  operationId: number;
  target: EditorAsyncTarget;
};

export type StoredEditorDraft = {
  version: 3;
  userId: string;
  draftId: string;
  revision: string;
  writerId: string;
  savedAt: string;
  fields: EditorDraftFields;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export const EDITOR_SESSION_EXPIRED_SAVED_MESSAGE = "登录状态已失效，最新内容已保存在本地，请重新登录";
export const EDITOR_SESSION_EXPIRED_UNSAVED_MESSAGE = "登录状态已失效，本地保存未完成，请勿关闭页面并重新登录";

export function editorSessionExpiryMessage(persisted: boolean) {
  return persisted ? EDITOR_SESSION_EXPIRED_SAVED_MESSAGE : EDITOR_SESSION_EXPIRED_UNSAVED_MESSAGE;
}

export function editorDraftPersistedOnSuspend(
  input: { dirty: boolean },
  resultKind: "skipped" | "written" | "unchanged" | "conflict" | "error",
) {
  return !input.dirty || resultKind === "written" || resultKind === "unchanged";
}

export function editorEmergencyDraftForScope(
  emergency: EditorEmergencyDraft | null,
  userId: string | null | undefined,
  draftId: string,
) {
  if (!emergency || !userId || emergency.userId !== userId || emergency.draftId !== draftId) return null;
  return { ...emergency.fields };
}

const prefix = "shadow-sky:editor-draft:v3:";

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

export function editorDraftWriterStorageKey(scope: EditorDraftScope, writerId: string) {
  return `${editorDraftStorageKey(scope.userId, scope.draftId)}:writer:${encodeURIComponent(writerId)}`;
}

export function editorDraftStorageKeyBelongsToScope(key: string | null, scope: EditorDraftScope) {
  if (!key) return false;
  const scopeKey = editorDraftStorageKey(scope.userId, scope.draftId);
  return key === scopeKey || key.startsWith(`${scopeKey}:writer:`);
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
    if (record.version !== 3 || record.userId !== scope.userId || record.draftId !== scope.draftId || typeof record.savedAt !== "string") return null;
    if (typeof record.revision !== "string" || !record.revision || typeof record.writerId !== "string" || !record.writerId) return null;
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
    return { version: 3, userId: scope.userId, draftId: scope.draftId, revision: record.revision, writerId: record.writerId, savedAt: record.savedAt, fields: { title, summary, content, visibility, tags, coverImage } };
  } catch {
    return null;
  }
}

export function editorDraftRevision(writerId: string, sequence: number, savedAt = new Date()) {
  return `${writerId}:${sequence}:${savedAt.toISOString()}`;
}

export function createStoredEditorDraft(
  scope: EditorDraftScope,
  fields: EditorDraftFields,
  savedAt = new Date(),
  metadata: { revision?: string; writerId?: string } = {},
): StoredEditorDraft {
  const writerId = metadata.writerId ?? "system";
  return {
    version: 3,
    userId: scope.userId,
    draftId: scope.draftId,
    revision: metadata.revision ?? editorDraftRevision(writerId, 0, savedAt),
    writerId,
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

function editorDraftEntries(storage: DraftStorage, scope: EditorDraftScope) {
  const entries: Array<{ key: string; draft: StoredEditorDraft }> = [];
  for (const key of editorDraftKeys(storage, scope)) {
    const draft = parseStoredEditorDraft(storage.getItem(key), scope.userId, scope.draftId);
    if (draft) entries.push({ key, draft });
  }
  return entries.sort((left, right) => {
    const timeDifference = Date.parse(left.draft.savedAt) - Date.parse(right.draft.savedAt);
    return timeDifference || left.draft.revision.localeCompare(right.draft.revision);
  });
}

function editorDraftKeys(storage: DraftStorage, scope: EditorDraftScope) {
  const legacyKey = editorDraftStorageKey(scope.userId, scope.draftId);
  const keys = [legacyKey];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key !== legacyKey && editorDraftStorageKeyBelongsToScope(key, scope)) keys.push(key);
  }
  return keys;
}

export function readEditorDraft(storage: DraftStorage, scope: EditorDraftScope) {
  return editorDraftEntries(storage, scope).at(-1)?.draft ?? null;
}

export function writeEditorDraft(
  storage: DraftStorage,
  scope: EditorDraftScope,
  fields: EditorDraftFields,
  savedAt = new Date(),
  metadata: { revision?: string; writerId?: string } = {},
) {
  const value = createStoredEditorDraft(scope, fields, savedAt, metadata);
  storage.setItem(editorDraftWriterStorageKey(scope, value.writerId), JSON.stringify(value));
  return value;
}

export function writeEditorDraftSnapshot(
  storage: DraftStorage,
  scope: EditorDraftScope,
  fields: EditorDraftFields,
  savedAt = new Date(),
  metadata: { revision: string; writerId: string },
) {
  try {
    return { kind: "written", draft: writeEditorDraft(storage, scope, fields, savedAt, metadata) } as const;
  } catch {
    return { kind: "error" } as const;
  }
}

export function writeEditorDraftIfChanged(
  storage: DraftStorage,
  scope: EditorDraftScope,
  fields: EditorDraftFields,
  savedAt = new Date(),
  options: { expectedRevision?: string | null; revision?: string; writerId?: string } = {},
) {
  const existing = readEditorDraft(storage, scope);
  if (existing && editorDraftFieldsEqual(existing.fields, fields)) return { draft: existing, written: false, conflict: false } as const;
  if (Object.prototype.hasOwnProperty.call(options, "expectedRevision") && (existing?.revision ?? null) !== options.expectedRevision) {
    return { draft: existing, written: false, conflict: true } as const;
  }
  const written = writeEditorDraft(storage, scope, fields, savedAt, options);
  const latest = readEditorDraft(storage, scope);
  if (latest && latest.revision !== written.revision && !editorDraftFieldsEqual(latest.fields, fields)) {
    return { draft: latest, written: true, conflict: true } as const;
  }
  return { draft: written, written: true, conflict: false } as const;
}

export function flushPendingEditorDraft(
  storage: DraftStorage,
  input: { scope: EditorDraftScope | null; fields: EditorDraftFields; dirty: boolean; recoveryPending: boolean; baselineRevision?: string | null; revision?: string; writerId?: string },
  savedAt = new Date(),
) {
  if (!input.scope || !input.dirty || input.recoveryPending) return null;
  const options = Object.prototype.hasOwnProperty.call(input, "baselineRevision")
    ? { expectedRevision: input.baselineRevision, revision: input.revision, writerId: input.writerId }
    : { revision: input.revision, writerId: input.writerId };
  return writeEditorDraftIfChanged(storage, input.scope, input.fields, savedAt, options);
}

export function safeFlushPendingEditorDraft(
  storage: DraftStorage,
  input: Parameters<typeof flushPendingEditorDraft>[1],
  savedAt = new Date(),
) {
  try {
    const result = flushPendingEditorDraft(storage, input, savedAt);
    if (!result) return { kind: "skipped" } as const;
    if (result.conflict) return { kind: "conflict", draft: result.draft } as const;
    return { kind: result.written ? "written" : "unchanged", draft: result.draft } as const;
  } catch {
    return { kind: "error" } as const;
  }
}

export function removeEditorDraft(storage: DraftStorage, scope: EditorDraftScope) {
  for (const key of editorDraftKeys(storage, scope)) storage.removeItem(key);
}

export function removeEditorDraftIfRevisionMatches(
  storage: DraftStorage,
  scope: EditorDraftScope,
  expectedRevision: string,
) {
  for (const matching of editorDraftEntries(storage, scope).filter((entry) => entry.draft.revision === expectedRevision)) {
    storage.removeItem(matching.key);
  }
  const current = readEditorDraft(storage, scope);
  return current
    ? { removed: false, current } as const
    : { removed: true, current: null } as const;
}

export function removeEditorDraftIfFieldsMatch(storage: DraftStorage, scope: EditorDraftScope, savedFields: EditorDraftFields) {
  const current = readEditorDraft(storage, scope);
  if (!current || !editorDraftFieldsEqual(current.fields, savedFields)) return false;
  for (const entry of editorDraftEntries(storage, scope)) {
    if (editorDraftFieldsEqual(entry.draft.fields, savedFields)) storage.removeItem(entry.key);
  }
  return readEditorDraft(storage, scope) === null;
}

export function removeEditorDraftAfterServerSave(
  storage: DraftStorage,
  scope: EditorDraftScope,
  savedFields: EditorDraftFields,
  baselineRevision: string | null,
) {
  const entries = editorDraftEntries(storage, scope);
  const acceptedBaseline = baselineRevision
    ? entries.find((entry) => entry.draft.revision === baselineRevision)?.draft ?? null
    : null;
  const cutoff = acceptedBaseline ? Date.parse(acceptedBaseline.savedAt) : Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    const savedSnapshot = editorDraftFieldsEqual(entry.draft.fields, savedFields);
    const acceptedOrOlder = Boolean(acceptedBaseline) && Date.parse(entry.draft.savedAt) <= cutoff;
    if (savedSnapshot || acceptedOrOlder) storage.removeItem(entry.key);
  }
  return readEditorDraft(storage, scope) === null;
}

export function rebaseEditorDraftAfterExternalRemoval(input: {
  dirty: boolean;
  recoveryPending: boolean;
  baselineRevision: string | null;
}) {
  if (input.recoveryPending) return { action: "clear-recovery", baselineRevision: null } as const;
  if (input.baselineRevision !== null) {
    return { action: input.dirty ? "flush" : "rebase", baselineRevision: null } as const;
  }
  return { action: "none", baselineRevision: null } as const;
}

export function resolveExternalEditorDraftConflict(input: {
  currentDirty: boolean;
  currentRevision: string | null;
  externalRevision: string;
}) {
  return {
    persistCurrentBeforeBlocking: input.currentDirty && input.currentRevision !== input.externalRevision,
    conflictRevision: input.externalRevision,
  };
}

export function editorDraftStorageFailureNeedsEmergencyCopy(input: {
  dirty: boolean;
  persistResultKind: "skipped" | "written" | "unchanged" | "conflict" | "error";
}) {
  return input.dirty && input.persistResultKind === "error";
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

export function editorIdentityRequestIsCurrent(activeRevision: number, requestRevision: number) {
  return activeRevision === requestRevision;
}

export function editorUnauthorizedInvalidatesIdentity(activeRevision: number, requestRevision: number, enabled = true) {
  return enabled && editorIdentityRequestIsCurrent(activeRevision, requestRevision);
}

export function advanceEditorIdentityState(current: EditorIdentityState, userId: string | null): EditorIdentityState {
  return {
    revision: current.revision + 1,
    operationId: current.operationId + 1,
    target: { ...current.target, userId, generation: current.target.generation + 1 },
  };
}

export function createSingleFlightLock(): SingleFlightLock {
  let sequence = 0;
  let activeToken: number | null = null;
  return {
    tryAcquire() {
      if (activeToken !== null) return null;
      activeToken = ++sequence;
      return activeToken;
    },
    release(token) {
      if (activeToken !== token) return false;
      activeToken = null;
      return true;
    },
    isLocked() {
      return activeToken !== null;
    },
  };
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
