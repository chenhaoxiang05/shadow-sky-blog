"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  editorDraftScope,
  editorDraftStorageKey,
  flushPendingEditorDraft,
  readEditorDraft,
  removeEditorDraft,
  removeEditorDraftIfFieldsMatch,
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
  identityRevision: number;
}) {
  const scope = input.enabled ? editorDraftScope(input.userId, input.draftId) : null;
  const currentScopeKey = scopeKey(scope);
  const currentLifecycleKey = currentScopeKey ? `${currentScopeKey}#${input.identityRevision}` : null;
  const [recovery, setRecovery] = useState<StoredEditorDraft | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const activeDraftRef = useRef<ActiveDraft | null>(null);
  const suspendedScopeKeyRef = useRef<string | null>(null);
  const visibleRecovery = recovery
    && scope
    && recovery.userId === scope.userId
    && recovery.draftId === scope.draftId
    ? recovery
    : null;
  const ready = Boolean(currentLifecycleKey && loadedScopeKey === currentLifecycleKey);
  const visibleStatus = status === "recovery" && !visibleRecovery ? "idle" : status;

  useEffect(() => {
    if (!scope || !currentLifecycleKey) return;
    const frame = window.requestAnimationFrame(() => {
      if (suspendedScopeKeyRef.current === currentLifecycleKey) return;
      try {
        const stored = readEditorDraft(window.localStorage, scope);
        setRecovery(stored);
        setSavedAt(stored?.savedAt ?? null);
        setStatus(stored ? "recovery" : "idle");
      } catch {
        setRecovery(null);
        setStatus("error");
      } finally {
        setLoadedScopeKey(currentLifecycleKey);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentLifecycleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!scope || !currentLifecycleKey) return;
    suspendedScopeKeyRef.current = null;
    activeDraftRef.current = {
      key: currentLifecycleKey,
      scope,
      fields: input.fields,
      dirty: input.dirty,
      recoveryPending: Boolean(visibleRecovery),
    };
    return () => {
      const active = activeDraftRef.current;
      if (active?.key === currentLifecycleKey) {
        flushActiveDraft(active);
        activeDraftRef.current = null;
      }
    };
  }, [currentLifecycleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const active = activeDraftRef.current;
    if (!scope || !currentLifecycleKey || active?.key !== currentLifecycleKey) return;
    active.fields = input.fields;
    active.dirty = input.dirty;
    active.recoveryPending = Boolean(visibleRecovery);
  }, [currentLifecycleKey, input.dirty, input.fields, visibleRecovery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPageHide = () => { flushActiveDraft(activeDraftRef.current); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    if (!scope || !currentLifecycleKey || !ready || !input.dirty || visibleRecovery) return;
    const timer = window.setTimeout(() => {
      if (suspendedScopeKeyRef.current === currentLifecycleKey) return;
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
  }, [currentLifecycleKey, input.dirty, input.fields, ready, visibleRecovery]); // eslint-disable-line react-hooks/exhaustive-deps

  function acceptRecovery() {
    const fields = visibleRecovery?.fields ?? null;
    if (activeDraftRef.current?.key === currentLifecycleKey) activeDraftRef.current.recoveryPending = false;
    setRecovery(null);
    setStatus(fields ? "saved" : "idle");
    return fields;
  }

  function discardRecovery() {
    if (!scope) return;
    try {
      removeEditorDraft(window.localStorage, scope);
      if (activeDraftRef.current?.key === currentLifecycleKey) activeDraftRef.current.recoveryPending = false;
      setRecovery(null);
      setSavedAt(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function clearAfterServerSave(savedFields: EditorDraftFields) {
    if (!scope) return;
    try {
      removeEditorDraftIfFieldsMatch(window.localStorage, scope, savedFields);
      if (activeDraftRef.current?.key === currentLifecycleKey) activeDraftRef.current.dirty = false;
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
      if (activeDraftRef.current?.key === currentLifecycleKey) {
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

  function suspendForIdentityLoss() {
    if (!currentLifecycleKey) return;
    suspendedScopeKeyRef.current = currentLifecycleKey;
    activeDraftRef.current = null;
    setRecovery(null);
    setLoadedScopeKey(null);
    setSavedAt(null);
    setStatus("idle");
  }

  return { recovery: visibleRecovery, status: visibleStatus, savedAt, ready, acceptRecovery, discardRecovery, clearAfterServerSave, persistNow, suspendForIdentityLoss };
}
