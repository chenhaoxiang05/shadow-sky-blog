export type EditorDraftFields = {
  title: string;
  summary: string;
  content: string;
  visibility: "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
  tags: string;
  coverImage: string;
};

export type StoredEditorDraft = {
  version: 1;
  draftId: string;
  savedAt: string;
  fields: EditorDraftFields;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const prefix = "shadow-sky:editor-draft:v1:";

export function editorDraftStorageKey(draftId: string) {
  return `${prefix}${encodeURIComponent(draftId.trim() || "new")}`;
}

function bounded(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value : null;
}

export function parseStoredEditorDraft(raw: string | null, expectedDraftId: string): StoredEditorDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || record.draftId !== expectedDraftId || typeof record.savedAt !== "string") return null;
    if (!record.fields || typeof record.fields !== "object") return null;
    const fields = record.fields as Record<string, unknown>;
    const title = bounded(fields.title, 180);
    const summary = bounded(fields.summary, 500);
    const content = bounded(fields.content, 500_000);
    const tags = bounded(fields.tags, 500);
    const coverImage = bounded(fields.coverImage, 2_048);
    const visibility = fields.visibility;
    if (title === null || summary === null || content === null || tags === null || coverImage === null) return null;
    if (visibility !== "PUBLIC" && visibility !== "MEMBERS_ONLY" && visibility !== "PRIVATE") return null;
    if (Number.isNaN(Date.parse(record.savedAt))) return null;
    return { version: 1, draftId: expectedDraftId, savedAt: record.savedAt, fields: { title, summary, content, visibility, tags, coverImage } };
  } catch {
    return null;
  }
}

export function createStoredEditorDraft(draftId: string, fields: EditorDraftFields, savedAt = new Date()): StoredEditorDraft {
  return {
    version: 1,
    draftId,
    savedAt: savedAt.toISOString(),
    fields: { ...fields },
  };
}

export function readEditorDraft(storage: DraftStorage, draftId: string) {
  return parseStoredEditorDraft(storage.getItem(editorDraftStorageKey(draftId)), draftId);
}

export function writeEditorDraft(storage: DraftStorage, draftId: string, fields: EditorDraftFields, savedAt = new Date()) {
  const value = createStoredEditorDraft(draftId, fields, savedAt);
  storage.setItem(editorDraftStorageKey(draftId), JSON.stringify(value));
  return value;
}

export function removeEditorDraft(storage: DraftStorage, draftId: string) {
  storage.removeItem(editorDraftStorageKey(draftId));
}
