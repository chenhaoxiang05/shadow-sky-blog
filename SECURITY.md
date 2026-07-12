# Security

## Implemented in Phase 2

- Argon2id 密码哈希：随机 16-byte salt、服务器端 pepper、版本化参数；密码长度 12–256。
- 不透明 256-bit Session Token；数据库只保存 SHA-256 keyed hash；HttpOnly、Secure、SameSite=Lax。
- 登录成功轮换 Session；密码修改或账户禁用立即撤销全部 Session。
- 邀请 Token 和临时密码均使用安全随机数；数据库只保存哈希，明文只在创建响应中显示一次。
- Owner/Admin 重置普通用户密码后撤销全部 Session，并强制下一次登录修改密码；Admin 不能重置 Owner。
- 双提交 CSRF Token、严格同源校验和 SameSite=Strict CSRF Cookie。
- 登录失败按账户标识 + 隐私化 IP 哈希限流，返回通用错误。
- 所有角色、publishingPolicy、authorId、reviewedBy 和状态转换均由服务端决定。
- Web API 永远不能创建或分配 Owner。Owner 可管理除自己和其他 Owner 外的账户并分配到 Admin；Admin 只能管理和分配 Member、Contributor、Author、Editor。
- 邀请、用户更新、邀请作废和密码重置共用目标角色授权规则；越权尝试记录为 `SECURITY_AUTHORIZATION_DENIED`，客户端只收到通用 403。
- Markdown 经过 allowlist 清理；外链添加 `noopener noreferrer nofollow`，图片仅允许 HTTPS。
- 评论移除全部 HTML 标签、继承文章可见性并按用户执行一分钟窗口限流。
- 图片仅接受通过文件签名识别的 PNG/JPEG/WebP/GIF，拒绝 SVG、HTML、脚本和可执行内容；随机存储键、大小限制、路径约束及 `nosniff` 防止覆盖与类型混淆。
- 未绑定媒体仅所有者和 Admin/Owner 可读。公开头像必须绑定 ACTIVE 用户当前头像；封面/正文媒体继承 `canReadPost`。受保护媒体使用 `private, no-store`，只有明确公开资源才使用短期可重新验证的 public 缓存。
- 内部媒体 URL 在设置头像、封面或正文时验证存在性、删除状态、所有权、用途和现有绑定。替换会软删除旧记录并清理存储文件；仍被引用的媒体不能直接删除。
- 搜索、收藏列表、评论、点赞和收藏写入都会重新执行文章可见性规则。
- 搜索可见性在 PostgreSQL `LIMIT/OFFSET` 和总数统计之前执行，防止无权限结果挤占页面或通过计数泄露。
- 用户、文章、评论软删除；关键安全和业务操作写审计日志。
- 响应不返回密码哈希、Session Token、数据库地址或堆栈。

## Known dependency advisory

当前依赖审计仍包含 Vinext/Cloudflare/Vite/Next.js/Drizzle 工具链告警。未使用 `--force` 或破坏性版本替换；升级必须在兼容性分支重新运行全部质量门槛。

## Operational requirements

- `SESSION_SECRET` 与 `PASSWORD_PEPPER` 至少 32 字符，必须分别生成并存入 Azure Key Vault。
- Preview 与 Production 使用不同数据库、密钥、Cookie 范围和托管身份。
- 生产数据库使用私网、TLS 和最小权限账户；定期验证恢复演练。
- 目前不实现 MFA。架构保留后续增加验证因子与 Session assurance level 的空间。
- 不使用邮箱验证码、邮件找回密码、SMTP、邮件队列或通知中心。密码恢复由管理员人工处理；Owner 使用服务器维护命令。

安全问题请通过私密渠道报告，不要在公开 Issue 中提交凭据或可利用细节。
# 数据库连接安全

Sites 请求使用请求级 Neon WebSocket 连接，不在模块全局复用 Pool。所有请求路径通过统一清理逻辑关闭连接，数据库配置错误和连接失败只返回稳定错误代码；连接字符串、数据库主机、用户名和驱动原始错误不会写入 HTTP 响应或应用错误日志。

HTTP 响应先完成安全映射，再尝试关闭数据库上下文；关闭失败只记录 `DATABASE_CONTEXT_CLOSE_FAILED`，不会覆盖成功响应或既有错误响应。媒体清理失败只记录固定清理代码，不记录存储键、路径、连接信息或存储凭据。
