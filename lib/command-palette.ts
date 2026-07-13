export type PaletteView = "home" | "articles" | "profile" | "studio" | "bookmarks" | "admin";

export type PaletteDestination =
  | { kind: "page"; view: PaletteView }
  | { kind: "category"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "post"; post: SearchPost };

export type PaletteItem = {
  id: string;
  label: string;
  description: string;
  group: "页面" | "分类" | "标签" | "文章";
  destination: PaletteDestination;
};

export type SearchPost = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  authorDisplayName: string;
  authorHandle: string;
  publishedAt: string | null;
  readTimeMinutes: number;
};

export type ArticleSelection = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  contentHtml: string;
  authorDisplayName: string;
  authorInitials: string;
  publishedLabel: string;
  readTimeLabel: string;
  source: "catalog" | "search";
};

export function selectCatalogArticle(article: {
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  contentHtml: string;
  author: string;
  initials: string;
  published: string;
  readTime: string;
}): ArticleSelection {
  return {
    id: `catalog-${stableHash(article.title)}`,
    title: article.title,
    summary: article.excerpt,
    tags: [article.category, ...article.tags],
    contentHtml: article.contentHtml,
    authorDisplayName: article.author,
    authorInitials: article.initials,
    publishedLabel: article.published,
    readTimeLabel: article.readTime,
    source: "catalog",
  };
}

function initialsFor(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase();
  return Array.from(words[0] ?? "成员").slice(0, 2).join("").toLocaleUpperCase();
}

function formatPublishedAt(value: string | null) {
  if (!value) return "尚未发布";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "发布时间未知";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

export function selectSearchArticle(post: SearchPost, contentHtml: string): ArticleSelection {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    tags: [...post.tags],
    contentHtml,
    authorDisplayName: post.authorDisplayName,
    authorInitials: initialsFor(post.authorDisplayName || post.authorHandle),
    publishedLabel: formatPublishedAt(post.publishedAt),
    readTimeLabel: `${post.readTimeMinutes} 分钟阅读`,
    source: "search",
  };
}

export function readPostContent(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("post" in payload) || !payload.post || typeof payload.post !== "object") return null;
  const contentHtml = (payload.post as Record<string, unknown>).contentHtml;
  return typeof contentHtml === "string" ? contentHtml : null;
}

export type ArticleInteraction = { liked: boolean; bookmarked: boolean };
export type ArticleInteractions = Record<string, ArticleInteraction>;

export function toggleArticleInteraction(
  interactions: ArticleInteractions,
  articleId: string,
  field: keyof ArticleInteraction,
): ArticleInteractions {
  const current = interactions[articleId] ?? { liked: false, bookmarked: false };
  return { ...interactions, [articleId]: { ...current, [field]: !current[field] } };
}

export type ArticleComment = { id: string; author: string; initials: string; body: string };
export type ArticleDiscussion = { draft: string; comments: ArticleComment[] };
export type ArticleDiscussions = Record<string, ArticleDiscussion>;

export function readArticleDiscussion(discussions: ArticleDiscussions, articleId: string): ArticleDiscussion {
  return discussions[articleId] ?? { draft: "", comments: [] };
}

export function updateArticleCommentDraft(discussions: ArticleDiscussions, articleId: string, draft: string): ArticleDiscussions {
  const current = readArticleDiscussion(discussions, articleId);
  return { ...discussions, [articleId]: { ...current, draft } };
}

export function submitArticleComment(discussions: ArticleDiscussions, articleId: string, comment: ArticleComment): ArticleDiscussions {
  const current = readArticleDiscussion(discussions, articleId);
  return { ...discussions, [articleId]: { draft: "", comments: [...current.comments, comment] } };
}

export type ArticleLoadRequest = Readonly<{ generation: number; signal: AbortSignal }>;

export function createArticleLoadCoordinator() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    begin(): ArticleLoadRequest {
      controller?.abort();
      controller = new AbortController();
      generation += 1;
      return { generation, signal: controller.signal };
    },
    invalidate() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
    isCurrent(request: ArticleLoadRequest) {
      return request.generation === generation && !request.signal.aborted;
    },
    finish(request: ArticleLoadRequest) {
      if (request.generation === generation) controller = null;
    },
  };
}

export function readSearchPosts(payload: unknown): SearchPost[] {
  if (!payload || typeof payload !== "object" || !("posts" in payload) || !Array.isArray(payload.posts)) return [];
  return payload.posts.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.id !== "string" || typeof record.title !== "string" || typeof record.summary !== "string" ||
      typeof record.authorDisplayName !== "string" || typeof record.authorHandle !== "string" ||
      !(record.publishedAt === null || typeof record.publishedAt === "string") ||
      typeof record.readTimeMinutes !== "number" || !Number.isFinite(record.readTimeMinutes) || record.readTimeMinutes < 1
    ) return [];
    const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [];
    return [{
      id: record.id,
      title: record.title,
      summary: record.summary,
      tags,
      authorDisplayName: record.authorDisplayName,
      authorHandle: record.authorHandle,
      publishedAt: record.publishedAt,
      readTimeMinutes: Math.ceil(record.readTimeMinutes),
    }];
  });
}

const pageItems: PaletteItem[] = [
  { id: "page-home", label: "首页", description: "返回社区首页", group: "页面", destination: { kind: "page", view: "home" } },
  { id: "page-articles", label: "文章库", description: "浏览和筛选社区文章", group: "页面", destination: { kind: "page", view: "articles" } },
  { id: "page-profile", label: "成员主页", description: "查看成员和公开作品", group: "页面", destination: { kind: "page", view: "profile" } },
  { id: "page-studio", label: "创作中心", description: "管理自己的文章", group: "页面", destination: { kind: "page", view: "studio" } },
  { id: "page-bookmarks", label: "我的收藏", description: "继续阅读已收藏内容", group: "页面", destination: { kind: "page", view: "bookmarks" } },
  { id: "page-admin", label: "管理后台", description: "用户、审核和站点管理", group: "页面", destination: { kind: "page", view: "admin" } },
];

export function normalizePaletteQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

type PaletteSearchRequest = Readonly<{ query: string; revision: number }>;

export function createPaletteSearchCoordinator() {
  let currentQuery = "";
  let revision = 0;

  return {
    begin(query: string): PaletteSearchRequest {
      currentQuery = normalizePaletteQuery(query);
      revision += 1;
      return { query: currentQuery, revision };
    },
    invalidate() {
      currentQuery = "";
      revision += 1;
    },
    isCurrent(request: PaletteSearchRequest) {
      return request.revision === revision && request.query === currentQuery;
    },
  };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createPaletteOptionId(kind: "category" | "tag" | "post", value: string, index: number) {
  const slug = value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
  return `palette-${kind}-${slug}-${stableHash(value)}-${index}`;
}

function matches(item: Pick<PaletteItem, "label" | "description">, query: string) {
  return `${item.label} ${item.description}`.toLocaleLowerCase().includes(query);
}

export function buildPaletteItems(input: {
  query: string;
  categories: string[];
  tags: string[];
  posts: SearchPost[];
  resultQuery?: string;
}) {
  const query = normalizePaletteQuery(input.query);
  const categories: PaletteItem[] = input.categories.map((category, index) => ({
    id: createPaletteOptionId("category", category, index),
    label: category,
    description: "按分类浏览文章",
    group: "分类",
    destination: { kind: "category", value: category },
  }));
  const tags: PaletteItem[] = input.tags.map((tag, index) => ({
    id: createPaletteOptionId("tag", tag, index),
    label: tag,
    description: "查看包含此标签的文章",
    group: "标签",
    destination: { kind: "tag", value: tag },
  }));
  const posts: PaletteItem[] = (
    input.resultQuery === undefined || normalizePaletteQuery(input.resultQuery) === query ? input.posts : []
  ).map((post, index) => ({
    id: createPaletteOptionId("post", post.id, index),
    label: post.title,
    description: post.summary || post.tags.join(" · ") || "打开文章",
    group: "文章",
    destination: { kind: "post", post },
  }));

  if (!query) return [...pageItems.slice(0, 5), ...categories.slice(0, 4)];
  return [
    ...pageItems.filter((item) => matches(item, query)),
    ...categories.filter((item) => matches(item, query)),
    ...tags.filter((item) => matches(item, query)),
    ...posts,
  ];
}

export function movePaletteIndex(current: number, delta: -1 | 1, length: number) {
  if (length <= 0) return -1;
  const safeCurrent = current < 0 || current >= length ? 0 : current;
  return (safeCurrent + delta + length) % length;
}

export function isPaletteShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">) {
  return event.key.toLocaleLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}

export function paletteShortcutAction(open: boolean, event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">) {
  if (!isPaletteShortcut(event)) return "ignore" as const;
  return open ? "close" as const : "open" as const;
}

export function shouldChoosePaletteItem(event: { key: string; isComposing: boolean; inputFocused: boolean }) {
  return event.key === "Enter" && event.inputFocused && !event.isComposing;
}
