# 素材制作系统

Next.js + Java + MySQL 的异步素材制作项目。需求见[题目说明](题目说明.md)，架构见[设计文档](docs/superpowers/specs/2026-10-28-assets-creation-design.md)，实施范围见[开发计划](docs/superpowers/plans/2026-10-28-assets-creation-implementation-plan.md)。

## 当前进度

P0～P8 已完成：Java／MySQL 后台闭环、正式页面、多任务／历史／恢复、核心自动化、容器成品及实际 CI。当前 Java 102 项、前端 76 项测试全部通过，静态检查与生产构建成功；冷构建、新卷启动和保留卷重建均有实际证据。

逐项结果见 [P0](docs/p0-verification.md)、[P1](docs/p1-verification.md)、[P2](docs/p2-verification.md)、[P3](docs/p3-verification.md)、[P4 源码复查](docs/p4-current-source-review.md)、[P5](docs/p5-verification.md)、[P6](docs/p6-verification.md)、[P7](docs/p7-verification.md)及 [P8 验证记录](docs/p8-verification.md)。P9 最终全需求验收与提交材料待执行。

[![CI](https://github.com/Sheepxj/Assets-Creation/actions/workflows/ci.yml/badge.svg)](https://github.com/Sheepxj/Assets-Creation/actions/workflows/ci.yml)

流水线在 push／pull_request 自动运行容器化检查，首次已确认通过的提交和实际日志见 [CI 说明](docs/ci.md)；提交版本对应状态以 Actions 的 head SHA 为准。

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
frontend/           App Router 页面、身份／上传／提交／任务状态、Java 同源转发及测试
backend/            认证、模板／素材／任务 API、三步执行／恢复、存储、MyBatis 和测试
database/           六表结构、幂等种子、只读检查和专用重建验证 SQL
demo-assets/        6 张封面、6 张模拟结果、3 张上传示例及来源／哈希清单
scripts/            容器内 P0／P2／P3／P4／P8 HTTP 与持久化检查
docs/               API、参考图、阶段验证、设计和开发计划
compose.yaml        正常运行的 Next.js、Java、MySQL 三服务
compose.smoke.yaml  P0 smoke profile 与检查容器
compose.p1.yaml     真实 MySQL 的 P1 集成测试容器
compose.p2.yaml     P2 实际 HTTP 与会话重启检查
compose.p3.yaml     P3 实际上传与保留卷重建检查
compose.p4.yaml     P4 异步闭环、指定失败与停止／重启 HTTP 检查
compose.p8.yaml     P8 新注册账户、完整任务与结果的重建快照检查
compose.frontend.yaml 容器内前端 lint／类型／76 项测试，无需启动数据库
.github/workflows/ci.yml push／pull_request 的前端与 Java／MySQL 容器检查
.env.example        无真实凭据的开发演示配置
```

业务执行和持久化在 Java。Java 启动时执行数据库初始化并验证示例图片；数据库和素材说明见 [database/README.md](database/README.md)。后端 Docker 构建上下文为仓库根目录，以同时打包 database 和 demo-assets；请使用 Compose 或 `docker build -f backend/Dockerfile .`。

## 构建与启动

需要 Docker 引擎和 Compose，不需要宿主机 Node.js、Java 或 Maven。首次运行需要访问 Docker Hub、npm 和 Maven Central。在仓库根目录执行：

```sh
docker compose up --build
```

打开 [http://localhost:3000](http://localhost:3000) 浏览模板，注册或登录，进入详情上传并提交。可用 `demo_a`／`demo_b`，密码均为 `Demo123456!`；上传示例在 `demo-assets/samples/`。海岸假日只需一张图，受理后点击“开始下一次制作”可连续提交，原任务在右侧继续。导航“我的作品”查看本人历史，成功卡片打开结果预览，Escape 关闭。也可访问 [Java／MySQL 健康接口](http://localhost:3000/api/health)及[模板 API](http://localhost:3000/api/templates)。页面与状态说明见[前端说明](docs/frontend.md)。

可选复制 `.env.example` 为 `.env` 修改配置；不复制也可用本地演示默认值。示例口令仅供本地运行，外部部署前替换。

```sh
docker compose config
docker compose ps
docker compose logs backend
docker compose down
```

`down` 保留数据卷；需要保留数据时不要使用 `--volumes`。只有前端端口向宿主机公开，Java 和 MySQL 使用容器网络。生产服务不挂载宿主机源码，Java／Next.js 使用非 root 用户；MySQL 就绪、Java 初始化与任务恢复完成后才依次启动。冷构建及完整隔离验收命令见[容器说明](docs/containers.md)。

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
| SIM_CHECK_DELAY_MS | 2000 | 素材检查耗时，非负毫秒 |
| SIM_GENERATE_DELAY_MS | 8000 | 模拟生成耗时，非负毫秒 |
| SIM_FINALIZE_DELAY_MS | 2000 | 结果整理耗时，非负毫秒 |
| SIM_FAIL_STAGE | NONE | NONE／MATERIAL_CHECK／GENERATE／FINALIZE，非法值阻止启动 |
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

前端构建依次执行 `npm ci`、`npm run lint`、`npm run typecheck`、`npm test -- --run`、`npm run build`。Java 通过 `./mvnw -B verify` 执行测试和打包。P0 的 6 项 Java 测试及上述 10 项跨容器 HTTP 检查为历史基础证据；当前完整后端组和前端结果见后文。

有本地工具的开发者也可在相应目录运行以下命令，评估者不必在宿主机执行：

```text
frontend/:
  npm ci
  npm run lint
  npm run typecheck
  npm test -- --run
  npm run build
backend/:
  ./mvnw -B verify
```

P8 已通过前端 15 文件、76 项测试，以及 lint、类型检查和生产构建（P5／P6／P7 当时分别为 49／68／74 项）。只运行前端检查的容器命令如下，不需要 Java／MySQL：

```sh
docker compose -p assets-creation-frontend-checks -f compose.yaml -f compose.frontend.yaml run --build --rm frontend-checks
```

覆盖 Cookie／CSRF、身份和旧响应隔离、上传竞争、结果未知时原键重试、多任务／超时隔离、跨首屏恢复、终态同步、无任务停止轮询、筛选分页及预览。P8 补充生产代理提前返回 413 后关闭连接、多 Cookie 及响应头过滤回归；GitHub Actions 已配置并实际通过，详情见 [CI 说明](docs/ci.md)。

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

P1 阶段 21 项、P2 阶段 41 项、P3 阶段 62 项、首次 P4 为 91 项，P4 源码复核后为 98 项、P7 为 101 项。P8 当前完整组为 **102 项全部通过，0 失败、0 错误、0 跳过**；包含阻塞时受理、未提交任务不可领取、终态查询不写状态，以及应用尚未就绪时的健康响应。

普通后端镜像构建没有运行中的数据库，不执行数据库集成组；当前报告 41 执行／57 跳过，禁用参数化测试时按方法计数。须用上述专用服务设置 RUN_DATABASE_TESTS=true 才得到完整 102 项结果，不能把 skip 当通过。测试源码只读，Maven 缓存和输出均在专用卷内；p1-checks 运行全部后端测试，不限于历史 P1。测试项目只启动 MySQL，不能让实际后台执行器连接该库；HTTP 验证使用另一个 Compose 项目，详见[任务说明](docs/tasks.md)。

已额外验证保留数据卷重建 MySQL／Java，个人记录和全部种子保持不变；验证夹具仅用于专用库，未修改默认开发账号或任务，详见阶段记录。

## P2 注册登录与会话

Java 已提供注册、登录、当前用户和退出接口；注册成功自动登录。先 GET `/api/auth/csrf` 保留 Cookie，再用返回的 Header／Token 发送注册或登录请求；成功后重新获取 Token。GET `/api/auth/me` 返回 id／username；带新 Token 的 POST `/api/auth/logout` 返回 204，并清理 Session、上下文、CSRF 和 Cookie。

用户名去首尾空白、转小写，3～32 位英文字母／数字／下划线；密码至少 8 个 Unicode 码点、UTF-8 最多 72 字节，保持原始内容、不截断。重名 409，错误凭据 401／BAD_CREDENTIALS，会话无效 401／UNAUTHENTICATED，前端应区分二者。

Session Cookie 为 HttpOnly／SameSite=Lax，登录轮换 ID；30 分钟空闲过期，仅在 Java 内存，重启后重新登录。已实测会话配置 1800 秒、退出撤销、旧 Cookie 失效及重启后账号仍能重新登录。认证主体只含用户身份，另保存普通权限及 CSRF Token，不含密码／哈希。

P2 阶段通过 **41 项后端测试、10 项 Next.js→Java HTTP 检查和2项重启检查**。包括并发重名、Unicode 密码边界、CSRF、账号切换、用户隔离和显式认证上下文保存。

复现命令、专用测试账号清理、协议及归属助手见[认证说明](docs/authentication.md)。P5 已提供登录／注册页面、确认密码、安全 returnTo、身份恢复及切换清理；网络异常保留已知身份并提供重新确认，错误密码不会退出旧账户。

## P3 模板、上传及预览

Java 从 MySQL 提供分类、列表、筛选和详情；六个封面可公开读取。登录后以 multipart 单字段 file 上传真实 JPEG／PNG，最大 5 MiB，同时检查实际格式、可解码性及 4000 万像素上限。返回服务端素材 ID 和本人预览地址，文件保存到数据卷，元数据保存到 MySQL。

本轮通过 **62 项后端测试、13 项实际 HTTP 检查及 2 项保留卷重建检查**。真实 Next.js→Java 路径覆盖精确 5 MiB、超限、伪装／损坏／空图片、Cookie／CSRF、用户隔离；Java 容器重建后重新登录，四份素材均可读取且哈希不变。

完整接口、错误码、存储故障边界、替换／移除语义和容器复现命令见[上传说明](docs/uploads.md)。专用检查读取 demo-assets 内的真实图片，证据快照仅写入忽略的 .local；验证组的素材留在专用卷，不清理默认开发数据。

P3 不提供删除素材 API。前端替换／移除仅更新表单引用；孤立文件没有自动清理。文件系统与数据库不是分布式事务，崩溃或提交结果不确定时可能出现未关联文件或缺文件记录，详见阶段记录。

## 接口与安全

请求、响应、枚举、空值、分页、认证和错误见 [API 契约](docs/api.md)。Java `ApiContracts.java` 与前端 `contracts.ts` 保存一致字段。

当前公开健康、CSRF、注册登录和模板／封面 GET；上传、任务、历史和本人图片要求身份。Cookie 使用 HttpOnly、SameSite=Lax，写请求检查 CSRF；归属来自服务端会话，对其他用户的资源返回 404。同源转发连接失败／超时返回 502／504，不能把它们当作后台制作失败。

## P4 制作、模拟与重启

提交后短事务创建 QUEUED 任务、三步记录、有序素材关联及配置快照，返回 202；同用户同 requestId 幂等，相同键不同模板／素材顺序为 409。单后台执行器按 MySQL 创建顺序领取，依次执行素材检查 → 模拟生成 → 结果整理。各阶段持久化状态、时间和原因，延迟／文件操作在事务外；最后步骤与任务成功同事务提交。

`GET /api/tasks` 提供本人分页历史和状态筛选；`/api/tasks/active` 返回全部未结束任务；`/api/tasks/{id}` 提供三个步骤；`/result` 仅允许本人成功任务读取。查询不执行制作，关闭客户端也不取消任务。结果为仓库预置模拟图片的任务专属副本。

成功默认使用 NONE 与 2000／8000／2000 毫秒。指定失败设置 SIM_FAIL_STAGE 为三个阶段之一，调整相应 SIM_*_DELAY_MS 后重建后端，再重新登录并创建新任务。先等已有任务结束再切换；后续环境变化不改变旧排队任务的配置。

正常关闭先停止领取、允许当前任务在窗口内完成；要完整观察可用 `docker compose stop -t 25 backend`。启动时遗留 RUNNING 与执行中步骤变成 FAILED／SERVICE_RESTARTED，原因“服务重启导致制作中断”；QUEUED 继续、终态不变。不续跑执行中任务，不支持多后端共同消费。

首次 P4 通过 91 项后端测试及完整 HTTP 生命周期验证；源码复核修正了关闭竞争，当时为 98 项。P7 完整组为 101 项，P8 为 102 项。详细缺陷复现、19 项源码映射和历史 HTTP 证据见[P4 源码复核](docs/p4-source-audit.md)，自动化矩阵见[P7 验证](docs/p7-verification.md)，当前联调见[P8 验证](docs/p8-verification.md)，复现与边界见[任务说明](docs/tasks.md)。

## P5～P7 前端、回归与后续边界

- P0～P7 已完成，M1 后端闭环、M2 浏览器闭环、P6 状态专项与 P7 自动化回归均有证据，见 [P5](docs/p5-verification.md)、[P6](docs/p6-verification.md)、[P7 记录](docs/p7-verification.md)。
- 每个未完成任务独立查询；失败请求保留任务数据并暂停，提供恢复操作；详情、近期及分页发现的终态统一同步历史和数量，迟到旧阶段不能倒退。终态或无任务时不定时轮询，刷新从 Java 恢复。
- P6 修复近期查询先发现终态时漏刷新历史、迟到阶段倒退及筛选总数缩小时页码不可达；当时新增测试先在 P5 旧代码复现相关缺陷，再验证修复。
- P7 对 14 个 BE／11 个 FE 场景逐项核对，测试先卸载／清缓存再还原假时钟；Worker 线程、JDBC 活动连接及四个连接池关闭均有检查。测试数据库最终仅保留种子，无任务或素材残留。
- P8 已完成 CI、冷构建及容器持久化联调，剩余 P9 最终全需求验收与提交材料；本站无待处理任务时，不自动发现其他浏览器新增任务，可手动刷新。
- P0 探针不替代真实业务闭环；重启中断已由 P4 实测，不支持执行中自动续跑。
- 已按[参考布局](docs/reference-ui.md)实现深色模板网格、制作／记录双栏、窄屏单栏及键盘预览，优先基本可用性。
- 未提交表单不跨刷新保留；已受理任务由 Java 恢复。替换／移除只清表单引用，无孤立文件自动清理。未知提交保留原 requestId 供手动安全重试，不自动重放写请求。

## 基本部署与回滚

固定 Git 提交并配置环境，执行 `docker compose up --build -d --wait`，核对健康状态和日志。更新前备份数据库及文件数据卷并记录当前提交。

回滚使用上一已验证提交重新构建启动，保留卷。P1 初始建表脚本不修改已存在表；后续数据库变更需单独评估，代码回退不等于数据回退。实际验证版本写入阶段记录。

## AI 工作流与来源

使用 AI 辅助：读取原题并映射 R-01～R-14，与用户确认范围及边界，编写设计和计划，逐阶段生成代码，在容器验证后修复问题，再同步 Git。P0 的实际检查和修正记录见阶段文档，不提交私人聊天或账号信息。

工程代码依照设计编写。Maven Wrapper 由 Apache 官方插件生成并保留许可头；依赖及镜像来自官方仓库。参考截图只用于观察，不作为项目素材分发；P1 自备素材由项目内 Java 2D 生成器制作，来源和复用范围已记录。实际投入按阶段记录，不将估计当作实耗。
