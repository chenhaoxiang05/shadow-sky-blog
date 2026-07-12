import assert from "node:assert/strict";
import test from "node:test";
import {
  RADIAL_THEME_DURATION_MS,
  RADIAL_THEME_EASING,
  THEME_STORAGE_KEY,
  applyThemePreference,
  calculateButtonCenter,
  calculateRevealRadius,
  createRadialThemeTransitionRunner,
  getThemeToggleLabel,
  resolveInitialTheme,
  type RadialThemeRuntime,
  type ThemeRootLike,
  type ThemeStorageLike,
} from "../lib/theme-transition";

function runtime(overrides: Partial<RadialThemeRuntime> = {}): RadialThemeRuntime {
  return {
    startViewTransition(update) {
      update();
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    },
    animateRoot() {
      return { finished: Promise.resolve() };
    },
    prefersReducedMotion: false,
    supportsPseudoElementAnimation: true,
    viewport: { width: 100, height: 80 },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("径向半径覆盖视口四角", () => {
  const x = 20;
  const y = 30;
  const width = 100;
  const height = 80;
  const radius = calculateRevealRadius(x, y, width, height);
  assert.equal(radius, Math.hypot(80, 50));
  for (const [cornerX, cornerY] of [[0, 0], [width, 0], [0, height], [width, height]]) {
    assert.ok(radius >= Math.hypot(cornerX - x, cornerY - y));
  }
});

test("主题按钮中心坐标来自按钮矩形", () => {
  assert.deepEqual(
    calculateButtonCenter({ left: 100, top: 40, width: 48, height: 40 }),
    { x: 124, y: 60 },
  );
});

test("主题初始化优先使用有效存储值并回退到系统偏好", () => {
  assert.equal(resolveInitialTheme("light", true), "light");
  assert.equal(resolveInitialTheme("dark", false), "dark");
  assert.equal(resolveInitialTheme(null, true), "dark");
  assert.equal(resolveInitialTheme("invalid", false), "light");
});

test("主题状态同步到根元素并保存到单一存储字段", () => {
  const values = new Map<string, string>();
  const storage: ThemeStorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  const root: ThemeRootLike = { dataset: {}, style: { colorScheme: "" } };
  applyThemePreference("light", root, storage);
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.style.colorScheme, "light");
  assert.equal(values.get(THEME_STORAGE_KEY), "light");
  assert.equal(values.size, 1);
});

test("View Transition 不支持时直接切换主题", async () => {
  const runner = createRadialThemeTransitionRunner();
  let commits = 0;
  const result = await runner.run({
    buttonRect: { left: 0, top: 0, width: 40, height: 40 },
    commitTheme: () => { commits++; },
    runtime: runtime({ startViewTransition: undefined }),
  });
  assert.equal(result, "fallback");
  assert.equal(commits, 1);
  assert.equal(runner.isRunning(), false);
});

test("prefers-reduced-motion 时不启动波纹", async () => {
  const runner = createRadialThemeTransitionRunner();
  let starts = 0;
  let commits = 0;
  const result = await runner.run({
    buttonRect: { left: 0, top: 0, width: 40, height: 40 },
    commitTheme: () => { commits++; },
    runtime: runtime({
      prefersReducedMotion: true,
      startViewTransition(update) {
        starts++;
        update();
        return { ready: Promise.resolve(), finished: Promise.resolve() };
      },
    }),
  });
  assert.equal(result, "fallback");
  assert.equal(starts, 0);
  assert.equal(commits, 1);
});

test("伪元素动画不可用或抛错时主题仍正常切换", async () => {
  for (const overrides of [
    { supportsPseudoElementAnimation: false },
    { animateRoot: () => { throw new Error("unsupported"); } },
  ] satisfies Array<Partial<RadialThemeRuntime>>) {
    const runner = createRadialThemeTransitionRunner();
    let commits = 0;
    const result = await runner.run({
      buttonRect: { left: 10, top: 10, width: 40, height: 40 },
      commitTheme: () => { commits++; },
      runtime: runtime(overrides),
    });
    assert.equal(result, "fallback");
    assert.equal(commits, 1);
    assert.equal(runner.isRunning(), false);
  }
});

test("新主题快照使用按钮中心、完整半径和规定动画参数", async () => {
  let keyframes: PropertyIndexedKeyframes | undefined;
  let options: KeyframeAnimationOptions | undefined;
  const runner = createRadialThemeTransitionRunner();
  const buttonRect = { left: 100, top: 40, width: 48, height: 40 };
  const viewport = { width: 800, height: 600 };
  const result = await runner.run({
    buttonRect,
    commitTheme: () => undefined,
    runtime: runtime({
      viewport,
      animateRoot(frames, animationOptions) {
        keyframes = frames;
        options = animationOptions;
        return { finished: Promise.resolve() };
      },
    }),
  });
  const { x, y } = calculateButtonCenter(buttonRect);
  const radius = calculateRevealRadius(x, y, viewport.width, viewport.height);
  assert.equal(result, "animated");
  assert.deepEqual(keyframes?.clipPath, [
    `circle(0px at ${x}px ${y}px)`,
    `circle(${radius}px at ${x}px ${y}px)`,
  ]);
  assert.equal(options?.duration, RADIAL_THEME_DURATION_MS);
  assert.equal(options?.easing, RADIAL_THEME_EASING);
  assert.equal(options?.pseudoElement, "::view-transition-new(root)");
});

test("快速重复点击不会创建并发主题过渡", async () => {
  const ready = deferred<void>();
  const transitionFinished = deferred<void>();
  const animationFinished = deferred<void>();
  const runner = createRadialThemeTransitionRunner();
  let starts = 0;
  let commits = 0;
  const sharedRuntime = runtime({
    startViewTransition(update) {
      starts++;
      update();
      return { ready: ready.promise, finished: transitionFinished.promise };
    },
    animateRoot() {
      return { finished: animationFinished.promise };
    },
  });
  const options = {
    buttonRect: { left: 12, top: 18, width: 44, height: 44 },
    commitTheme: () => { commits++; },
    runtime: sharedRuntime,
  };

  const first = runner.run(options);
  assert.equal(await runner.run(options), "ignored");
  assert.equal(starts, 1);
  assert.equal(commits, 1);
  ready.resolve();
  transitionFinished.resolve();
  animationFinished.resolve();
  assert.equal(await first, "animated");
  assert.equal(await runner.run(options), "animated");
  assert.equal(starts, 2);
  assert.equal(commits, 2);
});

test("View Transition Promise 失败会被处理并释放竞态锁", async () => {
  const runner = createRadialThemeTransitionRunner();
  let commits = 0;
  const result = await runner.run({
    buttonRect: { left: 0, top: 0, width: 44, height: 44 },
    commitTheme: () => { commits++; },
    runtime: runtime({
      startViewTransition(update) {
        update();
        return { ready: Promise.reject(new Error("skipped")), finished: Promise.resolve() };
      },
    }),
  });
  assert.equal(result, "fallback");
  assert.equal(commits, 1);
  assert.equal(runner.isRunning(), false);
});

test("主题按钮 aria-label 描述下一步操作", () => {
  assert.equal(getThemeToggleLabel("dark"), "切换到浅色模式");
  assert.equal(getThemeToggleLabel("light"), "切换到深色模式");
});
