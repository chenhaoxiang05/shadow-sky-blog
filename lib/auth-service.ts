import { canChangeRoleOrPolicy, canManageUsers, hasRole } from "./authorization";
import { defaultPublishingPolicy, DomainError, type Actor, type PublishingPolicy, type Role, type UserStatus } from "./domain";
import type { Repository } from "./repository";
import { hashPassword, hashPrivacyValue, hashToken, opaqueToken, verifyPassword } from "./security";

const SESSION_HOURS = 24 * 14;
const LOGIN_LIMIT = 8;

export class AuthService {
  constructor(private repo: Repository, private pepper?: string, private secret?: string) {}

  async login(input: { login: string; password: string; ip?: string; userAgent?: string; oldSessionToken?: string; requestId: string; now?: Date }) {
    const now = input.now ?? new Date();
    const keyHash = hashPrivacyValue(`${input.login.trim().toLowerCase()}|${input.ip ?? "unknown"}`, this.secret);
    const limit = await this.repo.getLoginLimit(keyHash, now);
    if ((limit.lockedUntil && limit.lockedUntil > now) || limit.count >= LOGIN_LIMIT) throw new DomainError("RATE_LIMITED", "登录尝试过多，请稍后重试", 429);
    const user = await this.repo.findUserByLogin(input.login.trim().toLowerCase());
    const valid = user ? await verifyPassword(user.passwordHash, input.password, this.pepper) : await verifyPassword(await hashPassword("not-a-real-password", this.pepper), input.password, this.pepper);
    if (!user || !valid || user.deletedAt || user.status !== "ACTIVE") {
      await this.repo.recordLoginFailure(keyHash, now);
      await this.repo.audit({ action: "LOGIN_FAILURE", targetType: "AUTH", targetId: user?.id, requestId: input.requestId, outcome: "FAILURE", reason: "INVALID_CREDENTIALS_OR_DISABLED" });
      throw new DomainError("UNAUTHENTICATED", "用户名、邮箱或密码不正确", 401);
    }
    if (input.oldSessionToken) await this.repo.revokeSessionByTokenHash(hashToken(input.oldSessionToken, this.secret), now);
    const sessionToken = opaqueToken(); const csrfToken = opaqueToken(); const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3_600_000);
    await this.repo.createSession({ userId: user.id, tokenHash: hashToken(sessionToken, this.secret), csrfHash: hashToken(csrfToken, this.secret), expiresAt, ipHash: input.ip ? hashPrivacyValue(input.ip, this.secret) : undefined, userAgent: input.userAgent?.slice(0, 512), now });
    await this.repo.clearLoginFailures(keyHash);
    await this.repo.audit({ actorId: user.id, action: "LOGIN_SUCCESS", targetType: "AUTH", targetId: user.id, requestId: input.requestId });
    return { user: withoutPassword(user), sessionToken, csrfToken, expiresAt };
  }

  async authenticate(sessionToken: string | undefined, now = new Date()) {
    if (!sessionToken) throw new DomainError("UNAUTHENTICATED", "请先登录", 401);
    const result = await this.repo.findSessionByTokenHash(hashToken(sessionToken, this.secret));
    if (!result || result.session.revokedAt || result.session.expiresAt <= now) throw new DomainError("SESSION_EXPIRED", "登录状态已失效，请重新登录", 401);
    if (result.user.status !== "ACTIVE" || result.user.deletedAt) { await this.repo.revokeAllUserSessions(result.user.id, now); throw new DomainError("FORBIDDEN", "账户已被禁用", 403); }
    return { user: result.user, session: result.session, actor: toActor(result.user) };
  }

  async logout(sessionToken: string | undefined, actorId: string | undefined, requestId: string, now = new Date()) {
    if (sessionToken) await this.repo.revokeSessionByTokenHash(hashToken(sessionToken, this.secret), now);
    await this.repo.audit({ actorId, action: "LOGOUT", targetType: "AUTH", targetId: actorId, requestId });
  }

  async acceptInvitation(input: { token: string; password: string; handle: string; displayName: string; requestId: string; now?: Date }) {
    const now = input.now ?? new Date();
    const passwordHash = await hashPassword(input.password, this.pepper);
    const user = await this.repo.acceptInvitation({ tokenHash: hashToken(input.token, this.secret), passwordHash, handle: input.handle, displayName: input.displayName, now });
    if (!user) throw new DomainError("INVALID_INPUT", "邀请无效、已过期或已被使用", 400);
    await this.repo.audit({ actorId: user.id, action: "INVITATION_ACCEPTED", targetType: "INVITATION", targetId: user.id, requestId: input.requestId });
    return withoutPassword(user);
  }

  async createInvitation(actor: Actor, input: { email: string; role: Exclude<Role, "VISITOR">; publishingPolicy?: PublishingPolicy; expiresInHours?: number; requestId: string }, now = new Date()) {
    if (!canManageUsers(actor)) throw new DomainError("FORBIDDEN", "权限不足", 403);
    const publishingPolicy = input.publishingPolicy ?? defaultPublishingPolicy(input.role);
    const token = opaqueToken(); const invitation = await this.repo.createInvitation({ email: input.email.trim().toLowerCase(), tokenHash: hashToken(token, this.secret), role: input.role, publishingPolicy, invitedBy: actor.userId!, expiresAt: new Date(now.getTime() + (input.expiresInHours ?? 72) * 3_600_000) });
    await this.repo.audit({ actorId: actor.userId, action: "INVITATION_CREATED", targetType: "INVITATION", targetId: invitation.id, requestId: input.requestId, metadata: { role: input.role, publishingPolicy } });
    return { invitation, token };
  }

  async updateUserAccess(actor: Actor, targetId: string, changes: { role?: Exclude<Role, "VISITOR">; publishingPolicy?: PublishingPolicy; status?: UserStatus }, requestId: string, now = new Date()) {
    if (!canChangeRoleOrPolicy(actor, targetId)) throw new DomainError("FORBIDDEN", "只有 Owner 或 Admin 可以修改其他用户的访问权限", 403);
    const before = await this.repo.findUserById(targetId); if (!before) throw new DomainError("NOT_FOUND", "用户不存在", 404);
    const updated = await this.repo.updateUserAccess(targetId, changes, now); if (!updated) throw new DomainError("NOT_FOUND", "用户不存在", 404);
    if (changes.role && changes.role !== before.role) await this.repo.audit({ actorId: actor.userId, action: "USER_ROLE_CHANGED", targetType: "USER", targetId, requestId, metadata: { from: before.role, to: changes.role } });
    if (changes.publishingPolicy && changes.publishingPolicy !== before.publishingPolicy) await this.repo.audit({ actorId: actor.userId, action: "PUBLISHING_POLICY_CHANGED", targetType: "USER", targetId, requestId, metadata: { from: before.publishingPolicy, to: changes.publishingPolicy } });
    if (changes.status && changes.status !== before.status) { await this.repo.audit({ actorId: actor.userId, action: "USER_STATUS_CHANGED", targetType: "USER", targetId, requestId, metadata: { from: before.status, to: changes.status } }); if (changes.status === "DISABLED") await this.repo.revokeAllUserSessions(targetId, now); }
    return withoutPassword(updated);
  }

  async changePassword(actor: Actor, currentPassword: string, nextPassword: string, requestId: string, now = new Date()) {
    if (!hasRole(actor, "MEMBER")) throw new DomainError("FORBIDDEN", "权限不足", 403);
    const user = await this.repo.findUserById(actor.userId!); if (!user || !(await verifyPassword(user.passwordHash, currentPassword, this.pepper))) throw new DomainError("UNAUTHENTICATED", "当前密码不正确", 401);
    await this.repo.updatePassword(user.id, await hashPassword(nextPassword, this.pepper), now); await this.repo.revokeAllUserSessions(user.id, now); await this.repo.audit({ actorId: user.id, action: "PASSWORD_CHANGED", targetType: "USER", targetId: user.id, requestId });
  }
}

export const toActor = (user: UserRecordLike): Actor => ({ userId: user.id, role: user.role, status: user.status, publishingPolicy: user.publishingPolicy });
type UserRecordLike = { id: string; role: Exclude<Role, "VISITOR">; status: UserStatus; publishingPolicy: PublishingPolicy };
export const withoutPassword = <T extends { passwordHash: string }>(user: T): Omit<T, "passwordHash"> => { const safe = { ...user } as Partial<T>; delete safe.passwordHash; return safe as Omit<T, "passwordHash">; };
