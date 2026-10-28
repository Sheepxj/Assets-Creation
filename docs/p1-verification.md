# P1 数据库、种子与素材验证记录

日期：2026-10-28（Asia/Shanghai）。P1-01～P1-08 已完成，P2～P9 未开始。

本轮约 16:48 开始，至 17:22 完成主要构建、真实数据库测试及容器重建验证，之后为文档与 Git 收尾。时间为自动执行与等待的墙钟记录，不代表人工工时，不包含 P0。

## 1. 交付与逐项证据

| 计划项 | 实施 | 证据 |
| --- | --- | --- |
| P1-01 六类表 | schema.sql 的 users、templates、assets、tasks、task_assets、task_steps | 真实 MySQL 查询仅有六张业务表；完整初始化成功 |
| P1-02 约束 | 用户名、用户提交键、任务阶段、上传位和素材唯一；外键、状态与大小 CHECK | 真实违反约束的写入被拒绝；复合外键拒绝跨用户素材关联 |
| P1-03 索引和 UTC | 队列、历史、用户状态索引，DATETIME(6)、Java Instant | information_schema 查询确认索引顺序；微秒时间往返、会话 UTC 测试通过 |
| P1-04 六模板 | 三个分类，各两项，覆盖 1／2／3 张；MIME、大小、说明、路径完整 | MyBatis 分类／详情／筛选测试，中文及 JSON 列正确 |
| P1-05 本地素材 | 6 JPEG 封面、6 PNG 结果、3 上传示例；原创生成器及 SHA-256 | 15 张图哈希与实际格式／解码测试通过；JAR 启动验证通过 |
| P1-06 演示账号 | demo_a／demo_b，独立随机盐 BCrypt cost 10 | 两个哈希均 60 字符且不同；文档口令匹配、错误口令不匹配 |
| P1-07 可重复初始化 | Java 启动执行无破坏 DDL 和无覆盖种子 | 新专用库、已有 P0 卷升级、重复脚本及保留卷重建均通过 |
| P1-08 MyBatis | 六组 Record／Mapper／XML，JSON 处理器、枚举名称与 Instant | 分页、排序、归属、条件更新及终态保护均在真实 MySQL 验证 |

## 2. 数据与资源

数据源文件为 `database/schema.sql`、`database/seed.sql`，Java 从 classpath 顺序执行，启动失败不忽略错误；不依赖 MySQL 镜像仅首次执行的初始化目录。

实际默认数据库：2 个演示用户，6 个模板；分类 creative／portrait／travel 各 2 项；图片数量分别覆盖 1、2、3，单文件 5,242,880 字节。

素材全部是 `scripts/GenerateDemoAssets.java` 原创 Java 2D 几何图，不使用题目截图或外部照片；字节、格式、来源见 `demo-assets/manifest.sha256`、`demo-assets/SOURCES.md`。运行不下载素材；SQL 与图片随 Maven 资源进入 JAR，后端构建上下文相应调整为仓库根目录。

默认应用启动日志实际显示：`Verified demo images for 6 templates and 3 upload samples`。P1 尚未开放模板或素材 HTTP 接口，预置数据和图片可用于 P3 实现。

## 3. 测试与构建

容器内执行：

```sh
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml run --rm p1-checks
```

最终结果：**21 项，失败 0、错误 0、跳过 0，BUILD SUCCESS**。

- InfrastructureContractTest：6 项基础行为测试。
- DemoAssetsTest：2 项，校验 15 个唯一素材路径、SHA-256、JPEG／PNG 真正解码和路径越界拒绝。
- PersistenceIntegrationTest：13 项，真实 MySQL 8.4.13，不是 H2 或 Mapper 替身。

13 项数据库测试：

1. 六模板、三分类、图片数量、JSON MIME、图片资源和不存在模板。
2. 两个 BCrypt 哈希与开发口令真实匹配。
3. 用户写入、唯一用户名与 UTC 微秒往返。
4. 素材按用户筛选，空 ID 列表不会误读全部记录。
5. 任务 JSON、枚举、UTC 微秒时间及 ISO 8601 序列化、本人查询。
6. requestId 对同一用户唯一，不限制不同用户使用相同键。
7. 个人分页、数量、状态筛选、历史倒序及队列正序。
8. 预期状态与阶段条件更新；终态无法重新打开。
9. 素材上传位顺序、重复位／素材拒绝、跨用户关联拒绝。
10. 步骤枚举和顺序、阶段唯一、条件更新及步骤终态。
11. 真正外键／CHECK 拒绝、任务索引与六表完整性。
12. 重放种子不覆盖修改过的哈希、模板或个人记录。
13. 重放完整 DDL／种子保留已提交的用户和排队任务。

独立测试源码只读；构建输出 `/build`、Maven 缓存均为专用卷，不在宿主机安装 Java 依赖。事务测试回滚，提交型测试显式清理夹具。

后端镜像构建通过：没有数据库时执行 8 项基础／图片测试并明确跳过 13 项数据库测试。完整测试结果来自上述 RUN_DATABASE_TESTS=true 的专用容器，不把跳过算成通过。P1 未修改前端实现，因此不重复宣称执行新的前端业务测试；P8 CI 尚待实施。

## 4. 保留数据卷重建验证

在专用 `assets-creation-p1` 库提交 fixture：1 用户、1 素材、1 QUEUED 任务、1 素材关联、3 个 PENDING 步骤。夹具文件与正式 seed.sql 分开，不进入应用 JAR。

执行顺序：

1. 通过容器内 mysql 执行 `database/p1-restart-fixture.sql`。
2. 执行只读 `database/p1-restart-check.sql`，保存字段快照。
3. `docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml down`，不使用 --volumes。
4. 以同一配置 `up -d --wait mysql backend`，创建新的 MySQL 和 Java 容器，挂载保留卷，自动再执行 schema／seed。
5. 再取快照，用户、哈希指纹、素材、任务状态、JSON、关联、三个步骤、微秒时间与模板数逐项完全一致。
6. 执行只针对固定夹具 ID 的 `p1-restart-cleanup.sql`，停止专用组，保留验证数据卷及缓存。

实际输出：`PASS: recreated MySQL/Java containers preserve committed user, hash, asset, queued task, relation, three steps and UTC timestamps.`

这是 P1 的初始化及持久化验证，不代表已经实现 P4 的 RUNNING 任务中断回收或后台执行。元数据夹具不声称真实上传图片已经实现；默认开发库未插入验证用户或任务。

## 5. 问题及修正

- P0 数据库卷已存在，仅靠 MySQL 首次初始化不能升级：改为 Java 的幂等 SQL 初始化，已实测现有卷可用。
- 最初在只读源码挂载内嵌可写 target 卷时，Docker 无法创建不存在的挂载目录：改用 Maven 可配置输出目录 `/build`，源码继续只读。
- MySQL 正确触发 CHECK，但 Spring 将 HY000／3819 包装成 UncategorizedSQLException：测试改为验证真实 SQLException 错误码 3819 和原状态未变，没有放宽数据库约束。
- Mapper 审查补充终态硬保护，防止调用者误传 SUCCEEDED／FAILED 预期状态时重新打开任务或步骤，并增加实际回归断言。
- Windows PowerShell 的 Java `-D` 参数需要整体加引号；生成器已在固定容器中实际执行成功。

## 6. 限制与下一阶段

`CREATE TABLE IF NOT EXISTS` 不迁移已有表；种子不覆盖已有行。结构变更需要显式迁移，不删除用户卷。P1 只初始化两个演示账号，真实注册／登录及会话归属处理是下一阶段 P2。

六个模板的 HTTP 查询、真实上传、制作提交、三个异步步骤和前端业务仍待后续阶段。本次没有将种子账号、数据库夹具或探针当作业务实现。

源码、SQL、图片、类型映射、测试及文档一起提交，提交标题为 `feat: add P1 persistence and demo assets`；精确提交 ID 由本轮交付消息及 Git 历史定位。
