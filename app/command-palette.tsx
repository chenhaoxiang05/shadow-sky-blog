"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import {
  buildPaletteItems,
  createPaletteSearchCoordinator,
  movePaletteIndex,
  normalizePaletteQuery,
  paletteShortcutAction,
  readSearchPosts,
  shouldChoosePaletteItem,
  shouldMovePaletteSelection,
  type PaletteDestination,
  type SearchPost,
} from "@/lib/command-palette";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (destination: PaletteDestination) => void | Promise<void>;
  categories: string[];
  tags: string[];
};

export function CommandPalette({ open, onOpenChange, onSelect, categories, tags }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; posts: SearchPost[] }>({ query: "", posts: [] });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const searchCoordinatorRef = useRef(createPaletteSearchCoordinator());

  const close = useCallback(() => {
    searchCoordinatorRef.current.invalidate();
    onOpenChange(false);
    setQuery("");
    setResults({ query: "", posts: [] });
    setStatus("idle");
  }, [onOpenChange]);

  const normalizedQuery = normalizePaletteQuery(query);
  const items = useMemo(
    () => buildPaletteItems({
      query,
      categories,
      tags,
      posts: normalizedQuery.length >= 2 ? results.posts : [],
      resultQuery: results.query,
    }),
    [categories, normalizedQuery.length, query, results, tags],
  );
  const safeActiveIndex = activeIndex >= 0 && activeIndex < items.length ? activeIndex : items.length ? 0 : -1;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const action = paletteShortcutAction(open, event);
      if (action === "ignore") return;
      event.preventDefault();
      if (action === "close") close();
      else onOpenChange(true);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [close, onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      searchCoordinatorRef.current.invalidate();
      return;
    }
    const normalized = normalizePaletteQuery(query);
    if (normalized.length < 2) {
      searchCoordinatorRef.current.invalidate();
      return;
    }
    const request = searchCoordinatorRef.current.begin(normalized);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}&pageSize=8`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("SEARCH_UNAVAILABLE");
        const posts = readSearchPosts(await response.json());
        if (controller.signal.aborted || !searchCoordinatorRef.current.isCurrent(request)) return;
        setResults({ query: request.query, posts });
        setActiveIndex(0);
        setStatus("idle");
      } catch {
        if (controller.signal.aborted || !searchCoordinatorRef.current.isCurrent(request)) return;
        setResults({ query: request.query, posts: [] });
        setStatus("error");
      }
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  if (!open) return null;

  function updateQuery(value: string) {
    const normalized = normalizePaletteQuery(value);
    searchCoordinatorRef.current.invalidate();
    setQuery(value);
    setActiveIndex(0);
    if (normalized.length < 2) {
      setResults({ query: "", posts: [] });
      setStatus("idle");
      return;
    }
    setStatus("loading");
  }

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    void onSelect(item.destination);
    close();
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) close();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (shouldMovePaletteSelection({ key: event.key, isComposing: event.nativeEvent.isComposing })) {
      event.preventDefault();
      setActiveIndex((current) => movePaletteIndex(current, event.key === "ArrowDown" ? 1 : -1, items.length));
      return;
    }
    if (shouldChoosePaletteItem({
      key: event.key,
      isComposing: event.nativeEvent.isComposing,
      inputFocused: document.activeElement === inputRef.current,
    })) {
      event.preventDefault();
      choose(safeActiveIndex);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not([disabled])") ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const hint = normalizedQuery.length === 1 ? "再输入一个字符即可搜索文章" : "输入关键词搜索文章、分类、标签或页面";

  return (
    <div className="command-backdrop" onMouseDown={handleBackdrop}>
      <div
        ref={dialogRef}
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="command-title" className="sr-only">全局搜索与导航</h2>
        <div className="command-input-row">
          <span className="command-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="搜索文章、分类、标签或页面…"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={safeActiveIndex >= 0 ? items[safeActiveIndex]?.id : undefined}
          />
          <button type="button" className="command-close" onClick={close} aria-label="关闭命令面板">Esc</button>
        </div>

        <div className="command-status" aria-live="polite">
          {normalizedQuery.length >= 2 && status === "loading" ? <span role="status">正在搜索…</span> : null}
          {normalizedQuery.length >= 2 && status === "error" ? <span role="alert">搜索暂时不可用，请稍后重试。页面导航仍可使用。</span> : null}
        </div>

        <div id="command-results" className="command-results" role="listbox" aria-label="搜索结果">
          {items.map((item, index) => (
            <button
              type="button"
              id={item.id}
              key={item.id}
              role="option"
              aria-selected={index === safeActiveIndex}
              className={index === safeActiveIndex ? "command-result active" : "command-result"}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="command-result-kind">{item.group}</span>
              <span><b>{item.label}</b><small>{item.description}</small></span>
              <span className="command-enter" aria-hidden="true">↵</span>
            </button>
          ))}
          {!items.length && status !== "loading" ? (
            <div className="command-empty" role="status">
              <b>没有找到相关内容</b>
              <span>{normalizedQuery.length < 2 ? hint : "试试更短的关键词或检查拼写。"}</span>
            </div>
          ) : null}
        </div>

        <div className="command-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
