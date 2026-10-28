# 素材制作系统

Next.js + Java + MySQL 的异步素材制作项目。需求见[题目说明](题目说明.md)，架构见[设计文档](docs/superpowers/specs/2026-10-28-assets-creation-design.md)，实施范围见[开发计划](docs/superpowers/plans/2026-10-28-assets-creation-implementation-plan.md)。

## 当前进度

P0 已完成：工程基础、接口契约、同源转发和最小容器入口。模板、注册登录、上传落盘和制作任务属于后续阶段，尚未实现。CSRF 与认证边界不代表完整账号功能已完成。

逐项结果见 [P0 验证记录](docs/p0-verification.md)。后续功能说明和接口是开发约定，不冒充已交付功能。

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
backend/            Java API、MyBatis 连通检查、安全基础、Java DTO 与测试
scripts/            容器内 P0 HTTP 集成检查
docs/               API、参考图、阶段验证、设计和开发计划
compose.yaml        正常运行的 Next.js、Java、MySQL 三服务
compose.smoke.yaml  P0 smoke profile 与检查容器
.env.example        无真实凭据的开发演示配置
```

业务执行和持久化在 Java。P0 通过 MyBatis SELECT 1 验证 MySQL，业务表和种子在 P1 添加。

## 构建与启动

需要 Docker 引擎和 Compose，不需要宿主机 Node.js、Java 或 Maven。首次运行需要访问 Docker Hub、npm 和 Maven Central。在仓库根目录执行：

```sh
docker compose up --build
```

打开 [http://localhost:3000](http://localhost:3000)，当前首页提供连接检查入口。也可访问 [Java／MySQL 健康接口](http://localhost:3000/api/health)。

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
| STORAGE_ROOT | Compose 为 /app/data | 文件目录，P3 开始写素材 |
| SESSION_TIMEOUT | 30m | 会话空闲超时 |
| SESSION_COOKIE_SECURE | false | 本地 HTTP；HTTPS 设为 true |
| PROXY_TIMEOUT_MS | 10000 | 单个 Java 请求超时，不是制作耗时 |
| SIM_CHECK_DELAY_MS | 2000 | 素材检查耗时，P4 启用并校验 |
| SIM_GENERATE_DELAY_MS | 8000 | 模拟生成耗时，P4 启用并校验 |
| SIM_FINALIZE_DELAY_MS | 2000 | 结果整理耗时，P4 启用并校验 |
| SIM_FAIL_STAGE | NONE | NONE／MATERIAL_CHECK／GENERATE／FINALIZE，P4 启用 |
| SPRING_PROFILES_ACTIVE | 空 | 默认无 smoke 探针，转发验证时使用 smoke |

数据库使用 utf8mb4 和 UTC。演示内网 JDBC 不使用 TLS，真实远程数据库应另行配置。已有卷不会因修改初始化环境密码自动修改账户。

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

## 接口与安全

请求、响应、枚举、空值、分页、认证和错误见 [API 契约](docs/api.md)。Java `ApiContracts.java` 与前端 `contracts.ts` 保存一致字段。

当前公开健康与 CSRF，其他业务保留认证边界，注册登录在 P2 开放。Cookie 使用 HttpOnly、SameSite=Lax，写请求检查 CSRF。同源转发连接失败／超时返回 502／504，不能把它们当作后台制作失败。

## 后续阶段与边界

- P1 添加业务 schema、种子模板、演示账号和合法示例素材。
- P2 注册登录；P3 模板与上传；P4 排队及三步；P5～P6 正式页面、历史及轮询；P7～P9 核心回归、CI 和交付。
- P0 探针不落盘、不执行制作，不可替代真实业务闭环；模拟控制与重启策略目前为契约。
- 首页为工程入口；已核实[参考布局](docs/reference-ui.md)，正式页面后续实施。

## 基本部署与回滚

固定 Git 提交并配置环境，执行 `docker compose up --build -d --wait`，核对健康状态和日志。更新前备份数据库及文件数据卷并记录当前提交。

回滚使用上一已验证提交重新构建启动，保留卷。本阶段没有业务 schema 迁移；后续数据库变更需单独评估，代码回退不等于数据回退。实际验证版本写入阶段记录。

## AI 工作流与来源

使用 AI 辅助：读取原题并映射 R-01～R-14，与用户确认范围及边界，编写设计和计划，逐阶段生成代码，在容器验证后修复问题，再同步 Git。P0 的实际检查和修正记录见阶段文档，不提交私人聊天或账号信息。

工程代码依照设计编写。Maven Wrapper 由 Apache 官方插件生成并保留许可头；依赖及镜像来自官方仓库。参考截图只用于观察，不作为项目素材分发；P1 为自备素材另记来源与复用范围。实际投入按阶段记录，不将估计当作实耗。
