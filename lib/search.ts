import { canReadPost } from "./authorization";
import { DomainError, type Actor, type PostRecord } from "./domain";
import type { Repository } from "./repository";

export interface SearchProvider { search(query: string): Promise<PostRecord[]>; }
export class PostgresSearchProvider implements SearchProvider { constructor(private repo: Repository) {} search(query: string) { return this.repo.searchPosts(query); } }
export class SearchService {
  constructor(private provider: SearchProvider) {}
  async search(actor: Actor, queryInput: string) { const query = queryInput.trim().slice(0, 200); if (query.length < 2) throw new DomainError("INVALID_INPUT", "搜索词至少需要 2 个字符", 400); return (await this.provider.search(query)).filter((post) => canReadPost(actor, post)); }
}
