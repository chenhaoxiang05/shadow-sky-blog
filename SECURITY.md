# Security

## Implemented in Phase 2

- Argon2id 密码哈希：随机 16-byte salt、服务器端 pepper、版本化参数；密码长度 12–256。
- 不透明 256-bit Session Token；数据库只保存 SHA-256 keyed hash；HttpOnly、Secure、SameSite=Lax。
- 登录成功轮换 Session；密码修改或账户禁用立即撤销全部 Session。
- 双提交 CSRF Token、严格同源校验和 SameSite=Strict CSRF Cookie。
- 登录失败按账户标识 + 隐私化 IP 哈希限流，返回通用错误。
- 所有角色、publishingPolicy、authorId、reviewedBy 和状态转换均由服务端决定。
- Markdown 经过 allowlist 清理；外链添加 `noopener noreferrer nofollow`，图片仅允许 HTTPS。
- 用户、文章、评论软删除；关键安全和业务操作写审计日志。
- 响应不返回密码哈希、Session Token、数据库地址或堆栈。

## Known dependency advisory

当前 `npm audit --omit=dev` 报告 Next.js 间接依赖的 PostCSS 中等级告警。自动 `--force` 修复会把 Next.js 破坏性降级到不兼容版本，因此未执行。升级到包含修复且与 Vinext 兼容的 Next.js 版本后应重新验证并移除此记录。

## Operational requirements

- `SESSION_SECRET` 与 `PASSWORD_PEPPER` 至少 32 字符，必须分别生成并存入 Azure Key Vault。
- Preview 与 Production 使用不同数据库、密钥、Cookie 范围和托管身份。
- 生产数据库使用私网、TLS 和最小权限账户；定期验证恢复演练。
- 目前不实现 MFA。架构保留后续增加验证因子与 Session assurance level 的空间。

安全问题请通过私密渠道报告，不要在公开 Issue 中提交凭据或可利用细节。
