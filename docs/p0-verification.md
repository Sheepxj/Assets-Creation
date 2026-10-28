# P0 实施与验证记录

日期：2026-10-28（Asia/Shanghai）。范围仅为开发计划 P0-01～P0-08，M0 已达成；不宣称 P1～P9 已完成。

## 1. 环境与执行方式

- Windows 11，Docker Engine／CLI 27.3.1，Docker Compose 2.29.7，Linux 容器。
- 初始 Docker 引擎未运行，已启动现有 Docker Desktop；未重新安装系统运行时。
- 宿主机 Node 16.17.0、Java 23.0.2、Maven 3.8.6 只用于识别环境，不用于应用安装、构建、测试或运行。
- 实际容器：Node 22.23.4／npm 10.9.9、Java Temurin 21.0.12+8、Maven 3.9.16、MySQL 8.4.13。
- 初始 D 盘可用约 572.2 GiB，3000／8080 未发现已有监听。
- npm、Maven Central、Docker Hub 的依赖和镜像均实际下载成功。
- 验证环境为独立 `assets-creation-p0` 项目；默认 `assets-creation` 项目也从新数据卷启动成功。
- 验证后停止专用测试容器、保留其数据卷；默认三服务保持正常运行，入口 http://localhost:3000。

本轮从 15:45 左右开始，至 16:16 完成主要构建和边界联调约 31 分钟，包含镜像及依赖下载等待；之后为文档与 Git 收尾。此为自动执行墙钟记录，不冒充人工工时或整个项目实际投入。

## 2. P0 逐项证据

| 计划项 | 实施产物 | 实际验证 | 结论 |
| --- | --- | --- | --- |
| P0-01 环境 | 本记录、容器入口 | Docker 启动、磁盘与端口检查、实际下载 | 完成 |
| P0-02 版本 | package.json、package-lock.json、pom.xml、Wrapper、固定镜像、README | npm ci；实际运行版本；前后端构建 | 完成 |
| P0-03 最小工程 | App Router、Java 启动类、依赖、MyBatis SELECT 1 | 首页 200，Java／MySQL 健康 200，三服务 healthy | 完成 |
| P0-04 配置 | .env.example、application.yaml、Compose、.gitignore | Compose 配置通过，真实凭据不入库 | 完成 |
| P0-05 契约 | api.md、Java ApiContracts、前端 contracts.ts | 7 个 JSON 示例解析通过，枚举及空值统一 | 完成 |
| P0-06 同源 | App Router 转发、smoke profile、smoke-p0.mjs | 10 项真实跨容器 HTTP 检查通过 | 完成 |
| P0-07 容器 | 两个 Dockerfile、Compose、健康检查、两类数据卷 | 标准入口从空默认卷启动成功 | 完成 |
| P0-08 参考图 | reference-ui.md | 四张源图实际下载并逐张查看 | 完成 |

## 3. 构建与 Java 测试

执行了容器构建：

```sh
docker compose -p assets-creation-p0 -f compose.yaml -f compose.smoke.yaml build
```

前端 `npm ci`、lint、`tsc --noEmit` 和 Next.js 生产构建通过。产物包含首页、404、动态 `/api/[...path]` 和 `/health`。锁文件与 package.json 的全部直接依赖版本逐项一致，安装报告为零已知漏洞。

Java `./mvnw -B verify` 通过，构建使用 Java 21，测试统计：6 项、失败 0、错误 0、跳过 0。

| 测试 | 验证点 |
| --- | --- |
| healthChecksTheDatabaseThroughMyBatis | 控制器通过 Mapper 获取健康结果 |
| databaseFailureDoesNotReportHealthy | 数据库访问失败返回 503，不伪报 UP |
| protectedApiUsesJsonUnauthorizedInsteadOfLoginRedirect | 受保护接口返回 JSON 401，不重定向 HTML |
| csrfEndpointProvidesTokenAndHeaderName | 可获取 Token 与正确 Header 名称 |
| writesWithoutCsrfAreRejectedWithJson | 写请求缺 CSRF 返回 JSON 403 |
| smokeEndpointsAreAbsentInTheDefaultProfile | 默认 profile 未注册探针 |

这些是 MVC／安全边界测试，Mapper 使用替身。真实 MySQL 和 MyBatis SQL 的连通性由运行中的健康接口及下一节跨容器测试共同证明，不把替身测试当作数据库集成测试。

## 4. 跨容器 HTTP 检查

执行：

```sh
docker compose -p assets-creation-p0 -f compose.yaml -f compose.smoke.yaml up -d --wait mysql backend frontend
docker compose -p assets-creation-p0 -f compose.yaml -f compose.smoke.yaml run --rm checks
```

补验边界时使用 3001 端口避免影响默认项目。脚本从 Node 检查容器请求 Next.js，再由 Next.js 请求 Java，Java 真实连接 MySQL；不是 mock HTTP。

| 检查 | 结果 |
| --- | --- |
| 首页及 Java／MySQL 健康 | 200，database=UP |
| 多个 Set-Cookie | 两个独立 Cookie 均保留 |
| JSON、Cookie、Session、CSRF | 中文 JSON 一致，会话存在，写请求通过 |
| multipart | 字节数、MIME、SHA-256 完全一致 |
| 5 MiB 文件边界 | 5,242,880 字节全部到达 Java，哈希一致 |
| 超限文件 | 5 MiB + 1 字节返回 413／FILE_TOO_LARGE |
| PNG 响应 | 图片 Content-Type 与二进制逐字节一致 |
| 上游错误 | 400／SMOKE_ERROR 原样保留 |
| 401 与 403 | 未登录查询和缺 CSRF 写请求有不同状态 |
| 超时 | Java 延迟 12 秒，默认 10 秒代理返回 504／UPSTREAM_TIMEOUT |

10 项全部通过。尺寸探针使用填充字节验证传输限制，不将它当作合法图片校验；实际图像内容检查属于 P3。

切回默认 profile 后再次实测：健康 200、`/api/_smoke/cookies` 为 404、未登录 `/api/tasks` 为 401。默认配置不启用探针，业务也未被伪实现。

## 5. 标准入口与运行状态

停止专用验证组但保留卷后，执行：

```sh
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
```

默认项目从新建的 MySQL 与文件数据卷启动；MySQL → Java → Next.js 按健康依赖就绪，三个服务均 healthy。宿主机只公开 3000，Java 的 8080 与 MySQL 的 3306 不公开。

本次重用已验证的构建缓存启动默认项目；之前的首轮镜像、依赖安装、构建、测试均实际执行，不把缓存输出另计为一次测试运行。

## 6. 发现并修正的问题

1. Docker 起初没有可用引擎：启动已安装的 Docker Desktop，后续实际容器命令通过。
2. PowerShell 将未加引号的 Maven 版本参数拆分：官方插件生成了脚本但命令失败；修正 Wrapper 的分发 URL 为 3.9.16，容器实际下载并执行 verify 成功。
3. 首轮前端 lint 拒绝把 API 当页面导航，PostCSS 匿名默认导出有警告：API 链接改为明确的新窗口文档访问，配置改为具名变量导出；重新执行 lint、类型和生产构建通过。
4. 参考图此前无法读取：本轮直接读取成功，记录布局并修订设计中的“尚未核实”状态；截图不作为项目素材提交。

ESLint 使用兼容的 9.39.4：当前锁定的 eslint-plugin-react 7.37.5 声明支持至 ESLint 9，不强制绕过 peer 检查安装 ESLint 10。安装有 ESLint 9 停止支持提示，但本轮 lint 通过；后续升级需成组验证，不因此修改既定功能范围。

## 7. 后续范围与交付定位

- 不包含业务 schema／种子、注册登录、真实图片上传、三步制作及个人历史；这些仍是 P1～P6。
- 前端测试工具已配置，尚无前端业务测试；不将本轮 HTTP 脚本冒充 R-12 要求的多任务前端测试。
- GitHub Actions 尚未添加，计划在 P8；当前 GitHub 上有源码与本记录，不宣称远程 CI 已通过。
- 模拟参数及状态已固定契约，真正控制、失败中断和重启语义在 P4 实现并测试。
- 本轮只验证 P0，不声称整个题目已经完成；下一个开发入口是 P1。

## 8. Git 版本定位

P0 源码、锁文件、配置、API、验证记录、参考布局和计划勾选一起提交。记录提交标题为 `feat: initialize P0 full-stack foundation`，精确提交 ID 使用 `git log -1 --format=%H` 或本次交付消息核实；该提交同时包含本记录，避免在文件内写入自引用的提交哈希。
