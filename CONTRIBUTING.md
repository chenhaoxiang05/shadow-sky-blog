# Contributing

1. 从 `main` 创建短生命周期分支。
2. 不提交 `.env*`、Token、密码、用户数据、上传文件或生产日志。
3. 领域权限必须在服务端策略中实现，并为允许和拒绝路径补测试。
4. Schema 变更需生成并检查 Drizzle migration；禁止手工修改已发布迁移。
5. 提交前运行 `npm run lint && npm run typecheck && npm test && npm run build && npm run test:render`。
6. PR 描述应说明数据迁移、安全影响、回滚方式与 UI 变化。

Commit 建议使用 Conventional Commits，例如 `feat: add invitation revocation`。
