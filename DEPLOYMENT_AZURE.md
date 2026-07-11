# Azure deployment plan

## Target services

- Azure Container Apps：运行无状态 Web 容器并接入自定义域名。
- Azure Database for PostgreSQL Flexible Server：托管 PostgreSQL，使用私网或 Private Endpoint。
- Azure Blob Storage：Phase 3 图片与头像；应用通过托管身份访问。
- Azure Key Vault：`DATABASE_URL`、`SESSION_SECRET`、`PASSWORD_PEPPER` 等密钥。
- Azure Container Registry：保存构建镜像；Container Apps 通过托管身份拉取。

## Environments

- Test: `preview.shadowskypan.asia`
- Production: `blog.shadowskypan.asia`

两个环境必须拥有独立数据库、Blob 容器、Key Vault 密钥、Container App 与部署身份。

## Release sequence

1. CI 执行 lint、typecheck、单元/集成测试和 production build。
2. 构建不可变 OCI 镜像并推送 ACR。
3. 在迁移任务中执行 `npm run db:migrate`；失败时停止发布。
4. 创建新的 Container Apps revision，注入 Key Vault 引用的环境变量。
5. 对 `/api/health`、登录和公开文章读取执行 smoke test。
6. 渐进切流；异常时把流量切回旧 revision。数据库变更需保持向后兼容。

## Networking and secrets

PostgreSQL 放入专用子网或 Private Endpoint，通过 Private DNS 解析；不向互联网开放 5432。Container App 启用托管身份，用 Azure RBAC 读取 Key Vault 与 Blob，避免长期存储密钥。

本文件提供 Phase 2 迁移边界；Bicep/Terraform、Dockerfile、ACR 流程、域名证书和最终切流脚本在 Phase 4 完成。

Official references: Microsoft Learn — Azure Container Apps managed identities, Key Vault secret references, and PostgreSQL private networking.
