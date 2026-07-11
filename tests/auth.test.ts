import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "../lib/auth-service";
import { DomainError, type UserRecord } from "../lib/domain";
import { hashPassword, hashToken } from "../lib/security";
import { MemoryRepository, actor } from "./helpers/memory-repository";

const PEPPER = "test-password-pepper-32-characters-minimum";
const SECRET = "test-session-secret-32-characters-minimum";
async function setup(status: "ACTIVE" | "DISABLED" = "ACTIVE") { const repo = new MemoryRepository(); const user: UserRecord = { id: "user-1", email: "member@example.com", handle: "member", displayName: "成员", passwordHash: await hashPassword("correct-password-123", PEPPER), role: "MEMBER", status, publishingPolicy: "REVIEW_REQUIRED" }; repo.addUser(user); return { repo, user, service: new AuthService(repo, PEPPER, SECRET) }; }
async function rejectsCode(promise: Promise<unknown>, code: DomainError["code"]) { await assert.rejects(promise, (error: unknown) => error instanceof DomainError && error.code === code); }

test("正确密码登录并创建轮换 Session", async () => { const { service, repo } = await setup(); const result = await service.login({ login: "member", password: "correct-password-123", requestId: "r1" }); assert.equal(result.user.id, "user-1"); assert.ok(repo.sessions.has(hashToken(result.sessionToken, SECRET))); });
test("错误密码返回通用错误并记录失败", async () => { const { service, repo } = await setup(); await rejectsCode(service.login({ login: "member", password: "wrong", requestId: "r2" }), "UNAUTHENTICATED"); assert.equal(repo.audits.at(-1)?.action, "LOGIN_FAILURE"); });
test("禁用用户不能登录", async () => { const { service } = await setup("DISABLED"); await rejectsCode(service.login({ login: "member", password: "correct-password-123", requestId: "r3" }), "UNAUTHENTICATED"); });
test("无效和过期邀请都被拒绝", async () => { const { service, repo } = await setup(); await rejectsCode(service.acceptInvitation({ token: "x".repeat(64), password: "another-password-123", handle: "newuser", displayName: "新用户", requestId: "r4" }), "INVALID_INPUT"); repo.addInvitation({ id: "expired", email: "new@example.com", tokenHash: hashToken("y".repeat(64), SECRET), role: "MEMBER", publishingPolicy: "REVIEW_REQUIRED", expiresAt: new Date("2020-01-01") }); await rejectsCode(service.acceptInvitation({ token: "y".repeat(64), password: "another-password-123", handle: "newuser", displayName: "新用户", requestId: "r5" }), "INVALID_INPUT"); });
test("过期或撤销 Session 失效", async () => { const { service, repo } = await setup(); repo.sessions.set(hashToken("expired", SECRET), { id: "s", userId: "user-1", tokenHash: hashToken("expired", SECRET), csrfHash: "x", expiresAt: new Date("2020-01-01") }); await rejectsCode(service.authenticate("expired"), "SESSION_EXPIRED"); await rejectsCode(service.authenticate(undefined), "UNAUTHENTICATED"); });
test("Admin 可修改发布策略且 Editor 和本人不可以", async () => { const { service, repo } = await setup(); await service.updateUserAccess(actor("admin", "ADMIN"), "user-1", { publishingPolicy: "DIRECT_PUBLISH" }, "r6"); assert.equal(repo.users.get("user-1")?.publishingPolicy, "DIRECT_PUBLISH"); assert.equal(repo.audits.at(-1)?.action, "PUBLISHING_POLICY_CHANGED"); await rejectsCode(service.updateUserAccess(actor("editor", "EDITOR"), "user-1", { publishingPolicy: "REVIEW_REQUIRED" }, "r7"), "FORBIDDEN"); await rejectsCode(service.updateUserAccess(actor("user-1", "ADMIN"), "user-1", { publishingPolicy: "REVIEW_REQUIRED" }, "r8"), "FORBIDDEN"); });
