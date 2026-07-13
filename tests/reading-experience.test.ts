import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateReadingEnd,
  calculateReadingProgress,
  createReadingFrameScheduler,
  findActiveReadingHeading,
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
