# Changelog

## Unreleased — Phase 3 preparation

### Changed

- 邀请改为不绑定邮箱的一次性邀请码/链接，支持备注、过期和作废。
- 登录改为只接受唯一用户名 handle；兼容字段 email 改为 nullable 且不参与认证。
- 新增 `mustChangePassword`、Owner/Admin 人工重置普通用户密码、旧 Session 撤销和强制改密。
- Owner seed 不再需要邮箱；新增服务器维护密码重置命令。
- 明确移除邮件通知、邮箱验证、邮件找回密码和 Phase 3 通知中心范围。

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
