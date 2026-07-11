# Architecture

## Layers

1. `app/`: 页面与 HTTP Route Handlers。请求只解析/验证输入，不承载业务授权。
2. `lib/`: 领域类型、统一授权、认证服务、文章工作流、密码/Session/CSRF 和内容清理。
3. `db/`: PostgreSQL Schema、延迟连接与 Repository 实现。
4. `scripts/`: 迁移和无固定凭据的幂等种子入口。

`AuthService`、`PostService` 和 `CommunityService` 依赖 `Repository` 接口，因此测试可使用内存实现，Azure 迁移不会改变领域规则。

## Request flow

`Route Handler → Zod validation → Session authentication → CSRF verification for mutations → domain policy → repository transaction → audit event → safe response`

客户端隐藏按钮只是体验优化；服务端始终重新验证账户状态、角色、发布策略、资源作者与文章状态。

## Authentication

应用使用不透明 Session Token。数据库只保存带服务器密钥的 Token 哈希。登录成功创建新 Session 并撤销请求携带的旧 Session，避免固定攻击。账户禁用、管理员重置或密码修改会撤销该用户全部 Session。管理员重置后，`mustChangePassword` 会阻止除修改密码、查看 Session 和登出之外的受保护功能。

注册只接受一次性、不可预测的邀请码。邀请不绑定邮箱；数据库只保存 Token 哈希，Owner/Admin 通过群聊或私聊手动发送一次性链接。

## Publishing workflow

`publishingPolicy` 存在 User 上，而不是由 Role 推导。`DIRECT_PUBLISH` 判断同时要求文章作者等于当前用户；审核判断要求 Editor+ 且审核人不是文章作者。

## Portability

Sites 的 `.openai/hosting.json` 只保存预览项目 ID，不保存数据库或对象存储绑定。正式运行依赖标准 PostgreSQL URL、HTTP Cookie 和环境变量。`PostgresSearchProvider` 使用 `websearch_to_tsquery` 与 GIN 索引；`LocalStorageProvider` 是当前本地/测试适配器，可替换为 Azure Blob 而不改变媒体授权和文件验证。当前和近期版本不包含邮件或通知提供方。
