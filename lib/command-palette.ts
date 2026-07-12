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
  contentHtml?: string;
};

export function readSearchPosts(payload: unknown): SearchPost[] {
  if (!payload || typeof payload !== "object" || !("posts" in payload) || !Array.isArray(payload.posts)) return [];
  return payload.posts.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.summary !== "string") return [];
    const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [];
    return [{
      id: record.id,
      title: record.title,
      summary: record.summary,
      tags,
      ...(typeof record.contentHtml === "string" ? { contentHtml: record.contentHtml } : {}),
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

function matches(item: Pick<PaletteItem, "label" | "description">, query: string) {
  return `${item.label} ${item.description}`.toLocaleLowerCase().includes(query);
}

export function buildPaletteItems(input: {
  query: string;
  categories: string[];
  tags: string[];
  posts: SearchPost[];
}) {
  const query = normalizePaletteQuery(input.query);
  const categories: PaletteItem[] = input.categories.map((category) => ({
    id: `category-${category}`,
    label: category,
    description: "按分类浏览文章",
    group: "分类",
    destination: { kind: "category", value: category },
  }));
  const tags: PaletteItem[] = input.tags.map((tag) => ({
    id: `tag-${tag}`,
    label: tag,
    description: "查看包含此标签的文章",
    group: "标签",
    destination: { kind: "tag", value: tag },
  }));
  const posts: PaletteItem[] = input.posts.map((post) => ({
    id: `post-${post.id}`,
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
