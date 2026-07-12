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

Sites 的边缘运行时通过 `@neondatabase/serverless` 与 `drizzle-orm/neon-serverless` 建立 WebSocket PostgreSQL 连接。每个 API 请求只创建一个数据库上下文，Repository、认证、文章、社区、搜索和媒体服务共享该上下文；统一请求包装器在成功、异常和提前返回时都通过 `finally` 关闭连接。模块全局不保存 Pool 或 Client，连接不会跨请求复用。文章写入、标签、媒体绑定和审计共用交互式事务，邀请接受与点赞计数原有事务保持不变。

媒体访问由 `MediaService` 统一裁决。上传记录保存用途、所有者和可空的用户/文章绑定；头像只有在绑定到 ACTIVE 用户当前公开资料时可公开读取，文章媒体调用同一 `canReadPost` 策略。事务内只更新文章、绑定、软删除、清理状态和审计；提交成功后才删除物理对象。失败的物理删除保持 `PENDING` 且记录固定错误代码，可由 `media:prune` 幂等重试。Sites 在持久对象存储接入前通过 `MEDIA_UPLOAD_ENABLED=false` 关闭上传。

`SearchProvider` 的契约要求提供操作者上下文与所有过滤/分页参数。PostgreSQL 实现先构造角色、作者、状态和可见性条件，再执行稳定排序、`LIMIT/OFFSET` 与总数统计；领域层额外执行失败关闭校验，而不是分页后过滤。
