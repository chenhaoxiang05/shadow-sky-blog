# Changelog

## Unreleased — Phase 3 preparation

### Changed

- 邀请改为不绑定邮箱的一次性邀请码/链接，支持备注、过期和作废。
- 登录改为只接受唯一用户名 handle；兼容字段 email 改为 nullable 且不参与认证。
- 新增 `mustChangePassword`、Owner/Admin 人工重置普通用户密码、旧 Session 撤销和强制改密。
- Owner seed 不再需要邮箱；新增服务器维护密码重置命令。
- 明确移除邮件通知、邮箱验证、邮件找回密码和 Phase 3 通知中心范围。
- 修复角色层级授权：任何 Web API 均不能创建或分配 Owner，Admin 只能管理 Editor 及以下角色，Owner 不能管理自己或其他 Owner。
- 越权邀请、角色变更、状态变更、邀请作废和密码重置会写入失败安全审计。

### Added — Phase 3

- 嵌套评论、作者编辑/软删除、管理员隐藏、XSS 清理和评论限流。
- 幂等文章点赞、收藏与“我的收藏”，所有入口重新执行可见性检查。
- PostgreSQL 全文搜索、GIN 索引与可替换 `SearchProvider`。
- 真实 MIME 图片校验、本地 `StorageProvider`、媒体元数据和 Azure Blob 适配边界。
- 公开成员主页、GitHub/个人网站、公开文章与获赞统计。

### Security fixes — Phase 3 PR review

- 为媒体新增用途与用户/文章绑定，所有读取继承公开头像或文章可见性；受保护响应改为 `private, no-store`。
- 头像、封面与正文内部媒体引用验证所有权、用途和绑定；替换/删除执行软删除、存储清理和审计。
- 评论限制为两级，深层回复规范化到顶级评论；隐藏评论支持 Admin/Owner 恢复，删除父评论保留占位结构。
- 搜索将角色可见性、过滤、总数和稳定分页全部前置到 PostgreSQL 查询，避免分页后过滤泄露或结果缺失。

## 0.2.0-phase2 — 2026-07-12

### Added

- 邀请注册、登录/登出、密码修改、安全 Session、账户禁用、资料管理。
- 每用户 `publishingPolicy` 与 Owner/Admin 管理审计。
- PostgreSQL 迁移、幂等种子与 Repository 架构。
- 文章草稿、审核、退回、直接发布、隐藏、软删除/恢复和可见性策略。
- 创作、编辑、审核、用户、邀请、审计与权限错误界面。
- GitHub Actions 质量门槛与 Azure 迁移文档。

### Security

- Argon2id、Token 哈希、Session 轮换、CSRF、登录限流、Markdown 清理和结构化审计。

## 0.1.0-phase1 — 2026-07-11

- 产品架构、视觉系统、页面原型、初始数据模型与权限设计。
