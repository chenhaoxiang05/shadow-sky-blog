"use client";

import { useEffect, useState } from "react";
import {
  readEditorDraft,
  removeEditorDraft,
  writeEditorDraft,
  type EditorDraftFields,
  type StoredEditorDraft,
} from "@/lib/editor-autosave";

type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "recovery";

export function useEditorAutosave(input: {
  draftId: string;
  fields: EditorDraftFields;
  enabled: boolean;
  dirty: boolean;
}) {
  const [recovery, setRecovery] = useState<StoredEditorDraft | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const visibleRecovery = recovery?.draftId === input.draftId ? recovery : null;
  const visibleStatus = status === "recovery" && !visibleRecovery ? "idle" : status;

  useEffect(() => {
    if (!input.enabled) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = readEditorDraft(window.localStorage, input.draftId);
        setRecovery(stored);
        setSavedAt(stored?.savedAt ?? null);
        setStatus(stored ? "recovery" : "idle");
      } catch {
        setRecovery(null);
        setStatus("error");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [input.draftId, input.enabled]);

  useEffect(() => {
    if (!input.enabled || !input.dirty || visibleRecovery) return;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      try {
        const stored = writeEditorDraft(window.localStorage, input.draftId, input.fields);
        setSavedAt(stored.savedAt);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [input.dirty, input.draftId, input.enabled, input.fields, visibleRecovery]);

  function acceptRecovery() {
    const fields = visibleRecovery?.fields ?? null;
    setRecovery(null);
    setStatus(fields ? "saved" : "idle");
    return fields;
  }

  function discardRecovery() {
    try {
      removeEditorDraft(window.localStorage, input.draftId);
      setRecovery(null);
      setSavedAt(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function clearAfterServerSave() {
    try {
      removeEditorDraft(window.localStorage, input.draftId);
      setRecovery(null);
      setSavedAt(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return { recovery: visibleRecovery, status: visibleStatus, savedAt, acceptRecovery, discardRecovery, clearAfterServerSave };
}
