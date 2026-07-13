import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPaletteItems,
  createArticleLoadCoordinator,
  createPaletteSearchCoordinator,
  isPaletteShortcut,
  movePaletteIndex,
  normalizePaletteQuery,
  paletteShortcutAction,
  readArticleDiscussion,
  readPostContent,
  readSearchPosts,
  selectCatalogArticle,
  selectSearchArticle,
  shouldChoosePaletteItem,
  shouldMovePaletteSelection,
  submitArticleComment,
  toggleArticleInteraction,
  updateArticleCommentDraft,
  type ArticleDiscussions,
  type SearchPost,
} from "../lib/command-palette";

const catalog = {
  categories: ["Frontend", "Backend"],
  tags: ["Next.js", "PostgreSQL"],
  posts: [],
};

function searchPost(overrides: Partial<SearchPost> = {}): SearchPost {
  return {
    id: "post-1",
    title: "索引设计复盘",
    summary: "一次真实慢查询",
    tags: ["PostgreSQL"],
    authorDisplayName: "Mika Chen",
    authorHandle: "mika",
    publishedAt: "2026-07-07T00:00:00.000Z",
    readTimeMinutes: 11,
    ...overrides,
  };
}

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
    posts: [searchPost()],
  });
  const post = items.find((item) => item.group === "文章");
  assert.deepEqual(post?.destination, {
    kind: "post",
    post: searchPost(),
  });
  assert.equal(post?.description, "一次真实慢查询");
});

test("搜索响应只接收面板需要的类型安全字段", () => {
  assert.deepEqual(readSearchPosts({ posts: [
    { ...searchPost({ title: "标题", summary: "摘要", tags: ["A"] }), tags: ["A", 2], content: "原始正文", contentHtml: "<p>正文</p>", passwordHash: "ignored" },
    { id: 2, title: "无效", summary: "无效" },
  ] }), [searchPost({ title: "标题", summary: "摘要", tags: ["A"] })]);
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

test("已打开的命令面板再次按快捷键会走统一关闭动作", () => {
  const shortcut = { key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(paletteShortcutAction(false, shortcut), "open");
  assert.equal(paletteShortcutAction(true, shortcut), "close");
});

test("命令面板文章之后打开普通卡片会替换为普通文章", () => {
  let selected = selectSearchArticle(searchPost({ id: "search-result", title: "命令面板文章", summary: "来自搜索", tags: ["Search"] }), "<p>搜索正文</p>");
  selected = selectCatalogArticle({
    title: "普通文章卡片",
    excerpt: "来自首页",
    category: "Frontend",
    tags: ["Next.js"],
    contentHtml: "<p>普通文章正文</p>",
    author: "Sky Pan",
    initials: "SP",
    published: "2026 年 7 月 5 日",
    readTime: "6 分钟阅读",
  });

  assert.equal(selected.source, "catalog");
  assert.equal(selected.title, "普通文章卡片");
  assert.equal(selected.summary, "来自首页");
  assert.equal(selected.contentHtml, "<p>普通文章正文</p>");
  assert.equal(selected.authorDisplayName, "Sky Pan");
  assert.equal(selected.publishedLabel, "2026 年 7 月 5 日");
});

test("快速修改查询时旧请求不能恢复结果且 Enter 只会选择当前查询文章", () => {
  const coordinator = createPaletteSearchCoordinator();
  const oldRequest = coordinator.begin("agent");
  const currentRequest = coordinator.begin("postgres");
  assert.equal(coordinator.isCurrent(oldRequest), false);
  assert.equal(coordinator.isCurrent(currentRequest), true);

  const staleItems = buildPaletteItems({
    ...catalog,
    query: "postgres",
    resultQuery: "agent",
    posts: [searchPost({ id: "old", title: "Agent 旧结果", summary: "旧查询", tags: [] })],
  });
  assert.equal(staleItems.some((item) => item.destination.kind === "post"), false);

  const currentItems = buildPaletteItems({
    categories: [],
    tags: [],
    query: "postgres",
    resultQuery: "postgres",
    posts: [searchPost({ id: "current", title: "Postgres 当前结果", summary: "新查询", tags: [] })],
  });
  const enterSelection = currentItems[0];
  assert.equal(enterSelection?.destination.kind, "post");
  if (enterSelection?.destination.kind === "post") assert.equal(enterSelection.destination.post.id, "current");
});

test("分类、中文和重复标签生成合法稳定且唯一的 option ID", () => {
  const aiItems = buildPaletteItems({ categories: ["AI Engineering"], tags: [], posts: [], query: "ai" });
  const tagItems = buildPaletteItems({
    categories: [],
    tags: ["中文标签", "重复标签", "重复标签"],
    posts: [],
    query: "标签",
  });
  const items = [...aiItems, ...tagItems];
  const ids = items.map((item) => item.id);

  assert.ok(ids.every((id) => !/\s/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    buildPaletteItems({ categories: ["AI Engineering"], tags: [], posts: [], query: "ai" }).map((item) => item.id),
    aiItems.map((item) => item.id),
  );
  const activeId = tagItems[2]?.id;
  assert.ok(activeId);
  assert.ok(tagItems.some((item) => item.id === activeId));
});

test("IME 组合输入期间 Enter 不选择结果", () => {
  assert.equal(shouldChoosePaletteItem({ key: "Enter", isComposing: true, inputFocused: true }), false);
  assert.equal(shouldChoosePaletteItem({ key: "Enter", isComposing: false, inputFocused: true }), true);
  assert.equal(shouldChoosePaletteItem({ key: "Enter", isComposing: false, inputFocused: false }), false);
});

test("IME 组合输入期间方向键不移动命令面板选项", () => {
  assert.equal(shouldMovePaletteSelection({ key: "ArrowDown", isComposing: true }), false);
  assert.equal(shouldMovePaletteSelection({ key: "ArrowUp", isComposing: true }), false);
  assert.equal(shouldMovePaletteSelection({ key: "ArrowDown", isComposing: false }), true);
  assert.equal(shouldMovePaletteSelection({ key: "ArrowUp", isComposing: false }), true);
  assert.equal(shouldMovePaletteSelection({ key: "Enter", isComposing: false }), false);
});

test("文章正文只从选择后的详情响应读取", () => {
  assert.equal(readPostContent({ post: { contentHtml: "<p>受权限保护的正文</p>", content: "不用于渲染" } }), "<p>受权限保护的正文</p>");
  assert.equal(readPostContent({ post: { summary: "只有摘要" } }), null);
});

test("搜索与文章详情 API 分别使用轻量投影和受权限保护的读取服务", () => {
  const searchRoute = readFileSync(new URL("../app/api/search/route.ts", import.meta.url), "utf8");
  const postRoute = readFileSync(new URL("../app/api/posts/[id]/route.ts", import.meta.url), "utf8");
  assert.match(searchRoute, /toSearchResponse\(await services\(\)\.search\.search\(actor, input\)\)/);
  assert.match(postRoute, /posts\.read\(actor, id\)/);
});

test("点赞和收藏状态按文章 ID 隔离", () => {
  let interactions = toggleArticleInteraction({}, "post-a", "liked");
  interactions = toggleArticleInteraction(interactions, "post-a", "bookmarked");
  assert.deepEqual(interactions["post-a"], { liked: true, bookmarked: true });
  assert.deepEqual(interactions["post-b"] ?? { liked: false, bookmarked: false }, { liked: false, bookmarked: false });
  interactions = toggleArticleInteraction(interactions, "post-b", "liked");
  assert.equal(interactions["post-a"]?.liked, true);
  assert.equal(interactions["post-b"]?.liked, true);
});

test("搜索文章选择后显示其作者、日期和阅读时长", () => {
  const selected = selectSearchArticle(searchPost(), "<p>正文</p>");
  assert.equal(selected.authorDisplayName, "Mika Chen");
  assert.equal(selected.authorInitials, "MC");
  assert.equal(selected.publishedLabel, "2026年7月7日");
  assert.equal(selected.readTimeLabel, "11 分钟阅读");
});

test("慢文章详情响应在目录文章或导航后不能覆盖较新的选择", () => {
  const coordinator = createArticleLoadCoordinator();
  const slowPaletteRequest = coordinator.begin();
  let selectedTitle = "目录文章";
  coordinator.invalidate();

  assert.equal(slowPaletteRequest.signal.aborted, true);
  assert.equal(coordinator.isCurrent(slowPaletteRequest), false);
  if (coordinator.isCurrent(slowPaletteRequest)) selectedTitle = "过期命令面板文章";
  assert.equal(selectedTitle, "目录文章");

  const currentRequest = coordinator.begin();
  assert.equal(coordinator.isCurrent(currentRequest), true);
  coordinator.finish(currentRequest);
});

test("评论草稿和讨论记录按文章 ID 隔离", () => {
  let discussions: ArticleDiscussions = {
    "article-a": { draft: "", comments: [{ id: "mika-a", author: "Mika", initials: "MK", body: "只属于 A" }] },
  };
  discussions = updateArticleCommentDraft(discussions, "article-a", "A 的未提交草稿");
  assert.equal(readArticleDiscussion(discussions, "article-b").draft, "");
  assert.deepEqual(readArticleDiscussion(discussions, "article-b").comments, []);

  discussions = updateArticleCommentDraft(discussions, "article-b", "B 的草稿");
  discussions = submitArticleComment(discussions, "article-b", { id: "member-b", author: "当前成员", initials: "ME", body: "B 的评论" });
  assert.equal(readArticleDiscussion(discussions, "article-a").draft, "A 的未提交草稿");
  assert.deepEqual(readArticleDiscussion(discussions, "article-a").comments.map((comment) => comment.body), ["只属于 A"]);
  assert.deepEqual(readArticleDiscussion(discussions, "article-b"), {
    draft: "",
    comments: [{ id: "member-b", author: "当前成员", initials: "ME", body: "B 的评论" }],
  });
});
