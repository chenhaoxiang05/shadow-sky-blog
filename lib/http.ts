import { AuthService, toActor } from "./auth-service";
import { DomainError, type Actor } from "./domain";
import { PostService } from "./post-service";
import { PostgresRepository } from "../db/repository";
import { assertCsrf, readCookie, SESSION_COOKIE } from "./security";

export function services() { const repo = new PostgresRepository(); return { repo, auth: new AuthService(repo), posts: new PostService(repo) }; }
export async function currentAuth(request: Request) { const { auth } = services(); return auth.authenticate(readCookie(request, SESSION_COOKIE)); }
export async function optionalActor(request: Request): Promise<Actor> { try { return (await currentAuth(request)).actor; } catch { return { role: "VISITOR", status: "ACTIVE", publishingPolicy: "REVIEW_REQUIRED" }; } }
export async function mutationAuth(request: Request) { const result = await currentAuth(request); try { assertCsrf(request, result.session.csrfHash); } catch { throw new DomainError("FORBIDDEN", "安全令牌无效，请刷新页面后重试", 403); } return result; }
export function requestId(request: Request) { return request.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID(); }
export function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || undefined; }
export function json(data: unknown, init?: ResponseInit) { return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } }); }
export function errorResponse(error: unknown) { if (error instanceof DomainError) return json({ error: { code: error.code, message: error.message } }, { status: error.status }); console.error("Request failed", error instanceof Error ? error.message : "unknown"); return json({ error: { code: "INTERNAL_ERROR", message: "请求暂时无法完成" } }, { status: 500 }); }
export { toActor };
