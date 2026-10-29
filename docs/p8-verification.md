# P8 容器成品与 CI 验证

本文件保留 P8 当时的阶段记录。P9 已随后完成最终 18 项场景、交付文档及成套备份恢复，见 [最终验收](acceptance.md)；下文“P9 待执行”为 P8 完成时的历史状态。

日期：2026-10-29（Asia/Shanghai）。依据[原题 R-01／R-12／R-14](../题目说明.md)及[计划 P8-01～09](superpowers/plans/2026-10-28-assets-creation-implementation-plan.md)。从 P7 提交 `791e614` 继续，CI／就绪修复先提交为 `330a462`，本记录随代理修复及验收脚本提交。构建、测试、应用及 HTTP 检查均在容器中执行。

**P8 九项已具备实现与实际验证依据。** 当前完整后端 **102 项，0 失败／错误／跳过**，前端 **15 文件／76 项**、lint、独立类型检查及生产构建通过。P9 的最终全需求验收和交付提交仍待执行，不在此宣称整份任务完成。

## 逐项证据

| 条目 | 实现与本次验证 |
| --- | --- |
| P8-01 可重复构建 | 前端 package-lock＋npm ci，Node 22.23.4；Java Wrapper＋Maven 3.9.16／Java 21。两个镜像均实际执行 --no-cache 构建；Java 使用此前未使用的 Maven 下载缓存。首次 CI 的两个下载缓存均未命中，仍完整成功 |
| P8-02 卷与成品 | compose.yaml 分离 mysql-data、asset-data。运行检查证明 MySQL／Java 仅挂各自的数据卷，前端无挂载；Java 用户 app、前端 node。JAR 内六模板、六封面／结果和三上传示例可用，无生产源码绑定 |
| P8-03 就绪顺序 | MySQL 应用账户 SELECT 1；TaskWorker 先恢复再开放领取；HealthController 同时要求 ACCEPTING_TRAFFIC 与数据库可用；Next.js 依赖 Java 健康。补充 REFUSING_TRAFFIC 返回 503／SERVICE_NOT_READY 且不访问数据库的测试 |
| P8-04 生产代理 | 实际浏览器登录、选图上传、202 受理、后台成功及结果预览；实际 HTTP 完整上传 13 项、任务 7 项、代理探针 10 项。覆盖 Cookie／CSRF、multipart、私有图片头、5 MiB／超限、401／403 和 10 秒上游超时的 504 |
| P8-05 CI 步骤 | .github/workflows/ci.yml 监听 push／pull_request／workflow_dispatch；独立 Node／Maven job 容器，显式 lint、tsc、测试、Next.js build 及 Maven verify／打包；已运行 push，不把 PR 触发配置说成已运行 PR |
| P8-06 CI MySQL／缓存 | 独立 mysql:8.4.13 service、应用账户健康检查、RUN_DATABASE_TESTS=true；只缓存下载目录，每次重新安装／测试／构建。仅使用公开临时 CI 口令，无真实 secrets；测试报告保留七天 |
| P8-07 运行命令 | README 与 [containers.md](containers.md) 对应实际服务／脚本；真实使用标准 up --build 启动，无手工建表或额外下载图片；本地测试命令仍容器化 |
| P8-08 冷启动／持久化 | assets-creation-p8 首次创建新网络和两个新卷；全部容器删除后重新 up --build。三容器 ID 均改变，两卷保留；账户、素材原字节、完整 TaskDto／步骤、结果哈希及历史不变，初始化不重复插入 |
| P8-09 实际 CI | `330a4624354c64f9c1c23a624444f8f4923105e2` 的 [run 40813345750](https://github.com/Sheepxj/Assets-Creation/actions/runs/40813345750) 两 job 全部成功；实际日志为 Java 102、前端当时 74。代理新增两项后，本地为 76；本记录提交后的最终 CI 另外按该提交 SHA 核对，在交付消息给出对应运行链接 |

## 冷构建与启动

两个生产 Dockerfile 固定工具链、多阶段打包；前端使用 standalone，Java 使用可执行 JAR。正常运行不依赖宿主机源码、Node、Java 或 Maven。基础镜像层可由 Docker 缓存；这里的冷构建指 --no-cache 重新执行安装和构建，并为 Java 使用空下载缓存，不宣称每次重新下载所有基础镜像层。

首次独立 Maven 命名空间构建遇到 Maven Central TLS handshake terminated，依赖为 spring-boot-starter-logging:3.5.16，未降低 TLS 校验。随后使用此前未使用的默认 Maven 缓存命名空间，再次 --no-cache 完整下载并成功打包（构建步骤约 220 秒）。前端 --no-cache 实际重跑 npm ci、静态检查、测试及生产构建。此处保留失败经过，不将首次失败写成通过。

最终验证镜像：

- backend：`sha256:e83222b072a9c4dc4eac83617a92e6743982d4f486c60fd96f4dec20dfc4850e`。
- frontend（含 413 修复）：`sha256:efa4158fcb62a9bf7be89df303c622e68de7ee9eb1bebbd2f89ea7ea5cf1fcff`。

普通后端镜像构建因没有运行中的数据库，报告 98 项中 **41 执行、57 跳过**；参数化测试禁用时按方法计数。完整 102 项来自独立 MySQL＋Maven verify 和真实 CI，不能将镜像构建的 skip 当成通过。

## 联调发现并修复的问题

生产上传组在超大 multipart 被提前拒绝后，两次都于后续预览请求出现 ECONNRESET；三服务仍健康。Next.js 转发响应时删除上游 hop-by-hop 头，却使未完整消费的上传连接看起来可复用。

在 `frontend/src/app/api/[...path]/route.ts` 对 413 显式设置本跳 `Connection: close`，其余响应仍按原规则过滤；保留 Java 的状态码及结构化错误，不自动重放 POST。新增 proxy.test.ts 两项覆盖该分支、多 Set-Cookie、查询参数、Cookie 与头过滤。修复后真实上传组全部 13 项通过，包含精确 5 MiB、超限后继续上传及最后预览；生产代理探针 10 项亦通过。

## 持久化直接检查

重建前先确认无排队／执行中任务。计数在重建前后完全一致：

| 表／状态 | 重建前 | 重建后 |
| --- | --- | --- |
| users | 3 | 3 |
| templates | 6 | 6 |
| assets | 15 | 15 |
| tasks | 6 | 6 |
| task_assets | 6 | 6 |
| task_steps | 18 | 18 |
| QUEUED／RUNNING | 0 | 0 |

这些是专用验收产生的数据，包含先前失败联调留下的上传记录，不作为空库种子数量。快照用独立随机注册用户，历史恰好两任务；另有 demo_a 的三份 HTTP 任务及一份真实浏览器任务。

prepare 共 7 项；重建后 verify 共 5 项；P3 上传重建组 2 项。逐字段核对账户身份、完整 TaskDto（含步骤及时间）、素材及结果 SHA-256，不只比较计数。旧 Session 返回 401，重新登录可读原记录。临时 smoke profile 完成 10 项后恢复默认，再运行相同 verify 5 项确认数据与关闭探针状态；此重复检查不另算新增功能覆盖。

浏览器重建前创建任务 `0ed2c015`，重建后以 demo_a 登录仍为成功，三步完成；预览原 `/api/tasks/{id}/result` 图片实际加载，naturalWidth=960。截图保存在本地忽略目录，未将会话和截图打进生产镜像。

## 日志、清理与范围

本地证据仅在被 Git／Docker 忽略的 .local：p8-cold-backend-first.log、p8-cold-backend-build.log、p8-cold-frontend-build.log、p8-cold-start.log、p8-proxy-fix-build.log、p8-upload-http.log、p8-task-http.log、p8-persistence-prepare.log、p8-recreate.log、p8-persistence-verify.log、p8-upload-after-recreate.log、p8-proxy-smoke.log、p8-persistence-final.log、p8-counts-before／after.txt、p8-runtime-before／after.txt，以及浏览器前后截图。持久化 JSON 含 Cookie，不输出、不提交。复现命令见 [containers.md](containers.md)，CI 细节见 [ci.md](ci.md)。

本阶段约 11:26 开始，包含冷依赖下载、故障定位、真实任务延迟、容器重建及远程 CI 等待；为自动执行墙钟时间，不等于人工工时。中途应用户要求复核 P4，当前完整后端 102 项及实际 HTTP 7 项再次通过，没有另改 P4 业务逻辑。

默认 3000 环境升级到上述已验证镜像前确认无未完成任务，保留数据库／文件卷，并为旧镜像保存 pre-p8 标签。专用 P8 运行及测试组结束后停止、保留卷，不清理默认开发数据。重启后 Java 内存 Session 失效，用户需重新登录；该设计边界不改变。

P9 仍保留原清单：全需求最终验收、README 最终交付说明、实际投入与已知限制总表、验收 commit 和提交材料。无公网部署、多实例、执行中续跑、失败重试、自动清理孤立文件或自动发布，均沿用设计范围。
