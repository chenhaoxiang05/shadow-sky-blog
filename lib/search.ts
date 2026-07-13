import { canReadPost } from "./authorization";
import { DomainError, type Actor } from "./domain";
import type { Repository, SearchInput, SearchPage } from "./repository";

export type SearchRequest = Omit<SearchInput, "actor">;
export interface SearchProvider { search(input: SearchInput): Promise<SearchPage>; }
export class PostgresSearchProvider implements SearchProvider { constructor(private repo: Repository) {} search(input: SearchInput) { return this.repo.searchPosts(input); } }
export function toSearchResponse(result: SearchPage) {
  return {
    ...result,
    posts: result.posts.map((post) => ({
      id: post.id,
      title: post.title,
      summary: post.summary,
      tags: post.tags,
      authorDisplayName: post.authorDisplayName,
      authorHandle: post.authorHandle,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      readTimeMinutes: post.readTimeMinutes,
    })),
  };
}
export class SearchService {
  constructor(private provider: SearchProvider) {}
  async search(actor: Actor, input: SearchRequest) {
    const query = input.q?.trim().slice(0, 200); if (query && query.length < 2) throw new DomainError("INVALID_INPUT", "搜索词至少需要 2 个字符", 400);
    if (!query && !input.category && !input.tag && !input.author && !input.from && !input.to) throw new DomainError("INVALID_INPUT", "至少需要一个搜索或过滤条件", 400);
    const page = Math.max(1, input.page); const pageSize = Math.min(50, Math.max(1, input.pageSize));
    const result = await this.provider.search({ ...input, q: query, page, pageSize, actor });
    if (result.posts.some((post) => !canReadPost(actor, post))) throw new Error("SEARCH_PROVIDER_VISIBILITY_VIOLATION");
    return result;
  }
}
