"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  editorDraftScope,
  editorDraftStorageKey,
  flushPendingEditorDraft,
  readEditorDraft,
  removeEditorDraft,
  writeEditorDraftIfChanged,
  type EditorDraftFields,
  type EditorDraftScope,
  type StoredEditorDraft,
} from "@/lib/editor-autosave";

type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "recovery";

type ActiveDraft = {
  key: string;
  scope: EditorDraftScope;
  fields: EditorDraftFields;
  dirty: boolean;
  recoveryPending: boolean;
};

function scopeKey(scope: EditorDraftScope | null) {
  return scope ? editorDraftStorageKey(scope.userId, scope.draftId) : null;
}

function flushActiveDraft(active: ActiveDraft | null) {
  if (!active) return null;
  try {
    return flushPendingEditorDraft(window.localStorage, {
      scope: active.scope,
      fields: active.fields,
      dirty: active.dirty,
      recoveryPending: active.recoveryPending,
    });
  } catch {
    return null;
  }
}

export function useEditorAutosave(input: {
  userId: string | null;
  draftId: string;
  fields: EditorDraftFields;
  enabled: boolean;
  dirty: boolean;
}) {
  const scope = input.enabled ? editorDraftScope(input.userId, input.draftId) : null;
  const currentScopeKey = scopeKey(scope);
  const [recovery, setRecovery] = useState<StoredEditorDraft | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const activeDraftRef = useRef<ActiveDraft | null>(null);
  const visibleRecovery = recovery
    && scope
    && recovery.userId === scope.userId
    && recovery.draftId === scope.draftId
    ? recovery
    : null;
  const ready = Boolean(currentScopeKey && loadedScopeKey === currentScopeKey);
  const visibleStatus = status === "recovery" && !visibleRecovery ? "idle" : status;

  useEffect(() => {
    if (!scope || !currentScopeKey) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = readEditorDraft(window.localStorage, scope);
        setRecovery(stored);
        setSavedAt(stored?.savedAt ?? null);
        setStatus(stored ? "recovery" : "idle");
      } catch {
        setRecovery(null);
        setStatus("error");
      } finally {
        setLoadedScopeKey(currentScopeKey);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!scope || !currentScopeKey) return;
    activeDraftRef.current = {
      key: currentScopeKey,
      scope,
      fields: input.fields,
      dirty: input.dirty,
      recoveryPending: Boolean(visibleRecovery),
    };
    return () => {
      const active = activeDraftRef.current;
      if (active?.key === currentScopeKey) {
        flushActiveDraft(active);
        activeDraftRef.current = null;
      }
    };
  }, [currentScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const active = activeDraftRef.current;
    if (!scope || !currentScopeKey || active?.key !== currentScopeKey) return;
    active.fields = input.fields;
    active.dirty = input.dirty;
    active.recoveryPending = Boolean(visibleRecovery);
  }, [currentScopeKey, input.dirty, input.fields, visibleRecovery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPageHide = () => { flushActiveDraft(activeDraftRef.current); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    if (!scope || !currentScopeKey || !ready || !input.dirty || visibleRecovery) return;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      try {
        const result = writeEditorDraftIfChanged(window.localStorage, scope, input.fields);
        setSavedAt(result.draft.savedAt);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentScopeKey, input.dirty, input.fields, ready, visibleRecovery]); // eslint-disable-line react-hooks/exhaustive-deps

  function acceptRecovery() {
    const fields = visibleRecovery?.fields ?? null;
    if (activeDraftRef.current?.key === currentScopeKey) activeDraftRef.current.recoveryPending = false;
    setRecovery(null);
    setStatus(fields ? "saved" : "idle");
    return fields;
  }

  function discardRecovery() {
    if (!scope) return;
    try {
      removeEditorDraft(window.localStorage, scope);
      if (activeDraftRef.current?.key === currentScopeKey) activeDraftRef.current.recoveryPending = false;
      setRecovery(null);
      setSavedAt(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function clearAfterServerSave() {
    if (!scope) return;
    try {
      removeEditorDraft(window.localStorage, scope);
      if (activeDraftRef.current?.key === currentScopeKey) activeDraftRef.current.dirty = false;
      setRecovery(null);
      setSavedAt(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function persistNow(fields = input.fields) {
    if (!scope || visibleRecovery) return null;
    try {
      const result = writeEditorDraftIfChanged(window.localStorage, scope, fields);
      if (activeDraftRef.current?.key === currentScopeKey) {
        activeDraftRef.current.fields = fields;
        activeDraftRef.current.dirty = true;
      }
      setSavedAt(result.draft.savedAt);
      setStatus("saved");
      return result.draft;
    } catch {
      setStatus("error");
      return null;
    }
  }

  return { recovery: visibleRecovery, status: visibleStatus, savedAt, ready, acceptRecovery, discardRecovery, clearAfterServerSave, persistNow };
}
