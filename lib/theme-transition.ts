export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";
export const RADIAL_THEME_DURATION_MS = 600;
export const RADIAL_THEME_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ThemeStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeRootLike {
  dataset: { theme?: string };
  style: { colorScheme: string };
}

export interface ViewTransitionLike {
  ready: PromiseLike<unknown>;
  finished: PromiseLike<unknown>;
}

export interface AnimationLike {
  finished: PromiseLike<unknown>;
}

export interface RadialThemeRuntime {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
  animateRoot?: (
    keyframes: PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ) => AnimationLike;
  prefersReducedMotion: boolean;
  supportsPseudoElementAnimation: boolean;
  viewport: { width: number; height: number };
}

export type ThemeTransitionResult = "animated" | "fallback" | "ignored";

export function normalizeTheme(value: string | undefined | null): Theme | null {
  return value === "dark" || value === "light" ? value : null;
}

export function resolveInitialTheme(storedTheme: string | null, prefersDark: boolean): Theme {
  return normalizeTheme(storedTheme) ?? (prefersDark ? "dark" : "light");
}

export function readThemePreference(
  storage: ThemeStorageLike | null,
  prefersDark: boolean,
): Theme {
  if (!storage) return resolveInitialTheme(null, prefersDark);
  try {
    return resolveInitialTheme(storage.getItem(THEME_STORAGE_KEY), prefersDark);
  } catch {
    return resolveInitialTheme(null, prefersDark);
  }
}

export function applyThemePreference(
  theme: Theme,
  root: ThemeRootLike,
  storage: ThemeStorageLike | null,
  persist = true,
): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (!persist || !storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A blocked storage area must not prevent the visual theme from changing.
  }
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function getThemeToggleLabel(theme: Theme): string {
  return theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
}

export function calculateButtonCenter(rect: RectLike): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function calculateRevealRadius(
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  return Math.hypot(
    Math.max(x, width - x),
    Math.max(y, height - y),
  );
}

export function createRadialThemeTransitionRunner(): {
  isRunning: () => boolean;
  run: (options: {
    buttonRect: RectLike;
    commitTheme: () => void;
    runtime: RadialThemeRuntime;
  }) => Promise<ThemeTransitionResult>;
} {
  let running = false;

  return {
    isRunning: () => running,
    async run({ buttonRect, commitTheme, runtime }) {
      if (running) return "ignored";

      const canAnimate = Boolean(
        runtime.startViewTransition
        && runtime.animateRoot
        && runtime.supportsPseudoElementAnimation
        && !runtime.prefersReducedMotion,
      );

      if (!canAnimate) {
        commitTheme();
        return "fallback";
      }

      running = true;
      let committed = false;
      const commitOnce = () => {
        if (committed) return;
        committed = true;
        commitTheme();
      };

      try {
        let transition: ViewTransitionLike;
        try {
          transition = runtime.startViewTransition!(commitOnce);
        } catch {
          commitOnce();
          return "fallback";
        }

        try {
          await transition.ready;
        } catch {
          void Promise.resolve(transition.finished).catch(() => undefined);
          commitOnce();
          return "fallback";
        }

        const { x, y } = calculateButtonCenter(buttonRect);
        const radius = calculateRevealRadius(
          x,
          y,
          runtime.viewport.width,
          runtime.viewport.height,
        );

        try {
          const animation = runtime.animateRoot!(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: RADIAL_THEME_DURATION_MS,
              easing: RADIAL_THEME_EASING,
              pseudoElement: "::view-transition-new(root)",
            },
          );
          await Promise.allSettled([
            Promise.resolve(animation.finished),
            Promise.resolve(transition.finished),
          ]);
          return "animated";
        } catch {
          void Promise.resolve(transition.finished).catch(() => undefined);
          return "fallback";
        }
      } finally {
        running = false;
      }
    },
  };
}
