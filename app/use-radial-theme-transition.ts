"use client";

import { useCallback, useMemo, useSyncExternalStore, type RefObject } from "react";
import { flushSync } from "react-dom";
import {
  applyThemePreference,
  createRadialThemeTransitionRunner,
  getThemeToggleLabel,
  nextTheme,
  normalizeTheme,
  readThemePreference,
  type Theme,
  type ThemeStorageLike,
} from "../lib/theme-transition";

function browserStorage(): ThemeStorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function prefersDarkTheme(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function supportsPseudoElementAnimation(): boolean {
  try {
    return typeof CSS !== "undefined"
      && typeof CSS.supports === "function"
      && CSS.supports("selector(::view-transition-new(root))");
  } catch {
    return false;
  }
}

function createThemeStore(): {
  getSnapshot: () => Theme;
  getServerSnapshot: () => Theme;
  subscribe: (listener: () => void) => () => void;
  setTheme: (theme: Theme) => void;
} {
  const rootTheme = typeof document === "undefined"
    ? null
    : normalizeTheme(document.documentElement.dataset.theme);
  let currentTheme = rootTheme
    ?? (typeof window === "undefined"
      ? "dark"
      : readThemePreference(browserStorage(), prefersDarkTheme()));
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => currentTheme,
    getServerSnapshot: () => "dark",
    subscribe(listener) {
      let active = true;
      listeners.add(listener);
      queueMicrotask(() => {
        if (active) listener();
      });
      return () => {
        active = false;
        listeners.delete(listener);
      };
    },
    setTheme(nextTheme) {
      if (currentTheme === nextTheme) return;
      currentTheme = nextTheme;
      listeners.forEach((listener) => { listener(); });
    },
  };
}

export function useRadialThemeTransition(
  buttonRef: RefObject<HTMLButtonElement | null>,
): {
  theme: Theme;
  toggleTheme: () => Promise<void>;
  toggleLabel: string;
} {
  const themeStore = useMemo(() => createThemeStore(), []);
  const runner = useMemo(() => createRadialThemeTransitionRunner(), []);
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  const toggleTheme = useCallback(async () => {
    const next = nextTheme(theme);
    const storage = browserStorage();
    const commitTheme = () => {
      flushSync(() => {
        applyThemePreference(next, document.documentElement, storage);
        themeStore.setTheme(next);
      });
    };
    const button = buttonRef.current;

    if (!button) {
      commitTheme();
      return;
    }

    const startViewTransition = typeof document.startViewTransition === "function"
      ? (update: () => void) => document.startViewTransition(update)
      : undefined;
    const animateRoot = typeof document.documentElement.animate === "function"
      ? (keyframes: PropertyIndexedKeyframes, options: KeyframeAnimationOptions) => (
        document.documentElement.animate(keyframes, options)
      )
      : undefined;

    await runner.run({
      buttonRect: button.getBoundingClientRect(),
      commitTheme,
      runtime: {
        startViewTransition,
        animateRoot,
        prefersReducedMotion: prefersReducedMotion(),
        supportsPseudoElementAnimation: supportsPseudoElementAnimation(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
    });
  }, [buttonRef, runner, theme, themeStore]);

  return {
    theme,
    toggleTheme,
    toggleLabel: getThemeToggleLabel(theme),
  };
}
