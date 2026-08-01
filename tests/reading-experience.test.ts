import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateReadingEnd,
  calculateReadingProgress,
  createPostLayoutActionScheduler,
  createReadingFrameScheduler,
  findActiveReadingHeading,
  focusAndScrollReadingHeading,
  readingScrollBehavior,
  scheduleReadingHeadingNavigation,
  shouldShowBackToTop,
  slugifyReadingHeading,
  uniqueReadingHeadingId,
} from "../lib/reading-experience";

test("正文标题生成稳定且可读的 hash", () => {
  assert.equal(slugifyReadingHeading("  从 Demo 到系统  ", 0), "从-demo-到系统");
  assert.equal(slugifyReadingHeading("API & Security", 1), "api-security");
  assert.equal(slugifyReadingHeading("---", 2), "section-3");
});

test("重复标题获得唯一锚点且不会覆盖既有章节", () => {
  const used = new Set<string>();
  assert.equal(uniqueReadingHeadingId("summary", used), "summary");
  assert.equal(uniqueReadingHeadingId("summary", used), "summary-2");
  assert.equal(uniqueReadingHeadingId("summary", used), "summary-3");
});

test("阅读进度在正文范围内计算并限制到 0 到 100", () => {
  assert.equal(calculateReadingProgress(50, 100, 500), 0);
  assert.equal(calculateReadingProgress(300, 100, 500), 50);
  assert.equal(calculateReadingProgress(700, 100, 500), 100);
});

test("短正文的阅读进度不会产生 NaN", () => {
  assert.equal(calculateReadingProgress(50, 100, 100), 0);
  assert.equal(calculateReadingProgress(100, 100, 100), 100);
});

test("完全位于可视阅读区域内的短正文显示为已读完", () => {
  const start = 100;
  const end = calculateReadingEnd(start, 500, 700);
  assert.equal(end, -100);
  assert.equal(calculateReadingProgress(0, start, end), 100);
});

test("当前章节根据阅读偏移稳定切换", () => {
  const headings = [{ id: "one", top: 200 }, { id: "two", top: 700 }, { id: "three", top: 1200 }];
  assert.equal(findActiveReadingHeading(headings, 0), "one");
  assert.equal(findActiveReadingHeading(headings, 600), "two");
  assert.equal(findActiveReadingHeading(headings, 1500), "three");
  assert.equal(findActiveReadingHeading([], 500), "");
});

test("viewport 重排会先重新测量标题位置再更新目录高亮", () => {
  let positions = [{ id: "one", top: 200 }, { id: "two", top: 700 }];
  let activeId = findActiveReadingHeading(positions, 400);
  let pendingFrame: (() => void) | undefined;
  let nextFrame = 0;
  const cancelled: number[] = [];
  const events: string[] = [];
  const scheduler = createReadingFrameScheduler({
    requestFrame(callback) {
      pendingFrame = callback;
      return ++nextFrame;
    },
    cancelFrame(frame) {
      cancelled.push(frame);
    },
    collectLayout() {
      events.push("measure");
      positions = [{ id: "one", top: 200 }, { id: "two", top: 450 }];
    },
    updateState() {
      events.push("update");
      activeId = findActiveReadingHeading(positions, 400);
    },
  });

  assert.equal(activeId, "one");
  scheduler.schedule();
  scheduler.schedule(true);
  pendingFrame?.();

  assert.deepEqual(events, ["measure", "update"]);
  assert.equal(activeId, "two");
  assert.deepEqual(cancelled, [1]);
  scheduler.dispose();
});

test("移动目录先折叠并等待布局提交后再滚动到重新定位的章节", () => {
  let tocOpen = true;
  let pendingFrame: (() => void) | undefined;
  let frameId = 0;
  let scrolledTop = 0;
  const cancelled: number[] = [];
  const scheduler = createPostLayoutActionScheduler({
    requestFrame(callback) {
      pendingFrame = callback;
      return ++frameId;
    },
    cancelFrame(frame) {
      cancelled.push(frame);
    },
  });

  scheduleReadingHeadingNavigation(
    () => { tocOpen = false; },
    scheduler,
    () => { scrolledTop = tocOpen ? 900 : 600; },
  );

  assert.equal(tocOpen, false);
  assert.equal(scrolledTop, 0);
  pendingFrame?.();
  assert.equal(scrolledTop, 600);

  let firstRan = false;
  let secondRan = false;
  scheduleReadingHeadingNavigation(() => {}, scheduler, () => { firstRan = true; });
  const staleFrame = pendingFrame;
  scheduleReadingHeadingNavigation(() => {}, scheduler, () => { secondRan = true; });
  const latestFrame = pendingFrame;
  staleFrame?.();
  latestFrame?.();
  assert.equal(firstRan, false);
  assert.equal(secondRan, true);
  assert.deepEqual(cancelled, [2]);

  scheduleReadingHeadingNavigation(() => {}, scheduler, () => { secondRan = false; });
  const unmountedFrame = pendingFrame;
  scheduler.dispose();
  unmountedFrame?.();
  assert.equal(secondRan, true);
  assert.deepEqual(cancelled, [2, 4]);
});

test("章节跳转遵守 reduced-motion 偏好", () => {
  assert.equal(readingScrollBehavior(true), "auto");
  assert.equal(readingScrollBehavior(false), "smooth");
});

test("章节跳转先转移键盘焦点再滚动", () => {
  const events: string[] = [];
  focusAndScrollReadingHeading({
    focus(options) { events.push(`focus:${options?.preventScroll}`); },
    scrollIntoView(options) { events.push(`scroll:${options?.behavior}:${options?.block}`); },
  }, "smooth");
  assert.deepEqual(events, ["focus:true", "scroll:smooth:start"]);
});

test("返回顶部按钮由实际滚动距离控制而不是短正文完成度", () => {
  assert.equal(shouldShowBackToTop(0, 100), false);
  assert.equal(shouldShowBackToTop(100, 100), false);
  assert.equal(shouldShowBackToTop(340, 100), false);
  assert.equal(shouldShowBackToTop(341, 100), true);
});

test("切换文章会以新文章标识重新初始化目录测量", () => {
  const component = readFileSync(new URL("../app/reading-experience.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(component, /articleKey: string/);
  assert.match(component, /\[active, articleKey, articleRef\]/);
  assert.match(page, /<ReadingExperience key=\{selectedArticle\.id\}/);
  assert.match(page, /articleKey=\{selectedArticle\.id\}/);
  assert.match(page, /nextArticle\.id !== selectedArticle\.id && window\.location\.hash/g);
});

test("移动端保留阅读目录而只隐藏其他辅助侧栏", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.reading-layout aside:not\(\.reading-toc\)\{display:none\}/);
  assert.doesNotMatch(styles, /\.reading-layout aside\{display:none\}/);
  assert.match(styles, /\.reading-toc\{[^}]*max-height:calc\(100vh - 124px\)[^}]*overflow-y:auto/);
});

test("阅读进度和重排观察都使用正文边界", () => {
  const component = readFileSync(new URL("../app/reading-experience.tsx", import.meta.url), "utf8");
  assert.match(component, /querySelector<HTMLElement>\("\.prose"\)/);
  assert.match(component, /proseElement\.getBoundingClientRect\(\)/);
  assert.match(component, /calculateReadingEnd\(start, proseElement\.scrollHeight/);
  assert.match(component, /resizeObserver\?\.observe\(proseElement\)/);
});
