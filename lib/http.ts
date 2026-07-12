import { createDatabaseContext, type Database, type DatabaseContext } from "../db";
import { PostgresRepository } from "../db/repository";
import { AuthService, toActor } from "./auth-service";
import { CommunityService } from "./community-service";
import { DomainError, type Actor } from "./domain";
import { MediaService } from "./media-service";
import { PostService } from "./post-service";
import { PostgresSearchProvider, SearchService } from "./search";
import { assertCsrf, readCookie, SESSION_COOKIE } from "./security";
import { LocalStorageProvider } from "./storage";
import { ZodError } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";

export function createServices(db: Database) {
  const repo = new PostgresRepository(db);
  const media = new MediaService(repo, new LocalStorageProvider());
  return {
    database: db,
    repo,
    auth: new AuthService(repo),
    posts: new PostService(repo, media),
    community: new CommunityService(repo),
    search: new SearchService(new PostgresSearchProvider(repo)),
    media,
  };
}

export type Services = ReturnType<typeof createServices>;
const requestServices = new AsyncLocalStorage<Services>();

export function services() {
  const value = requestServices.getStore();
  if (!value) throw new Error("Request services are unavailable");
  return value;
}

export function requestHandler<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
  contextFactory: () => DatabaseContext = createDatabaseContext,
) {
  return async (request: Request, ...args: Args) => {
    let context;
    let response: Response;
    try {
      context = contextFactory();
      response = await requestServices.run(createServices(context.db), () => handler(request, ...args));
    } catch (error) {
      response = errorResponse(error);
    }
    try { await context?.close(); }
    catch { console.error("DATABASE_CONTEXT_CLOSE_FAILED"); }
    return response;
  };
}

export function assertPasswordChanged(user: { mustChangePassword: boolean }) { if (user.mustChangePassword) throw new DomainError("PASSWORD_CHANGE_REQUIRED", "必须先修改临时密码", 403); }
export async function currentAuth(request: Request, options: { allowMustChangePassword?: boolean } = {}) { const result = await services().auth.authenticate(readCookie(request, SESSION_COOKIE)); if (!options.allowMustChangePassword) assertPasswordChanged(result.user); return result; }
export async function optionalActor(request: Request): Promise<Actor> { try { return (await currentAuth(request)).actor; } catch { return { role: "VISITOR", status: "ACTIVE", publishingPolicy: "REVIEW_REQUIRED" }; } }
export async function mutationAuth(request: Request, options: { allowMustChangePassword?: boolean } = {}) { const result = await currentAuth(request, options); try { assertCsrf(request, result.session.csrfHash); } catch { throw new DomainError("FORBIDDEN", "安全令牌无效，请刷新页面后重试", 403); } return result; }
export function requestId(request: Request) { return request.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID(); }
export function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || undefined; }
export function json(data: unknown, init?: ResponseInit) { return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } }); }
export function errorResponse(error: unknown) { if (error instanceof DomainError) return json({ error: { code: error.code, message: error.message } }, { status: error.status }); if (error instanceof ZodError) return json({ error: { code: "INVALID_INPUT", message: "请求参数无效" } }, { status: 400 }); console.error("Request failed", error instanceof Error ? error.name : "unknown"); return json({ error: { code: "INTERNAL_ERROR", message: "请求暂时无法完成" } }, { status: 500 }); }
export { toActor };
