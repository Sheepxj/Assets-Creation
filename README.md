# 素材制作系统

Next.js + Java + MySQL 的异步素材制作项目。需求见[题目说明](题目说明.md)，架构见[设计文档](docs/superpowers/specs/2026-10-28-assets-creation-design.md)，实施范围见[开发计划](docs/superpowers/plans/2026-10-28-assets-creation-implementation-plan.md)。

## 当前进度

P0～P3 已完成：基础工程、接口契约、同源转发、容器入口、数据素材、MyBatis、注册登录、模板接口、真实图片上传与本人预览。任务执行和正式前端页面按后续阶段实施。

逐项结果见 [P0](docs/p0-verification.md)、[P1](docs/p1-verification.md)、[P2](docs/p2-verification.md)、[P3 验证记录](docs/p3-verification.md)。后续功能说明和接口是开发约定，不冒充已交付功能。

## 技术版本

| 项目 | 固定版本 |
| --- | --- |
| Node.js / npm | 22.23.4 / 10.9.9，node:22.23.4-bookworm-slim |
| Next.js / React | 16.4.3 / 19.3.1 |
| TypeScript / ESLint | 5.9.3 / 9.39.4 |
| Tailwind CSS / TanStack Query | 4.3.3 / 5.105.0 |
| 前端测试工具 | Vitest 5.0.5、Testing Library 16.3.3、jest-dom 7.0.1、jsdom 30.1.3 |
| Java / Maven | Java 21 / Maven 3.9.16；运行镜像 Temurin 21.0.12_8 |
| Spring Boot / MyBatis Starter | 3.5.16 / 3.0.5 |
| MySQL | 8.4.13 |

前端直接依赖精确固定，完整依赖见 `frontend/package-lock.json`。Java 传递依赖由 Spring Boot 3.5.16 BOM 管理，MyBatis Starter 单独固定；Maven Wrapper 固定分发版本。

兼容依据：[Next.js 安装要求](https://nextjs.org/docs/app/getting-started/installation)、[Spring Boot 3.5 系统要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)、[MyBatis 兼容表](https://mybatis.org/spring-boot-starter/mybatis-spring-boot-autoconfigure/)。TypeScript 选用 5.9 系列，容器 Node 22 满足 Next.js 和测试工具要求。

## 项目结构

```text
frontend/           App Router、Java 同源转发、TypeScript DTO、样式及测试配置
backend/            认证、模板／素材 API、存储／归属、DTO、MyBatis 和测试
database/           六表结构、幂等种子、只读检查和专用重建验证 SQL
demo-assets/        6 张封面、6 张模拟结果、3 张上传示例及来源／哈希清单
scripts/            容器内 P0／P2／P3 HTTP 集成检查
docs/               API、参考图、阶段验证、设计和开发计划
compose.yaml        正常运行的 Next.js、Java、MySQL 三服务
compose.smoke.yaml  P0 smoke profile 与检查容器
compose.p1.yaml     真实 MySQL 的 P1 集成测试容器
compose.p2.yaml     P2 实际 HTTP 与会话重启检查
compose.p3.yaml     P3 实际上传与保留卷重建检查
.env.example        无真实凭据的开发演示配置
```

业务执行和持久化在 Java。Java 启动时执行数据库初始化并验证示例图片；数据库和素材说明见 [database/README.md](database/README.md)。后端 Docker 构建上下文为仓库根目录，以同时打包 database 和 demo-assets；请使用 Compose 或 `docker build -f backend/Dockerfile .`。

## 构建与启动

需要 Docker 引擎和 Compose，不需要宿主机 Node.js、Java 或 Maven。首次运行需要访问 Docker Hub、npm 和 Maven Central。在仓库根目录执行：

```sh
docker compose up --build
```

打开 [http://localhost:3000](http://localhost:3000)，当前首页提供连接检查入口。也可访问 [Java／MySQL 健康接口](http://localhost:3000/api/health)及[模板 API](http://localhost:3000/api/templates)。P5 完成后可通过正式页面浏览模板、注册登录、上传与提交；P6 完成后可查看多任务进度、个人历史及刷新恢复。当前尚没有这些业务页面。

可选复制 `.env.example` 为 `.env` 修改配置；不复制也可用本地演示默认值。示例口令仅供本地运行，外部部署前替换。

```sh
docker compose config
docker compose ps
docker compose logs backend
docker compose down
```

`down` 保留数据卷；需要保留数据时不要使用 `--volumes`。只有前端端口向宿主机公开，Java 和 MySQL 使用容器网络。

## 配置

| 配置 | 默认值／位置 | 用途 |
| --- | --- | --- |
| FRONTEND_PORT | 3000 | 宿主机前端端口 |
| JAVA_API_URL | http://backend:8080 | Next.js 服务端 Java 地址，不用 NEXT_PUBLIC 前缀 |
| MYSQL_DATABASE | assets_creation | 空卷首次创建的库 |
| MYSQL_USER / MYSQL_PASSWORD | assets_app / 本地演示口令 | Java 数据库账户 |
| MYSQL_ROOT_PASSWORD | 本地演示口令 | 初始化管理口令，Java 不使用 root |
| DATABASE_URL / DATABASE_USERNAME / DATABASE_PASSWORD | Compose 从 MYSQL_* 组装 | Java JDBC；本地启动也可直接设置 |
| STORAGE_ROOT | Compose 为 /app/data | 已用于上传；asset-data 卷保留文件 |
| SESSION_TIMEOUT | 30m | 会话空闲超时 |
| SESSION_COOKIE_SECURE | false | 本地 HTTP；HTTPS 设为 true |
| PROXY_TIMEOUT_MS | 10000 | 单个 Java 请求超时，不是制作耗时 |
| SIM_CHECK_DELAY_MS | 2000 | 素材检查耗时，P4 启用并校验 |
| SIM_GENERATE_DELAY_MS | 8000 | 模拟生成耗时，P4 启用并校验 |
| SIM_FINALIZE_DELAY_MS | 2000 | 结果整理耗时，P4 启用并校验 |
| SIM_FAIL_STAGE | NONE | NONE／MATERIAL_CHECK／GENERATE／FINALIZE，P4 启用 |
| SPRING_PROFILES_ACTIVE | 空 | 默认无 smoke 探针，转发验证时使用 smoke |

数据库使用 utf8mb4 和 UTC。演示内网 JDBC 不使用 TLS，真实远程数据库应另行配置。已有卷不会因修改初始化环境密码自动修改账户。Java 使用 `CREATE TABLE IF NOT EXISTS` 和不覆盖已有行的种子写入；修改 schema.sql 不会自动迁移已有表，不需要也不应为升级删除用户数据卷。

## P0 检查

### 完整转发验证

```sh
docker compose -p assets-creation-p0 -f compose.yaml -f compose.smoke.yaml up --build --abort-on-container-exit --exit-code-from checks
```

该命令构建应用并启用专用 smoke profile，在三服务健康后运行 Node 检查容器，执行 10 项检查：健康、多个 Set-Cookie、会话／CSRF／JSON、multipart 字节、5 MiB 边界、超限 413、图片、上游错误、401／403 区别及 504 超时。检查结束后停止本组服务，保留专用卷。若普通应用已占用 3000，先停止它或修改验收组 FRONTEND_PORT；本命令不会删除默认项目的卷。

### 构建和 Java 测试

```sh
docker compose build
```

前端构建依次执行 `npm ci`、`npm run lint`、`npm run typecheck`、`npm run build`。Java 通过 `./mvnw -B verify` 执行测试和打包。P0 的 6 项 Java 测试及上述 10 项跨容器 HTTP 检查均已通过；Java 测试验证健康失败语义、JSON 401、CSRF 和默认关闭探针，真实数据库连接由跨容器检查验证。

有本地工具的开发者也可在相应目录运行以下命令，评估者不必在宿主机执行：

```text
frontend/:
  npm ci
  npm run lint
  npm run typecheck
  npm run build
backend/:
  ./mvnw -B verify
```

P0 仅配置前端测试工具，业务测试在 P5～P7 添加，不宣称 `npm test` 已通过。GitHub Actions 在 P8 配置，当前没有完整 CI。

## P1 数据与真实数据库验证

六张表为 users、templates、assets、tasks、task_assets、task_steps。已有 P0 数据卷可直接升级，空库也会自动初始化。提供三个分类、每类两个模板，覆盖 1／2／3 张图片要求；全部接受 JPEG／PNG、单张 5 MiB。

本地演示账号：`demo_a`、`demo_b`，口令均为 `Demo123456!`。数据库保存不同随机盐的 BCrypt cost 10 哈希；P2 已支持这两个账号登录及独立注册新账号。

15 张图片为 Java 2D 原创几何示例，全部随源码和 JAR 交付，不依赖外部图片站。参见[素材来源及生成方式](demo-assets/SOURCES.md)。成功结果仍为预置模拟图片，不真实处理用户上传内容。

在独立 MySQL 项目运行全部后端检查：

```sh
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml run --rm p1-checks
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml down
```

P1 阶段 21 项、P2 阶段 41 项通过。P3 后当前完整组为 **62 项全部通过，0 失败、0 错误、0 跳过**；新增图片校验、存储故障清理、模板及素材 HTTP 集成，原有认证与持久层回归仍通过。

普通镜像构建没有运行中的数据库，当前会明确跳过 38 项数据库／认证／素材集成测试、执行其余 24 项；使用上述服务设置 RUN_DATABASE_TESTS=true 才运行完整组。不能把跳过当作通过。测试源码只读，Maven 缓存和输出均在专用卷内；p1-checks 现在运行全部后端测试，不限于历史 P1 用例。

已额外验证保留数据卷重建 MySQL／Java，个人记录和全部种子保持不变；验证夹具仅用于专用库，未修改默认开发账号或任务，详见阶段记录。

## P2 注册登录与会话

Java 已提供注册、登录、当前用户和退出接口；注册成功自动登录。先 GET `/api/auth/csrf` 保留 Cookie，再用返回的 Header／Token 发送注册或登录请求；成功后重新获取 Token。GET `/api/auth/me` 返回 id／username；带新 Token 的 POST `/api/auth/logout` 返回 204，并清理 Session、上下文、CSRF 和 Cookie。

用户名去首尾空白、转小写，3～32 位英文字母／数字／下划线；密码至少 8 个 Unicode 码点、UTF-8 最多 72 字节，保持原始内容、不截断。重名 409，错误凭据 401／BAD_CREDENTIALS，会话无效 401／UNAUTHENTICATED，前端应区分二者。

Session Cookie 为 HttpOnly／SameSite=Lax，登录轮换 ID；30 分钟空闲过期，仅在 Java 内存，重启后重新登录。已实测会话配置 1800 秒、退出撤销、旧 Cookie 失效及重启后账号仍能重新登录。认证主体只含用户身份，另保存普通权限及 CSRF Token，不含密码／哈希。

本轮通过 **41 项后端测试、10 项 Next.js→Java HTTP 检查和2项重启检查**。包括并发重名、Unicode 密码边界、CSRF、账号切换、用户隔离和显式认证上下文保存。

复现命令、专用测试账号清理、协议及归属助手见[认证说明](docs/authentication.md)。登录／注册页面属于 P5，当前完成的是后端 API。

## P3 模板、上传及预览

Java 从 MySQL 提供分类、列表、筛选和详情；六个封面可公开读取。登录后以 multipart 单字段 file 上传真实 JPEG／PNG，最大 5 MiB，同时检查实际格式、可解码性及 4000 万像素上限。返回服务端素材 ID 和本人预览地址，文件保存到数据卷，元数据保存到 MySQL。

本轮通过 **62 项后端测试、13 项实际 HTTP 检查及 2 项保留卷重建检查**。真实 Next.js→Java 路径覆盖精确 5 MiB、超限、伪装／损坏／空图片、Cookie／CSRF、用户隔离；Java 容器重建后重新登录，四份素材均可读取且哈希不变。

完整接口、错误码、存储故障边界、替换／移除语义和容器复现命令见[上传说明](docs/uploads.md)。专用检查读取 demo-assets 内的真实图片，证据快照仅写入忽略的 .local；验证组的素材留在专用卷，不清理默认开发数据。

P3 不提供删除素材 API。前端替换／移除仅更新表单引用；孤立文件没有自动清理。文件系统与数据库不是分布式事务，崩溃或提交结果不确定时可能出现未关联文件或缺文件记录，详见阶段记录。

## 接口与安全

请求、响应、枚举、空值、分页、认证和错误见 [API 契约](docs/api.md)。Java `ApiContracts.java` 与前端 `contracts.ts` 保存一致字段。

当前公开健康、CSRF、注册登录和模板／封面 GET；上传和本人预览已实现并要求身份，制作资源在 P4 实现。Cookie 使用 HttpOnly、SameSite=Lax，写请求检查 CSRF。CurrentUser／OwnedResources 只信任服务端身份，对其他用户的资源返回 404。同源转发连接失败／超时返回 502／504，不能把它们当作后台制作失败。

## 后续阶段与边界

- P1 数据、P2 认证、P3 模板与上传后端均已完成；尚未形成制作业务闭环。
- 下一阶段 P4 排队及三步；P5～P6 正式页面、历史及轮询；P7～P9 核心回归、CI 和交付。
- P0 探针不落盘、不执行制作，不可替代真实业务闭环；P1 证明数据库初始化不重置数据，运行中任务中断处理仍由 P4 实现。
- 首页为工程入口；已核实[参考布局](docs/reference-ui.md)，正式页面后续实施。

## 基本部署与回滚

固定 Git 提交并配置环境，执行 `docker compose up --build -d --wait`，核对健康状态和日志。更新前备份数据库及文件数据卷并记录当前提交。

回滚使用上一已验证提交重新构建启动，保留卷。P1 初始建表脚本不修改已存在表；后续数据库变更需单独评估，代码回退不等于数据回退。实际验证版本写入阶段记录。

## AI 工作流与来源

使用 AI 辅助：读取原题并映射 R-01～R-14，与用户确认范围及边界，编写设计和计划，逐阶段生成代码，在容器验证后修复问题，再同步 Git。P0 的实际检查和修正记录见阶段文档，不提交私人聊天或账号信息。

工程代码依照设计编写。Maven Wrapper 由 Apache 官方插件生成并保留许可头；依赖及镜像来自官方仓库。参考截图只用于观察，不作为项目素材分发；P1 自备素材由项目内 Java 2D 生成器制作，来源和复用范围已记录。实际投入按阶段记录，不将估计当作实耗。
