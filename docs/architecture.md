# 架构说明

## 技术栈

- 工具链：mise + Bun 1.4.0，使用 `bun.lock`、Bun runtime、HTML bundler/HMR、test runner、内建 `.env` 加载、S3、密码哈希、WebSocket Pub/Sub 与 cron；类型检查使用 TypeScript 7 原生 `tsc --noEmit`。
- Web：React 19、TanStack Query 和产品专用 CSS；没有无效路由层或通用 UI 组件包。
- API：Hono on Bun，`hc<AppType>` 端到端推导 Hono RPC 类型，`@hono/zod-validator` + Zod 4 校验边界输入。
- 身份：Better Auth username + session + organization；角色为 `admin`、`teacher`、`student`，密码由 `Bun.password` 的 Argon2id 实现哈希与验证。
- 数据：PostgreSQL 18、`pg` 连接池、Kysely 查询与 Migrator；运行时不依赖 MySQL。

## 请求与租户边界

Hono 中间件从 Better Auth session 取得当前用户，再从 organization member 关系确定组织和角色。业务查询必须同时带 `organizationId`；文件下载、完成和删除也以组织过滤，不能依赖客户端提交的租户 ID。权限在服务端检查，前端隐藏操作只用于体验，不构成授权。

模块由组织授权和角色目录共同过滤。管理员可管理账号和模块；教师可出题、发布、阅卷和发布公告；学生只能查看/作答与查看自己的成绩。三种角色均可在自己的组织中管理自己创建的文件。

## 文件存储

`ObjectStorage` 只暴露 `createUploadUrl`、`createDownloadUrl`、`stat` 和 `delete`，当前适配器使用 Bun 原生 `S3Client`。对象桶保持私有：

1. API 创建 `pending` 文件记录并签发短期 PUT URL。
2. 浏览器直接上传对象正文，应用服务不转发大文件。
3. 浏览器调用 complete，服务端以内部 S3 endpoint `stat` 对象，核对大小和 Content-Type；不一致时标记 `rejected`，一致时记录规范化 ETag/checksum 并标记 `ready`。
4. 下载时仅为本组织的 `ready` 文件签发短期 GET URL。
5. 删除先软删除为 `deleted` 并发 outbox 事件，日常 cron/手工 job 再删除对象。超过 24 小时未完成的 `pending` 对象会清理并标记 `rejected`。

对象键固定为 `tenants/{tenantId}/{yyyy}/{mm}/{fileId}/{safeName}`，因此不同租户和记录不会共享前缀或覆盖。当前文件功能不做图像变换；以后新增缩略图时优先评估 Bun 原生 `Image`，不提前引入图像库。

## 实时一致性

所有实时事件遵循严格的 Zod discriminated union，公共字段为 `v`、`sequence`、`id`、`organizationId`、`actorId`、`type`、`occurredAt`、`data`。

业务写入和 outbox 插入在同一个 Kysely transaction 中提交。提交后 PostgreSQL `NOTIFY` 只发送 event ID 作为唤醒信号；每个实例从 outbox 领取未发布行并通过 Bun `server.publish` 广播。WebSocket 主题完全由服务端根据 session 订阅：基础主题为 tenant/account；exam/submission 主题只有在服务端验证资源属于当前组织后才可加入。客户端不能指定任意频道。

浏览器以 event ID 去重，以 sequence 保存游标并让 TanStack Query 精确失效。断线重连前调用 catch-up API 拉取游标之后的事件，因此 WebSocket 只负责低延迟，数据库 outbox 才是可靠事实源。双实例测试证明在无 Redis 条件下，写入实例经 PostgreSQL 唤醒另一实例并到达其 WebSocket 客户端。

## 运维边界

- 应用进程内 `Bun.cron("@daily")` 适合当前单任务清理；多副本会重复扫描，但删除操作和状态更新保持幂等。任务量扩大后应迁移到带租约的独立 worker。
- 本地 `bun run --hot` 同时提供 API、HTML bundler 和 HMR；生产构建由 `Bun.build` 生成 `dist`。
- 生产容器启动时自动迁移；大版本或破坏性 schema 变更仍需遵循 expand/migrate/contract 并在发布窗口单独执行。
- Better Auth secret、数据库口令、S3 凭据必须由部署平台注入，不能沿用示例值。
