# 素材制作系统

一个可独立运行的素材制作网站：浏览 Java 提供的模板，注册／登录，上传图片并提交任务；Java 在后台按顺序完成素材检查、模拟生成和结果整理，用户可继续操作、查看个人历史及预览结果。

**P0～P9 已完成。** 原题必需功能及用户确认的注册／重启方案均有实现与验收依据。生成使用预置图片，不调用真实 AI。最终范围、18 项验收与 14 项需求映射见 [验收记录](docs/acceptance.md)，交付文件与版本见 [交付索引](docs/delivery.md)。

[![CI](https://github.com/Sheepxj/Assets-Creation/actions/workflows/ci.yml/badge.svg)](https://github.com/Sheepxj/Assets-Creation/actions/workflows/ci.yml)

仓库：[Sheepxj/Assets-Creation](https://github.com/Sheepxj/Assets-Creation)。验收版本固定为标签 `delivery-2026-10-29`，可用 `git rev-parse 'delivery-2026-10-29^{commit}'` 取得完整 commit；交付消息同时列出完整 SHA 和该提交的 CI 链接。源码 ZIP 由这个提交的 Git archive 生成，不含运行数据或依赖缓存。

2026-10-29 后续审查修复了跨标签页身份同步、记录错误与空状态混显、近期任务时间排序三个问题。修复位于当前 `master`，原交付标签和 ZIP 保留历史版本；使用修复版请检出 `origin/master` 或修复提交的完整 SHA，验证范围见[修复记录](docs/audit-bugfix-verification.md)。

## 快速启动

需要 Docker 引擎和 Compose；无需宿主机 Node、Java、Maven，也无需手工建表或下载素材。在仓库根目录运行：

```sh
docker compose up --build
```

打开 [http://localhost:3000](http://localhost:3000)。可自行注册，或使用 `demo_a`／`demo_b`，密码均为 `Demo123456!`。上传示例为 `demo-assets/samples/portrait.png`、`landscape.jpg` 和 `collage.png`。首次构建需联网下载官方镜像及 npm／Maven 依赖；运行不依赖外部图片站或付费服务。

可选复制 `.env.example` 为 `.env` 修改配置，不复制也可使用本地演示默认值。

```sh
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail 80 backend
docker compose down
```

`down` 保留数据卷；不要用 `--volumes` 升级已有数据。MySQL 应用账户健康后 Java 初始化，完成遗留任务恢复后才就绪，Next.js 随后启动。只有前端公开 3000；浏览器同源 `/api` → Next.js 服务端 `http://backend:8080` → Java／MyBatis → `mysql:3306`。MySQL 与上传／结果文件分别使用 mysql-data、asset-data，生产服务不挂宿主机源码。

## 技术版本与目录

| 项目 | 固定版本 |
| --- | --- |
| Node.js／npm | 22.23.4／10.9.9 |
| Next.js／React | 16.4.3／19.3.1，App Router |
| TypeScript／ESLint | 5.9.3／9.39.4 |
| Tailwind CSS／TanStack Query | 4.3.3／5.105.0 |
| 前端测试 | Vitest 5.0.5、Testing Library 16.3.3、jest-dom 7.0.1、jsdom 30.1.3 |
| Java／Maven | Java 21／Maven Wrapper 3.9.16；运行镜像 Temurin 21.0.12_8 |
| Spring Boot／MyBatis Starter | 3.5.16／3.0.5 |
| MySQL | 8.4.13 |

前端完整依赖锁在 package-lock.json；Java 传递依赖由 Spring Boot BOM 管理，Wrapper 及镜像工具链固定。兼容依据见[设计方案](docs/superpowers/specs/2026-10-28-assets-creation-design.md)中的官方来源和已通过的构建。

```text
frontend/                 页面、身份／上传／多任务状态、同源代理及测试
backend/                  Java API、认证、三步执行／恢复、MyBatis、文件存储及测试
database/                 六表 schema.sql、幂等 seed.sql 和验证 SQL
demo-assets/              六封面、六模拟结果、三上传示例及来源／哈希
scripts/                  容器 HTTP 验证及原创图片生成器
examples/api-demo.mjs      在前端容器运行的完整 API 请求示例
docs/api.md               完整接口字段、枚举、错误、Cookie／CSRF
docs/acceptance.md         AC-01～18、R-01～14、限制与投入
docs/delivery.md           提交材料和评估顺序
docs/operations.md         固定版本启动、备份恢复与回滚
compose.yaml              Next.js／Java／MySQL 正常运行入口
compose.frontend.yaml     前端静态检查与测试容器
compose.p1.yaml            真实 MySQL 的完整 Java 测试容器
compose.p2／p3／p4.yaml    认证、上传、任务／失败／重启 HTTP 检查
compose.p8.yaml            账户、完整任务及文件持久化快照检查
compose.p9.yaml            仅验收用的无凭据访问日志，正常启动不启用
.github/workflows/ci.yml   push／pull_request 的容器化检查
.env.example              无真实凭据的本地演示配置
```

模板、素材、任务与历史业务都由 Java 提供，MySQL 保存状态；Next.js 负责界面与转发。SQL 和 15 张图片随 JAR 打包，Java 启动执行幂等初始化；不会覆盖已有用户密码、模板和个人记录。已有表不会随 schema.sql 修改自动迁移，详见[数据库说明](database/README.md)及[素材来源](demo-assets/SOURCES.md)。

## 配置

| 变量 | 默认值／用途 |
| --- | --- |
| FRONTEND_PORT | 3000，宿主机前端端口 |
| JAVA_API_URL | http://backend:8080，仅 Next.js 服务端使用 |
| MYSQL_DATABASE | assets_creation，首次空卷初始化库 |
| MYSQL_USER／MYSQL_PASSWORD | assets_app／公开本地演示口令 |
| MYSQL_ROOT_PASSWORD | 公开初始化口令，Java 不使用 root |
| DATABASE_URL／DATABASE_USERNAME／DATABASE_PASSWORD | Compose 从 MYSQL_* 组装 JDBC 配置 |
| STORAGE_ROOT | Compose 为 /app/data，保存上传与结果 |
| SESSION_TIMEOUT | 30m，会话空闲过期 |
| SESSION_COOKIE_SECURE | false，本地 HTTP；HTTPS 改 true |
| PROXY_TIMEOUT_MS | 10000，单个 HTTP 请求超时，不是任务总耗时 |
| SIM_CHECK_DELAY_MS | 2000，素材检查耗时，非负毫秒 |
| SIM_GENERATE_DELAY_MS | 8000，模拟生成耗时，非负毫秒 |
| SIM_FINALIZE_DELAY_MS | 2000，结果整理耗时，非负毫秒 |
| SIM_FAIL_STAGE | NONE／MATERIAL_CHECK／GENERATE／FINALIZE |
| SPRING_PROFILES_ACTIVE | 空；仅转发探针验收使用 smoke |

非法模拟枚举或负延迟阻止启动。数据库 utf8mb4、时间 UTC；演示容器内 JDBC 未启用 TLS，远程数据库应单独配置。真实部署需替换公开演示口令并使用 HTTPS；不要把真实配置提交 Git。已有 MySQL 卷的账户口令不会因修改初始化变量自动改变。

## 页面与演示

1. **成功制作**：进入“海岸假日”，登录后选 portrait.png，上传成功再提交；按钮结束提交态，右侧显示任务及 Java 当前步骤，成功后点击预览。默认总延迟约 12 秒，另有排队及处理开销。
2. **不同数量与多任务**：“旅行明信片”需两张、“创意拼贴”需三张。第一任务受理后点击“开始下一次制作”再提交，上一任务继续；可浏览其他页面，任务按 MySQL 顺序执行，各自状态／错误／结果独立。
3. **刷新与异常恢复**：制作中刷新“我的作品”，从 Java 恢复所有未完成任务；终态停止该任务轮询，无任务不轮询。查询网络错误保留上次状态，点击“恢复查询”或“刷新记录”恢复，不将任务改成 FAILED。
4. **用户隔离**：A 制作后退出，再登录 B；B 看不到 A 的素材、记录或结果，重新登录 A 可恢复。用户名密码注册成功自动登录；Java 内存 Session，重启后需重新登录。
5. **窄屏及键盘**：模板、上传和历史小屏可操作；上传位有独立标签。结果 dialog 支持键盘打开、Escape 关闭并恢复原按钮焦点。

### 可重复指定失败与调整耗时

先等已有任务全部结束，再在 PowerShell 配置目标阶段并重建 Java：

```powershell
$env:SIM_FAIL_STAGE = 'GENERATE'
$env:SIM_CHECK_DELAY_MS = '2000'
$env:SIM_GENERATE_DELAY_MS = '3000'
$env:SIM_FINALIZE_DELAY_MS = '2000'
docker compose up -d --force-recreate --no-deps --wait backend
```

重新登录并创建新任务：检查成功、生成失败，整理显示“未执行”，原因保存在数据库，无成功预览。将 SIM_FAIL_STAGE 分别设为 MATERIAL_CHECK／GENERATE／FINALIZE，即可重复验证三个失败点；没有随机失败。要观察更长的排队和阶段，可设 10000／20000／10000 毫秒。

每次受理保存配置快照，后续修改只影响新任务；重建会让原会话失效。演示完清除四个临时变量并恢复默认 Java：

```powershell
Remove-Item Env:SIM_CHECK_DELAY_MS,Env:SIM_GENERATE_DELAY_MS,Env:SIM_FINALIZE_DELAY_MS,Env:SIM_FAIL_STAGE -ErrorAction SilentlyContinue
docker compose up -d --force-recreate --no-deps --wait backend
```

正常停止先关闭领取入口，再等待当前工作；启动先把遗留 RUNNING 任务和当前步骤标记 FAILED／SERVICE_RESTARTED，保留失败阶段并说明“服务重启导致制作中断”。QUEUED 按原快照继续，既有成功／失败不变；不自动续跑执行中任务。操作及独立验收命令见[任务说明](docs/tasks.md)。

## 主要 API 与示例

| 接口 | 输入／结果 |
| --- | --- |
| GET /api/auth/csrf | 返回 token／headerName，并设置会话 Cookie |
| POST /api/auth/register、/login | username／password，201／200 UserDto；注册自动登录 |
| GET /api/auth/me；POST /api/auth/logout | 当前 id／username；退出为 204 |
| GET /api/templates/categories、/templates、/templates/{id} | 分类、可选 category 筛选、含素材要求的详情 |
| POST /api/assets | multipart 单字段 file；201 AssetDto，含 id／mimeType／sizeBytes／previewUrl |
| GET /api/assets/{id}/content | 本人素材真实图片 |
| POST /api/tasks | templateId／有序 assetIds／UUID requestId；202 TaskDto |
| GET /api/tasks | page／pageSize／可选 status；本人 items／total 分页 |
| GET /api/tasks/active、/tasks/{id} | 全部本人未完成任务／含三个步骤的详情 |
| GET /api/tasks/{id}/result | 仅本人成功任务的图片 |
| GET /api/health | 就绪及数据库 UP，未就绪返回 503 |

写请求先获取 CSRF 并保留 Cookie，使用返回的 headerName 携带 token；登录／注册／退出后重新获取 token。归属来自 Java 会话，不接受客户端 userId 指定。Cookie 为 HttpOnly／SameSite=Lax；凭据不写浏览器持久存储。完整协议见 [API 契约](docs/api.md)。

可直接执行[完整 API 示例](examples/api-demo.mjs)，在前端容器中用公开 demo_a 登录、上传随包图片、创建并查询任务、读取结果后退出；输出真实 DTO，不打印 Cookie／CSRF／密码。会新增一个演示素材和任务，默认成功耗时约 12 秒。PowerShell：

```powershell
Get-Content -Raw -Encoding UTF8 examples/api-demo.mjs | docker compose exec -T frontend node --input-type=module
```

实际创建接口示例（assetIds 必须替换为本次上传返回的 id）：

```json
{
  "templateId": "coastal-memory",
  "assetIds": ["上传接口返回的素材ID"],
  "requestId": "72c878cf-a8b2-47c3-b115-673efff3f568"
}
```

202 的 TaskDto 包含 id、templateId、templateTitle、status、currentStage、steps、createdAt、startedAt、finishedAt、resultUrl、errorCode、errorMessage；每个步骤包含 stage、status、开始／结束时间及错误。等待时阶段和执行时间为 null，后台可能在响应前已开始。状态为 QUEUED／RUNNING／SUCCEEDED／FAILED，阶段依次 MATERIAL_CHECK／GENERATE／FINALIZE；成功才有 resultUrl，失败保留当前阶段及原因，后续步骤保持 PENDING，界面显示“未执行”。查询只读，终态不倒退。

同用户同 requestId 和相同模板／素材顺序返回原任务；同键不同内容为 409／IDEMPOTENCY_CONFLICT。提交结果未知时只手动用原键安全重试，不自动重放 POST。请求错误结构为 `{ "code": "...", "message": "...", "fieldErrors": {} }`；401 未认证、403 CSRF、404 不存在或非本人、413 超大、415 类型不支持，502／504 是代理请求故障。后台制作失败通过成功 GET 的 FAILED TaskDto 表达，不能与请求异常混为一谈。

## 测试、构建与 CI

全部检查可在容器内执行：

```sh
# 前端，无需启动数据库。
docker compose -p assets-creation-frontend-checks -f compose.yaml -f compose.frontend.yaml run --build --rm frontend-checks

# Java 完整单元＋真实 MySQL 集成，测试库与实际后台执行器隔离。
docker compose -p assets-creation-tests -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-tests -f compose.yaml -f compose.p1.yaml run --rm p1-checks
docker compose -p assets-creation-tests -f compose.yaml -f compose.p1.yaml down

# 成品构建。
docker compose build
```

前端执行 npm ci、lint、独立 tsc --noEmit、Vitest 及生产构建；Java 使用 Wrapper verify 和 Spring Boot 打包。完整当前结果为 **Java 102 项，0 失败／错误／跳过；前端 15 文件／76 项通过**。普通 Java 镜像构建没有运行中的数据库，报告 41 执行／57 跳过，不能当作完整集成通过；专用服务和 CI 通过 RUN_DATABASE_TESTS=true 执行全组。

GitHub Actions 在 push／pull_request 自动运行独立 Node／Maven job 容器及 MySQL service，显式执行上述检查，只缓存下载，不缓存测试成功。P8 代码提交 `6b2415073bb0d5780d315eab5d24ec9fc8a74163` 的 [实际 CI 全绿](https://github.com/Sheepxj/Assets-Creation/actions/runs/40816662085)；最终交付提交也单独核对，链接随交付消息提供。配置和实际状态区别见 [CI 说明](docs/ci.md)。

P9 重新执行空卷初始化、上传边界、真实任务成功与三种失败、浏览器网络中断及恢复、轮询停止、账户隔离、强制重启、保留卷重建和成套备份恢复。场景、方法与证据范围见 [acceptance.md](docs/acceptance.md)；容器复现见 [containers.md](docs/containers.md)。

## 完成程度、限制与投入

原题 R-01～R-14 及用户追加的真实注册登录、幂等、用户隔离和队列重启设计已完成；未发现待补的原题必需功能。交付清单不包含付费服务、真实 AI、视频、支付、模板后台、取消／重试失败任务或公网部署。

已知限制：单 Java 实例；中断任务明确失败而非续跑；Session 重启失效；数据库／文件不是分布式事务，崩溃可能留孤立文件，无自动清理或配额；未提交表单不跨刷新保留；无任务时不自动发现其他浏览器新任务，可手动刷新；查询错误暂停后需明确操作恢复。已有表结构需另行迁移。未验证公网生产部署、其他系统／CPU 架构的运行效果，不宣称生产高可用。

实际设计首提交为 2026-10-28 15:28（Asia/Shanghai），开发与验收跨至 2026-10-29；中间有夜间停顿。没有完整人工计时记录，不把 Git 时间跨度或“一天预算”当成精确工时。阶段记录保留实际自动执行窗口，P8 累计约 50 分钟；P9 起止与交付时间见[最终验收](docs/acceptance.md)。

部署前固定已验证版本并备份数据库和文件卷；回滚检出上一已验证提交重新构建启动、保留卷，代码回退不等于数据回退。实际执行过的备份／恢复命令见[运维说明](docs/operations.md)。

## AI 工作流与复用来源

使用 AI 辅助开发：先读取原题，映射 R-01～R-14，与用户确认一天预算、传统注册登录及单实例方案；固化设计与 P0～P9 计划，再按阶段生成／修改代码，在隔离容器中验证并同步 Git。私有聊天、账号和提示词不作为交付材料。

具体例子：生产上传验收两次复现超限 multipart 后预览 ECONNRESET，定位为提前 413 后连接仍被复用；代理显式关闭该连接并新增回归测试，再重跑真实上传 13 项、代理 10 项及生产构建。P4 关闭竞争与 P6 迟到状态问题也有先复现、后修复的记录；不是只生成代码后勾选计划。

业务代码按本项目方案编写；主要复用 Next.js、React、Spring Boot、MyBatis 等开源依赖及 Apache 官方 Maven Wrapper 脚本，未引入第三方业务系统或 UI 模板。15 张示例图片由项目 Java 2D 生成器原创绘制，可随项目分发，SHA-256 清单随附；参考截图只用于观察布局，不分发其品牌素材。详见[素材来源](demo-assets/SOURCES.md)和[参考界面记录](docs/reference-ui.md)。
