# EduDesk

EduDesk 是一个面向学校的多租户 Web 桌面。当前技术栈以 Bun 为唯一 JavaScript 工具链：React 19 前端由 Bun HTML bundler 构建并热更新，Hono 提供类型安全 RPC，Better Auth 管理账号、会话与组织角色，Kysely 访问 PostgreSQL；私有文件直传 S3 兼容对象存储，实时事件通过事务 outbox、PostgreSQL `LISTEN/NOTIFY` 和 Bun 原生 WebSocket Pub/Sub 分发。

## 环境要求

- [mise](https://mise.jdx.dev/)
- Docker / Docker Compose

Bun 固定为 `1.4.0`。`mise.lock` 同时锁定 macOS ARM64 与 Linux x64，不再使用 `.bun-version` 或其他包管理器。

## 本地启动

```bash
mise install --locked bun@1.4.0
mise run install
cp .env.example .env
docker compose up -d --wait postgres minio
docker compose up --no-deps minio-init
mise exec -- bun run db:migrate
mise exec -- bun run db:seed
mise run dev
```

打开 <http://127.0.0.1:3000>。演示账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin123` |
| 教师 | `teacher` | `teacher123` |
| 学生 | `student` | `student123` |

这些账号只用于本地演示，不应部署到生产环境。

## 常用命令

```bash
mise run check                    # 类型、Biome、Bun 测试与生产构建
mise exec -- bun run test:e2e     # Playwright 业务验收
mise exec -- bun run test:double-instance
mise exec -- bun run db:rollback
mise exec -- bun run storage:cleanup
```

`bun run test` 执行 Bun 单元/API 测试；浏览器业务流程由 Playwright 覆盖。首次运行浏览器测试前执行 `mise exec -- bunx playwright install chromium`。

## 生产容器

```bash
docker compose --profile production up -d --build --wait
curl --fail http://127.0.0.1:3000/api/health
```

镜像固定基于 `oven/bun:1.4.0`，启动时先执行 Kysely migration。部署前必须替换 Compose 中的演示密钥和口令，并将 `S3_PUBLIC_ENDPOINT` 设置为浏览器可访问的 HTTPS 地址。

架构与一致性边界见 [docs/architecture.md](docs/architecture.md)。项目尚未发布，数据库变更允许直接回滚或重建，不提供旧 MySQL 数据导入与兼容层。
