# 容器启动与隔离验收

普通使用在项目根目录执行 `docker compose up --build`，打开 http://localhost:3000。没有宿主机 Node／Java／Maven 或手动建表、额外图片下载步骤。非敏感配置在 .env.example，可按需复制为 .env；不复制也使用同样的本地演示默认值。

MySQL 数据使用 mysql-data，上传和任务结果使用 asset-data；模板、种子和示例图片随 Java JAR 交付。Java 与前端运行镜像均使用非 root 用户，只有前端端口映射到宿主机。生产三服务不绑定源码目录，检查容器才只读挂载脚本／示例。

MySQL 执行 SELECT 1 健康后 Java 启动；Java 完成初始化及 ApplicationReadyEvent 中的任务恢复后，Spring Boot 才进入 ACCEPTING_TRAFFIC。health 同时检查该状态和数据库；Next.js 等 Java 健康后启动，浏览器通过同源 /api 转发。启动中或停止接流返回 SERVICE_NOT_READY，数据库故障返回 DATABASE_UNAVAILABLE，不返回连接地址或凭据。

## 构建与配置

```sh
docker compose config --quiet
docker compose build
docker compose up -d --wait
docker compose ps
docker compose logs backend
docker compose down
```

down 保留卷；重建前记录提交并备份重要数据库及文件。不为升级删除卷，已有数据库不会因修改 .env 初始密码自动改账户，也不会仅因修改 schema.sql 就迁移表。

正常构建可复用下载及层缓存。需验证不依赖层缓存时，使用 `docker compose build --no-cache`；backend Dockerfile 的 MAVEN_CACHE_ID 构建参数还允许指定全新下载缓存命名空间，例如 `docker compose build --no-cache --build-arg MAVEN_CACHE_ID=assets-empty-audit backend`。选用未使用过的名字，不对其他项目执行全局 prune。本阶段结果见 [P8 验证记录](p8-verification.md)。

## 独立生产链路验收

以下在 PowerShell 中运行；项目名与默认开发环境隔离，固定读公开示例配置，避免复用开发用户数据。所有检查脚本均在 Node 容器内执行。实际结果见 [P8 验证记录](p8-verification.md)。

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
$env:FRONTEND_PORT = '3001'
docker compose --env-file .env.example -p assets-creation-p8 up --build -d --wait

# Java 模板、真实图片、5 MiB／超限、Cookie／CSRF、文件及归属。
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.p3.yaml run --rm -e P3_EVIDENCE_FILE=/evidence/p8-assets.json p3-http-checks

# 实际异步阶段、快速受理、排队、幂等、结果和关闭查询后继续。
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.p4.yaml run --rm -e P4_EVIDENCE_FILE=/evidence/p8-tasks.json p4-http-checks

# 新注册账户、素材、任务／步骤、结果及模板的持久化快照。
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.p8.yaml run --rm p8-checks

# 保留两个卷，停止三服务，再创建全新容器。
docker compose --env-file .env.example -p assets-creation-p8 down
docker compose --env-file .env.example -p assets-creation-p8 up --build -d --wait
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.p8.yaml run --rm -e P8_MODE=verify p8-checks
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.p3.yaml run --rm -e P3_EVIDENCE_FILE=/evidence/p8-assets.json -e P3_CHECK_MODE=verify-restart p3-http-checks
```

prepare 模式会新增专用随机账户、一个素材及两个任务，等待实际成功再保存快照；verify 先确认旧会话失效，再重新登录，核对用户、素材字节、完整 TaskDto／步骤、结果哈希、历史及初始化幂等。Cookie 仅写入 .local，不打印或提交 Git。P3／P4 的 P8 快照使用独立文件名，避免覆盖旧阶段的本地证据。

## 生产代理超时与多 Cookie 探针

保持 Next.js 生产镜像，仅为专用验证后端开启 smoke profile；运行 P0 的 10 项转发检查，包括多 Set-Cookie、JSON／multipart、超限、错误语义及 10 秒代理超时的 504。探针默认关闭，不用于实际制作。

```powershell
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.smoke.yaml up -d --force-recreate --no-deps --wait backend
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.smoke.yaml run --rm checks

# 恢复默认 profile，复核数据后停止专用组，保留验证卷。
docker compose --env-file .env.example -p assets-creation-p8 up -d --force-recreate --no-deps --wait backend
docker compose --env-file .env.example -p assets-creation-p8 -f compose.yaml -f compose.p8.yaml run --rm -e P8_MODE=verify p8-checks
docker compose --env-file .env.example -p assets-creation-p8 down
Remove-Item Env:FRONTEND_PORT
```

这些命令只重建指定专用项目，不停止默认 3000 开发组。两种 profile 切换都会使 Java 会话失效；不要把重建引起的中断与模拟阶段失败混淆，重建前先等任务结束。CI 的独立 MySQL 和缓存说明见 [ci.md](ci.md)。
