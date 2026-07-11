# Database

## PostgreSQL model

核心表：`users`、`invitations`、`sessions`、`login_attempts`、`posts`、`categories`、`tags`、`post_tags`、`comments`、`bookmarks`、`post_likes`、`media_assets`、`audit_logs`。

User 包含唯一 `handle`、`role`、`publishing_policy`、`status`、`password_hash`、`must_change_password` 与 `deleted_at`。兼容旧数据的 `email` 为 nullable，不参与登录、验证或密码找回。Invitation 只保存 Token 哈希、角色、发布策略、创建人、备注和一次性使用状态。Post 包含完整审核时间线、`review_reason`、可见性、软删除字段和用于自动保存冲突控制的 `revision`。

## Constraints and deletion

- Handle、slug、Session/邀请 Token 哈希和存储键具有唯一约束。兼容字段 email 允许为空。
- 业务主体默认软删除。用户和作者外键使用 `restrict`；删除关联关系或 Session 时才使用 `cascade`；审核人使用 `set null`。
- 列表、审核队列、作者工作台、Session 和审计保留任务均有组合索引。

## Migrations

迁移位于 `drizzle/`，由 Drizzle Kit 从 `db/schema.ts` 生成。部署时先运行 `npm run db:migrate`，成功后再切换应用版本。禁止在生产启动过程中自动生成迁移。

`0002_phase3_community_media.sql` 新增可选 GitHub/个人网站字段、评论父级外键，以及文章、成员、分类和标签的 PostgreSQL GIN 搜索索引。`post_likes` 与 `bookmarks` 的复合主键保证幂等。

## Seed and test data

`npm run db:seed` 可重复执行，只在 Owner 不存在时创建，并同步默认分类。Owner 初始化需要 `SEED_OWNER_HANDLE`、`SEED_OWNER_DISPLAY_NAME` 和运行环境提供的 `SEED_OWNER_PASSWORD`，不会覆盖现有 Owner 密码。测试使用隔离的 `MemoryRepository` 数据工厂，不包含真实密码或个人数据。

## Backup and retention

Azure 上启用 PostgreSQL 自动备份与时间点恢复。重要审计日志至少保留 180 天；清理任务仅删除超过保留期且已完成归档的审计数据。
