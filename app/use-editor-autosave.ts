"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  editorDraftScope,
  editorDraftStorageKeyBelongsToScope,
  editorDraftStorageKey,
  editorDraftRevision,
  editorDraftPersistedOnSuspend,
  editorDraftStorageFailureNeedsEmergencyCopy,
  readEditorDraft,
  rebaseEditorDraftAfterExternalRemoval,
  resolveExternalEditorDraftConflict,
  removeEditorDraftAfterServerSave,
  removeEditorDraftIfRevisionMatches,
  safeFlushPendingEditorDraft,
  writeEditorDraftSnapshot,
  writeEditorDraftIfChanged,
  type EditorDraftFields,
  type EditorDraftScope,
  type StoredEditorDraft,
} from "@/lib/editor-autosave";

type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "recovery" | "conflict";
type RecoveryKind = "startup" | "conflict";

type ActiveDraft = {
  key: string;
  scope: EditorDraftScope;
  fields: EditorDraftFields;
  dirty: boolean;
  recoveryPending: boolean;
  baselineRevision: string | null;
  conflictRevision: string | null;
  writerId: string;
  sequence: number;
};

function scopeKey(scope: EditorDraftScope | null) {
  return scope ? editorDraftStorageKey(scope.userId, scope.draftId) : null;
}

function flushActiveDraft(active: ActiveDraft | null) {
  if (!active) return { kind: "skipped" } as const;
  try {
    const revision = editorDraftRevision(active.writerId, ++active.sequence);
    const result = safeFlushPendingEditorDraft(window.localStorage, {
      scope: active.scope,
      fields: active.fields,
      dirty: active.dirty,
      recoveryPending: active.recoveryPending,
      baselineRevision: active.baselineRevision,
      revision,
      writerId: active.writerId,
    });
    if ((result.kind === "written" || result.kind === "unchanged") && result.draft) {
      active.baselineRevision = result.draft.revision;
    }
    return result;
  } catch {
    return { kind: "error" } as const;
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
  const [recoveryKind, setRecoveryKind] = useState<RecoveryKind | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const activeDraftRef = useRef<ActiveDraft | null>(null);
  const suspendedScopeKeyRef = useRef<string | null>(null);
  const [writerId] = useState(() => crypto.randomUUID());
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
        const active = activeDraftRef.current;
        if (active?.key === currentLifecycleKey) {
          activeDraftRef.current = {
            ...active,
            baselineRevision: stored?.revision ?? null,
            conflictRevision: null,
            recoveryPending: Boolean(stored),
          };
        }
        setRecovery(stored);
        setRecoveryKind(stored ? "startup" : null);
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
      baselineRevision: null,
      conflictRevision: null,
      writerId,
      sequence: 0,
    };
    return () => {
      const active = activeDraftRef.current;
      if (active?.key === currentLifecycleKey) {
        flushActiveDraft(active);
        activeDraftRef.current = null;
      }
    };
  }, [currentLifecycleKey, writerId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!scope || !currentLifecycleKey) return;
    const onStorage = (event: StorageEvent) => {
      if (!editorDraftStorageKeyBelongsToScope(event.key, scope)) return;
      try {
        const latest = readEditorDraft(window.localStorage, scope);
        const active = activeDraftRef.current;
        if (active?.key !== currentLifecycleKey) return;
        if (!latest) {
          const removal = rebaseEditorDraftAfterExternalRemoval(active);
          if (removal.action === "clear-recovery") {
            activeDraftRef.current = { ...active, baselineRevision: null, conflictRevision: null, recoveryPending: false };
            setRecovery(null);
            setRecoveryKind(null);
            setSavedAt(null);
            setStatus("idle");
          } else if (removal.action === "flush" || removal.action === "rebase") {
            const rebased = { ...active, baselineRevision: null };
            activeDraftRef.current = rebased;
            if (removal.action === "flush") {
              const result = flushActiveDraft(rebased);
              if (result.kind === "written" || result.kind === "unchanged") {
                setSavedAt(result.draft.savedAt);
                setStatus("saved");
              } else setStatus("error");
            }
          }
          return;
        }
        if (latest.writerId === writerId || latest.revision === active.baselineRevision) return;
        const conflict = resolveExternalEditorDraftConflict({
          currentDirty: active.dirty,
          currentRevision: active.baselineRevision,
          externalRevision: latest.revision,
        });
        const pending = { ...active, conflictRevision: latest.revision, recoveryPending: false };
        const persisted = conflict.persistCurrentBeforeBlocking
          ? writeEditorDraftSnapshot(window.localStorage, active.scope, active.fields, new Date(), {
            revision: editorDraftRevision(active.writerId, active.sequence + 1),
            writerId: active.writerId,
          })
          : { kind: "skipped" } as const;
        activeDraftRef.current = {
          ...pending,
          sequence: conflict.persistCurrentBeforeBlocking ? active.sequence + 1 : active.sequence,
          baselineRevision: persisted.kind === "written" ? persisted.draft.revision : active.baselineRevision,
          recoveryPending: true,
          dirty: editorDraftStorageFailureNeedsEmergencyCopy({ dirty: active.dirty, persistResultKind: persisted.kind }),
        };
        setRecovery(latest);
        setRecoveryKind("conflict");
        setSavedAt(latest.savedAt);
        setStatus(persisted.kind === "error" ? "error" : "conflict");
      } catch {
        setStatus("error");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentLifecycleKey, writerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scope || !currentLifecycleKey || !ready || !input.dirty || visibleRecovery) return;
    const timer = window.setTimeout(() => {
      if (suspendedScopeKeyRef.current === currentLifecycleKey) return;
      setStatus("saving");
      const active = activeDraftRef.current;
      if (active?.key !== currentLifecycleKey) return;
      const pending = { ...active, fields: input.fields };
      activeDraftRef.current = pending;
      const result = flushActiveDraft(pending);
      if (result.kind === "written" || result.kind === "unchanged") {
        setSavedAt(result.draft.savedAt);
        setStatus("saved");
      } else if (result.kind === "conflict" && result.draft) {
        activeDraftRef.current = { ...pending, recoveryPending: true };
        setRecovery(result.draft);
        setRecoveryKind("conflict");
        setStatus("conflict");
      } else {
        setStatus("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentLifecycleKey, input.dirty, input.fields, ready, visibleRecovery]); // eslint-disable-line react-hooks/exhaustive-deps

  function acceptRecovery() {
    const fields = visibleRecovery?.fields ?? null;
    const active = activeDraftRef.current;
    if (active?.key === currentLifecycleKey) {
      activeDraftRef.current = {
        ...active,
        recoveryPending: false,
        baselineRevision: visibleRecovery?.revision ?? null,
        conflictRevision: null,
      };
    }
    setRecovery(null);
    setRecoveryKind(null);
    setStatus(fields ? "saved" : "idle");
    return fields;
  }

  function discardRecovery() {
    if (!scope) return;
    try {
      const active = activeDraftRef.current?.key === currentLifecycleKey ? activeDraftRef.current : null;
      if (recoveryKind === "conflict") {
        if (!active || !visibleRecovery) return;
        if (!active.dirty) {
          const discarded = removeEditorDraftIfRevisionMatches(window.localStorage, scope, visibleRecovery.revision);
          if (!discarded.removed) {
            activeDraftRef.current = {
              ...active,
              conflictRevision: discarded.current.revision,
              recoveryPending: true,
            };
            setRecovery(discarded.current);
            setSavedAt(discarded.current.savedAt);
            setStatus("conflict");
            return;
          }
          activeDraftRef.current = { ...active, conflictRevision: null, recoveryPending: false };
        } else {
          const resolved = writeEditorDraftIfChanged(window.localStorage, scope, active.fields, new Date(), {
            expectedRevision: visibleRecovery.revision,
            revision: editorDraftRevision(active.writerId, active.sequence + 1),
            writerId: active.writerId,
          });
          if (resolved.conflict) {
            if (resolved.draft) {
              activeDraftRef.current = { ...active, conflictRevision: resolved.draft.revision, recoveryPending: true };
              setRecovery(resolved.draft);
              setSavedAt(resolved.draft.savedAt);
            }
            setStatus("conflict");
            return;
          }
          removeEditorDraftIfRevisionMatches(window.localStorage, scope, visibleRecovery.revision);
          activeDraftRef.current = {
            ...active,
            sequence: active.sequence + 1,
            baselineRevision: resolved.written ? resolved.draft.revision : null,
            conflictRevision: null,
            recoveryPending: false,
          };
          setSavedAt(resolved.written ? resolved.draft.savedAt : null);
        }
      } else {
        const discarded = visibleRecovery
          ? removeEditorDraftIfRevisionMatches(window.localStorage, scope, visibleRecovery.revision)
          : { removed: true, current: null } as const;
        if (!discarded.removed) {
          if (active) {
            activeDraftRef.current = {
              ...active,
              conflictRevision: discarded.current.revision,
              recoveryPending: true,
            };
          }
          setRecovery(discarded.current);
          setRecoveryKind("conflict");
          setSavedAt(discarded.current.savedAt);
          setStatus("conflict");
          return;
        }
        if (active) {
          activeDraftRef.current = {
            ...active,
            baselineRevision: null,
            conflictRevision: null,
            recoveryPending: false,
          };
        }
      }
      setRecovery(null);
      setRecoveryKind(null);
      setSavedAt(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function captureServerSaveBaseline() {
    const active = activeDraftRef.current?.key === currentLifecycleKey ? activeDraftRef.current : null;
    return active?.baselineRevision ?? null;
  }

  function clearAfterServerSave(savedFields: EditorDraftFields, submittedBaseline: string | null) {
    if (!scope) return;
    try {
      const active = activeDraftRef.current?.key === currentLifecycleKey ? activeDraftRef.current : null;
      const removed = removeEditorDraftAfterServerSave(window.localStorage, scope, savedFields, submittedBaseline);
      if (removed) {
        if (active) {
          activeDraftRef.current = {
            ...active,
            dirty: false,
            baselineRevision: null,
            conflictRevision: null,
            recoveryPending: false,
          };
        }
        setRecovery(null);
        setRecoveryKind(null);
        setSavedAt(null);
        setStatus("idle");
      } else {
        const current = readEditorDraft(window.localStorage, scope);
        if (active) {
          activeDraftRef.current = {
            ...active,
            dirty: false,
            recoveryPending: Boolean(current),
          };
        }
        setRecovery(current);
        setRecoveryKind(current ? "conflict" : null);
        setSavedAt(current?.savedAt ?? null);
        setStatus(current ? "conflict" : "idle");
      }
      return removed;
    } catch {
      setStatus("error");
      return false;
    }
  }

  function persistNow(fields = input.fields) {
    if (!scope || visibleRecovery) return null;
    const active = activeDraftRef.current?.key === currentLifecycleKey ? activeDraftRef.current : null;
    if (!active) return null;
    const pending = { ...active, fields, dirty: true };
    activeDraftRef.current = pending;
    const result = flushActiveDraft(pending);
    if (result.kind === "written" || result.kind === "unchanged") {
      setSavedAt(result.draft.savedAt);
      setStatus("saved");
      return result.draft;
    }
    if (result.kind === "conflict" && result.draft) {
      activeDraftRef.current = { ...pending, recoveryPending: true };
      setRecovery(result.draft);
      setRecoveryKind("conflict");
      setStatus("conflict");
    } else setStatus("error");
    return null;
  }

  function suspendForIdentityLoss(latest?: { fields: EditorDraftFields; dirty: boolean }) {
    const current = activeDraftRef.current;
    const active = current && latest ? { ...current, fields: latest.fields, dirty: latest.dirty } : current;
    if (active) activeDraftRef.current = active;
    const result = flushActiveDraft(active);
    const persisted = editorDraftPersistedOnSuspend({ dirty: Boolean(active?.dirty) }, result.kind);
    suspendedScopeKeyRef.current = active?.key ?? null;
    activeDraftRef.current = null;
    setRecovery(null);
    setRecoveryKind(null);
    setLoadedScopeKey(null);
    setSavedAt(null);
    setStatus("idle");
    return { persisted };
  }

  function deactivate() {
    const active = activeDraftRef.current;
    if (active) flushActiveDraft(active);
    activeDraftRef.current = null;
    suspendedScopeKeyRef.current = null;
    setRecovery(null);
    setRecoveryKind(null);
    setLoadedScopeKey(null);
    setSavedAt(null);
    setStatus("idle");
  }

  return { recovery: visibleRecovery, recoveryKind, status: visibleStatus, savedAt, ready, acceptRecovery, discardRecovery, captureServerSaveBaseline, clearAfterServerSave, persistNow, suspendForIdentityLoss, deactivate };
}
