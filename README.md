# Shadow Sky Blog

群聊成员共同维护的现代技术社区 Blog。用于分享技术文章、学习记录、项目成果和群内知识资料。ChatGPT Sites 仅用于开发预览；生产目标是 Microsoft Azure。

## Phase 3 功能

- 纯邀请码注册；用户名 handle + 密码登录；安全 Session、登出、修改密码、账户禁用与资料维护。
- 不使用邮箱验证、邮件通知或自动找回密码。忘记密码由 Owner/Admin 人工重置，用户随后必须修改临时密码。
- Owner、Admin、Editor、Author、Contributor、Member、Visitor 权限模型。
- 每用户独立 `publishingPolicy`：`REVIEW_REQUIRED` 或 `DIRECT_PUBLISH`，不与角色硬编码。
- 文章草稿、Markdown 安全渲染、乐观并发 revision、提交审核、批准、退回、重新提交、直接发布、隐藏、软删除和恢复。
- `PUBLIC`、`MEMBERS_ONLY`、`PRIVATE` 服务端可见性控制。
- 用户、发布策略、审核与安全事件审计；重要日志最低保留 180 天。
- 创作中心、编辑器、审核、用户管理、邀请、审计、登录与错误状态界面。
- 嵌套评论、作者修改与软删除、Admin/Owner 管理、服务端 XSS 清理和频率限制。
- 幂等点赞与收藏、“我的收藏”可见性复核、PostgreSQL 全文搜索与 `SearchProvider`。
- PNG/JPEG/WebP/GIF 真实 MIME 校验、本地 `StorageProvider` 与 Azure Blob 适配边界。
- 媒体记录持久化 `purpose`、所有者及用户/文章绑定；读取继承头像公开状态或文章可见性，受保护媒体禁止共享缓存。
- 不暴露邮箱和权限策略的成员公开主页、公开文章数与获赞数。

搜索支持 `q`、页码、受限 `pageSize`、分类、标签、作者和时间范围。可见性在 PostgreSQL 中先于分页执行，并按 `publishedAt + id` 稳定排序。

邮件、邮箱验证、通知中心、实时聊天、私信、WebSocket、MFA 不在 Phase 3 范围；Azure 基础设施自动化和正式切流属于 Phase 4。

## 技术栈

React 19、Next.js 风格 App Router、TypeScript、Vinext、PostgreSQL、Drizzle ORM、`postgres` 驱动、Zod、`@noble/hashes` Argon2id、Marked 与 sanitize-html。

## 本地运行

1. 使用 Node.js 22.13+ 和 PostgreSQL。
2. 复制 `.env.example` 为 `.env.local`，填入本地值。不要提交该文件。
3. `npm ci`
4. `npm run db:migrate`
5. 设置一次性的 `SEED_OWNER_*` 环境变量后运行 `npm run db:seed`。
6. `npm run dev`

## 环境变量

关键变量包括 `DATABASE_URL`、`SESSION_SECRET`、`PASSWORD_PEPPER`、`APP_URL`、`DATABASE_POOL_SIZE` 和 `AUDIT_RETENTION_DAYS`。Owner 初始化只使用 `SEED_OWNER_HANDLE`、`SEED_OWNER_DISPLAY_NAME` 和 `SEED_OWNER_PASSWORD`；源码和迁移中不包含固定密码。

Owner 密码只能通过服务器维护命令 `npm run owner:reset-password` 重置，并从运行环境读取 `OWNER_RESET_PASSWORD`。

## 数据库

- 生成迁移：`npm run db:generate`
- 执行迁移：`npm run db:migrate`
- 幂等初始化：`npm run db:seed`

详见 `DATABASE.md`。

## 测试与质量检查

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm test`
- `npm run build`
- 构建后 `npm run test:render`

## 角色与 publishingPolicy

角色决定可执行的业务能力。Member 只读和评论；Contributor/Author 可创作；Editor 可审核他人文章；Admin 只能管理 Member、Contributor、Author、Editor；Owner 可额外创建和管理 Admin 及站点设置。

Owner 只能由服务器 seed 创建，不能通过邀请或用户管理 API 创建、分配或降级。Owner 也不能通过普通用户 API 修改或禁用自己；Owner 密码继续仅允许服务器维护命令重置。

`DIRECT_PUBLISH` 只允许用户发布自己的文章，不授予审核或管理他人文章的权限。只有 Owner/Admin 能修改发布策略，且修改必须写审计日志。

## 审核流程

- `REVIEW_REQUIRED`：草稿 → `PENDING_REVIEW` → Editor/Admin/Owner（非作者本人）批准为 `PUBLISHED`，或退回为 `REJECTED`。
- `DIRECT_PUBLISH`：用户可把自己的草稿直接转为 `PUBLISHED`。
- 被退回文章可修改后再次提交。已发布文章使用 revision 控制并保留明确更新时间；完整修订历史可在后续阶段加入。

## Azure 规划

目标组合为 Azure Container Apps、Azure Database for PostgreSQL Flexible Server、Azure Blob Storage、Azure Key Vault 与托管身份。所有平台差异均通过配置或适配器隔离。详见 `DEPLOYMENT_AZURE.md`。
