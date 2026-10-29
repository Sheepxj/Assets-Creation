# 最终验收记录

本文件保留 P9 历史验收证据。后续独立审查发现的三个前端边界问题及修复验证见[修复记录](audit-bugfix-verification.md)；下述历史场景通过不表示覆盖了所有边界输入。

日期：2026-10-29（Asia/Shanghai）。对照[原题](../题目说明.md)、[定稿设计](superpowers/specs/2026-10-28-assets-creation-design.md)及[计划 P9](superpowers/plans/2026-10-28-assets-creation-implementation-plan.md)执行。业务代码基线为 `6b2415073bb0d5780d315eab5d24ec9fc8a74163`；P9 增加交付文档、容器内 API 示例及仅验收用访问日志配置，没有改业务行为。

**AC-01～AC-18 均已执行并通过；R-01～R-14 和追加注册／队列恢复方案均有对应实现。** 最终仓库／ZIP 版本固定为交付标签 `delivery-2026-10-29`，完整 commit 和该版本 CI 随交付消息提供，可通过 `git rev-parse 'delivery-2026-10-29^{commit}'` 独立核对。未实施的范围及未验证环境在下文明确列出。

## 环境与证据范围

- 宿主 Windows／PowerShell，Docker Engine 27.3.1（linux/amd64）、Compose v2.29.7-desktop.1。安装、构建、测试和应用／API 示例运行均在 Linux 容器内，宿主只进行 Docker／Git 调用、文件检查和浏览器操作。
- 新建 assets-creation-p9 三服务和专用 MySQL／文件卷，端口 3001；浏览器使用 127.0.0.1，默认开发入口为 localhost:3000，分离会话主机。备份恢复使用另一全新 assets-creation-p9-restore 项目／卷、端口 3002。
- 首次卷检查为空；初始化后仅 users=2、templates=6、assets=0、tasks=0。使用公开演示账号及专用合成验收用户，不修改默认开发用户数据。
- 浏览器直接操作真实 Java／MySQL。HTTP 检查使用既有 smoke-p3／p4／p8 脚本及独立 P9 快照；前端竞争、迟到响应及可控超时另有实际 Providers／ApiClient 的测试，矩阵见 [P7](p7-verification.md)。不把自动化替身说成浏览器网络拦截。
- compose.p9.yaml 仅启用方法／路径／状态码的 Tomcat 访问日志，用于检查真实轮询次数；不记录 Cookie、请求头或请求体，正常 compose.yaml 不启用。

## AC-01～18 的实际结果

| 场景 | 本次方法及观察 | 结果 |
| --- | --- | --- |
| AC-01 空卷启动 | 新项目执行 up --build，自动创建两个新卷、六表／种子；MySQL→Java→Next.js 全部健康，封面无需额外下载。P9 override 仅增加访问日志，P8 另已验证基础标准命令 | 通过 |
| AC-02 分类／详情 | 匿名首页六卡、三个分类；旅行筛选两卡；进入 1／2／3 图模板，要求和封面来自 Java | 通过 |
| AC-03 注册／登录 | 浏览器注册 p9_review_1029 后自动登录；退出，重名注册明确提示；错误密码提示，正确密码恢复身份。HTTP 检查认证／CSRF，退出撤销及旧会话保护由当前 AuthIntegrationTest 覆盖 | 通过 |
| AC-04 上传 | PNG 实际上传中→成功，预览使用 /api/assets/{id}/content；JPEG 替换与上传、移除后禁提交；Markdown 与 5 MiB+1 字节夹具均有明确错误。真实上传组 13 项验证服务端内容、数量、归属、精确大小边界与超限 | 通过 |
| AC-05 成功闭环 | 浏览器创建任务后立即出现受理／排队／当前步骤，最后三步完成、真实结果可预览；HTTP 组验证 202 快速返回及三个独立阶段 | 通过 |
| AC-06 连续多任务 | 浏览器连续提交 4900487e、e4424540，一条制作一条排队；期间浏览其他模板、三图上传页和历史；各自结果、步骤及时间独立 | 通过 |
| AC-07 刷新恢复 | 两条未结束时刷新 /tasks，仍从 Java 恢复 RUNNING／QUEUED 并继续跟踪；HTTP 另验证停止查询后新客户端仍读到成功 | 通过 |
| AC-08 停止轮询 | 首条成功、第二条尚在执行时记录首条详情 GET=11，第二条完成后仍为 11；全部完成后 12:27:53～12:28:13 的任务 GET 总数保持 80，没有空闲定时查询 | 通过 |
| AC-09 检查失败 | 新配置 MATERIAL_CHECK 后创建任务，阶段／原因持久化；生成和整理 PENDING，页面显示未执行，无结果入口 | 通过 |
| AC-10 生成失败 | 新配置 GENERATE 后，检查成功、生成失败、整理未执行；后续终态查询不改变记录 | 通过 |
| AC-11 整理失败 | 新配置 FINALIZE 后，前两步成功、整理失败、无成功结果；三种失败均在真实历史页面同时核对 | 通过 |
| AC-12 可调耗时／快照 | 浏览器任务使用 10000／20000／10000 ms，数据库测得首条 10033／20030／10022，第二条 10028／20022／10026；另有重启后旧排队仍使用 15000 ms／MATERIAL_CHECK，未被新 0／NONE 覆盖 | 通过 |
| AC-13 查询异常 | 两任务执行期间仅 stop frontend，Java／MySQL 保持运行；页面显示查询异常并保留 GENERATE／QUEUED，直接 SQL 仍为 RUNNING／QUEUED。start frontend 后手动刷新，读到首条成功与第二条未完成，无伪造 FAILED | 通过 |
| AC-14 用户隔离 | A 退出后 B 历史为空，A 的卡片消失；再登录 A 恢复两条。HTTP 13／7 项还直接验证他人素材、任务及结果 404；旧 scope／忽略 abort 的迟到响应由当前前端测试直接覆盖 | 通过 |
| AC-15 强制重启 | 真实创建一个长阶段 RUNNING＋一个 QUEUED 后 SIGKILL Java；新实例中旧会话 401，前者 FAILED／SERVICE_RESTARTED 并保留阶段，后者继续原快照后发生预设模拟失败；此前六份成功／失败终态及成功图片保持不变，验证组 3 项通过 | 通过 |
| AC-16 异常页面 | 不存在模板显示原因与重试且无提交按钮；B 空历史；专用库临时移走旅行分类模板产生真实空分类并立即恢复；无运行任务时短停 Java，模板请求失败有重试，恢复后再次出现两卡；路由加载态可见 | 通过 |
| AC-17 小屏／键盘 | 375×812 下文档宽 360，三上传位各 136px、主按钮 282px；Tab 进入第二上传位；Enter 打开预览，图片 naturalWidth=960，焦点在关闭按钮，Escape 返回原预览按钮 | 通过 |
| AC-18 容器重建 | 保留两卷 down 后重新 up --build；完整账户／素材／TaskDto／步骤／结果快照 5 项及上传重建 2 项通过；浏览器重新登录仍预览原 4900487e 结果。额外成套备份导入另一套新卷后相同 5＋2 项也通过 | 通过 |

AC-13 没有重启 Java，用网络查询失败区别于 AC-15 的真实任务中断。正常关闭的领取锁、等待窗口和后续任务保留已在 [P4 源码复核](p4-source-audit.md)验证；本次 AC-15 特意使用 SIGKILL，不用正常完成冒充中断恢复。

## 持久化与备份的直接证据

备份前确认 active=0，停止前端和 Java，再用 mysqldump 和 tar 一起备份 SQL／文件。SQL 28,080 字节、文件归档 488,048 字节，均只保存在忽略目录。新恢复组先创建空 MySQL，导入 SQL／文件后才启动 Java；Java 可用 app 用户读写存储，种子不覆盖已有数据。

| 表／状态 | 备份前 | 原组保留卷重建后 | 新卷导入备份后 |
| --- | --- | --- | --- |
| users | 4 | 4 | 4 |
| templates | 6 | 6 | 6 |
| assets | 10 | 10 | 10 |
| tasks | 12 | 12 | 12 |
| task_assets | 12 | 12 | 12 |
| task_steps | 36 | 36 | 36 |
| QUEUED／RUNNING | 0 | 0 | 0 |

不只比较计数：verify 逐字段比较账号、完整 TaskDto（含步骤和时间）、模板，以及上传和结果 SHA-256。随后在恢复组执行 examples/api-demo.mjs，实际得到 201 AssetDto、202 QUEUED、最终 SUCCEEDED，以及 200 image/png／48,122 字节结果，最后退出；该示例另新增一份演示素材和任务，不混入上表的恢复时点计数。

## R-01～14 最终覆盖

| 原题 | 当前实现与可查证据 |
| --- | --- |
| R-01 | frontend App Router／React／TS；backend Spring Boot／MyBatis，业务及持久化由 Java→MySQL。package.json／锁文件、pom／Wrapper、Dockerfile 及实际容器构建可查 |
| R-02 | seed.sql 六模板／三分类／1～3 图要求，TemplateController／Mapper 读取；demo-assets 真实可解码本地图片。AC-02、上传 HTTP 公开接口与哈希 |
| R-03 | TemplateDetail／Creator／UploadSession 动态上传位、选择／预览／替换／移除、上传反馈及双端校验；TaskMaterials 再验提交参数。AC-04／16、上传竞争／请求测试与 Java 集成 |
| R-04 | TaskService 短事务创建及 202，MySQL 已提交队列＋独立 TaskWorker；不等待制作、不受页面关闭影响。AC-05～07，阻塞时仍受理／未提交任务不可领取测试 |
| R-05 | TaskExecutionService／TaskStateStore／TaskStages 三步独立持久化，四任务状态、步骤边界、结果／原因；只读查询与预期状态 SQL 保护终态。任务集成与 AC-05／08／15 |
| R-06 | SimulationSettings 四项配置、提交时 JSON 快照，三个指定失败及可调延迟，失败后续不调用。AC-09～12，README 提供逐步操作 |
| R-07 | Submission 区分 pending／unknown／accepted；TaskCard 使用后端状态，query errors 独立保存并恢复。AC-05／13、cards／provider／lifecycle 测试 |
| R-08 | 按用户／任务 ID 的 TaskRegistry／查询键，共享 Provider、scope／abort 与迟到保护；终态及空闲停轮询。AC-06／08／14及前端生命周期测试 |
| R-09 | Java 个人分页历史，创建时间、步骤、成功图片或原因；刷新恢复全 active，成功图片预览。AC-07／18及历史、预览、首屏外发现测试 |
| R-10 | 真实注册登录／退出、BCrypt、Session／CSRF、服务端用户归属与他人 404。AC-03／14、认证与资源隔离测试；README 给出演示方案 |
| R-11 | 参考主要布局的深色模板网格、制作／历史分区、小屏及语义控件；原生 dialog／可见焦点／上传标签。参考图核实文件、AC-02／04／16／17和浏览器证据 |
| R-12 | push／pull_request 容器 CI，lint／独立 tsc／测试／build、真实 MySQL Java verify；核心顺序、中断及前端隔离／异常区分均有行为测试，实际版本 CI 单独核对 |
| R-13 | 完整源码、锁文件／Wrapper、SQL／种子、图片、CI、README／API／验收／运维／交付索引、验收标签与 SHA；AI 工作流、投入、来源和限制如实说明 |
| R-14 | 标准 docker compose up --build 三服务，自动初始化／资源打包、非敏感配置及两卷；AC-01／18及 P8 冷构建，不需公网部署 |

用户确认的追加内容也已落实：传统用户名密码＋注册成功自动登录；幂等；本人素材／任务／结果隔离；等待任务重启继续，执行中任务明确失败。没有用题外功能替代正文要求。

## 自动化、源码和交付检查

- 业务基线 6b24150 的[实际 CI](https://github.com/Sheepxj/Assets-Creation/actions/runs/40816662085)为 Java 102 项无失败／错误／跳过、前端 15 文件／76 项，lint／tsc／生产构建与 Java verify 全部成功。最终交付提交另按 SHA 检查 CI；不会用基线成功替代交付提交状态。矩阵见 [P7](p7-verification.md)，冷构建、代理故障修复和 P8 原始证据见 [P8](p8-verification.md)。
- P9 没有改业务源码，不为文档添加镜像实现的测试。实际新增 API 示例已在生产前端容器运行，Compose 配置与文档本地链接另行校验。
- 源码审查核对受理事务、幂等唯一键、阶段条件更新、文件复验、恢复先于领取；前端核对独立任务、终态保护、查询错误与 TaskDto 分离、身份边界取消／清缓存。源码定位和细化测试见 P4／P7，不只检查主成功路径。
- 跟踪文件排查真实令牌／私钥特征、运行上传、.env、依赖和构建目录；公开演示口令和种子 BCrypt 哈希为可演示内容。Git archive 仅导出交付提交的跟踪文件，包含隐藏 CI／Wrapper，排除 .git 和全部忽略运行文件；ZIP 内容与 SHA-256 在交付时再次核对。
- 首轮 P9 启动时一条后续命令未继承专用端口，且与未结束的启动命令交错，出现 3000 冲突／容器已被替换；已显式固定 3001，确认旧命令结束后串行重新启动，成功日志单独保留。该执行问题没有改业务代码，也未影响默认数据，不把首次失败写成首次即通过。

## 复现入口和本地证据

正常启动及完整测试用 README；真实 HTTP／失败／SIGKILL 用 [tasks.md](tasks.md) 和 compose.p3／p4；快照重建用 [containers.md](containers.md) 和 compose.p8；P9 将项目名改为 assets-creation-p9，额外加载 compose.p9.yaml，并分别指定 P3_EVIDENCE_FILE=/evidence/p9-assets.json、P4_EVIDENCE_FILE=/evidence/p9-tasks.json、P8_EVIDENCE_FILE=/evidence/p9-persistence.json。PowerShell 临时环境变量只对当前终端生效，独立进程需重新设置端口和模拟配置，不能假设上一条工具命令的环境仍在。

本地日志／截图在 .local，供当前工作区复核，不随源码 ZIP 分发：p9-start-verified.log、p9-initial-counts.txt、p9-upload-http-verified.log、p9-task-http.log、p9-{MATERIAL_CHECK,GENERATE,FINALIZE}-http.log、p9-interrupt-*.log、p9-stage-times-and-counts.txt、p9-polling-active／idle-before／idle-after.txt、p9-volume-*.log、p9-backup-restore-*.log、p9-recreated／restored-counts.txt、p9-api-example.log，以及 p9-gallery／running-reloaded／query-outage／query-recovered／history-mobile／upload-mobile／three-failure-stages／after-recreate／final-result.jpg。快照含 Cookie，SQL 备份含账号及哈希，不打印、不进入 Git／镜像／ZIP。

P9 专用运行及恢复组结束后停止，保留卷；临时浏览器标签关闭并恢复视口，默认 localhost:3000 三服务继续运行。访问日志配置只用于专用验收，正常运行入口不受影响。

## 完成范围、限制和投入

未发现未完成的原题必需功能。下列是明确接受的范围边界：单 Java 实例、预置模拟结果、内存会话；不自动续跑中断任务、不取消或重试失败任务；不提供模板后台、真实 AI、支付、视频、公网发布或高可用。

数据库与文件非分布式事务，异常崩溃可能留孤立文件或缺失文件记录，没有自动清理／配额；普通失败尽力清理，缺文件返回 404。未提交表单不跨刷新保留，已受理任务从 Java 恢复。空闲时不自动发现其他浏览器新任务，可手动刷新；查询异常暂停后需用户明确恢复。schema.sql 不是已有表迁移机制。公网生产部署、其他宿主系统／CPU 架构未验证，不将这些环境写成已通过。

首份设计提交为 2026-10-28 15:28；P9 从 2026-10-29 12:18 左右开始，至本验收记录时约 12:42 已完成业务场景及备份恢复，文档、仓库／ZIP 和 CI 收尾另计。跨度包含夜间停顿，未完整记录人工有效工时，不用一天预算冒充实际耗时。可查阶段执行窗口：P0 约 31 分钟、P1 34、P2 30、P3 27、P4 主体 31、P5 约 67，P8 累计约 50；这些是不连续的自动执行／等待窗口，含交叉复查，不能简单相加当作纯工时。最终提交和交付时间由 Git／CI 记录确认。

AI 工作流与真实修复案例、源码／图片来源见 README；没有提交私人聊天、账号或全部提示词。[交付索引](delivery.md)列出最终应提交和不应提交的材料。
