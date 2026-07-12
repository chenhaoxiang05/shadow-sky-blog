import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaletteItems,
  isPaletteShortcut,
  movePaletteIndex,
  normalizePaletteQuery,
  readSearchPosts,
} from "../lib/command-palette";

const catalog = {
  categories: ["Frontend", "Backend"],
  tags: ["Next.js", "PostgreSQL"],
  posts: [],
};

test("空查询显示高价值页面入口与分类", () => {
  const items = buildPaletteItems({ ...catalog, query: "" });
  assert.equal(items[0]?.label, "首页");
  assert.ok(items.some((item) => item.label === "文章库"));
  assert.ok(items.some((item) => item.label === "Frontend"));
  assert.ok(items.every((item) => item.group === "页面" || item.group === "分类"));
});

test("查询可以匹配主要页面、分类和标签", () => {
  assert.equal(buildPaletteItems({ ...catalog, query: "创作" })[0]?.label, "创作中心");
  assert.equal(buildPaletteItems({ ...catalog, query: "front" })[0]?.label, "Frontend");
  assert.equal(buildPaletteItems({ ...catalog, query: "postgres" })[0]?.label, "PostgreSQL");
});

test("文章结果保留服务端返回的标识和安全摘要", () => {
  const items = buildPaletteItems({
    ...catalog,
    query: "索引",
    posts: [{ id: "post-1", title: "索引设计复盘", summary: "一次真实慢查询", tags: ["PostgreSQL"] }],
  });
  const post = items.find((item) => item.group === "文章");
  assert.deepEqual(post?.destination, {
    kind: "post",
    post: { id: "post-1", title: "索引设计复盘", summary: "一次真实慢查询", tags: ["PostgreSQL"] },
  });
  assert.equal(post?.description, "一次真实慢查询");
});

test("搜索响应只接收面板需要的类型安全字段", () => {
  assert.deepEqual(readSearchPosts({ posts: [
    { id: "post-1", title: "标题", summary: "摘要", tags: ["A", 2], contentHtml: "<p>正文</p>", passwordHash: "ignored" },
    { id: 2, title: "无效", summary: "无效" },
  ] }), [{ id: "post-1", title: "标题", summary: "摘要", tags: ["A"], contentHtml: "<p>正文</p>" }]);
  assert.deepEqual(readSearchPosts(null), []);
});

test("查询规范化只移除边缘空白并忽略大小写", () => {
  assert.equal(normalizePaletteQuery("  Next.JS  "), "next.js");
});

test("上下键选择在列表首尾循环", () => {
  assert.equal(movePaletteIndex(0, -1, 4), 3);
  assert.equal(movePaletteIndex(3, 1, 4), 0);
  assert.equal(movePaletteIndex(-1, 1, 4), 1);
  assert.equal(movePaletteIndex(0, 1, 0), -1);
});

test("Ctrl+K 和 Command+K 打开命令面板", () => {
  assert.equal(isPaletteShortcut({ key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
  assert.equal(isPaletteShortcut({ key: "K", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }), true);
});

test("修饰键冲突和普通按键不会误触命令面板", () => {
  assert.equal(isPaletteShortcut({ key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }), false);
  assert.equal(isPaletteShortcut({ key: "k", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), false);
  assert.equal(isPaletteShortcut({ key: "p", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), false);
});
