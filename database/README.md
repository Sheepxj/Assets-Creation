# 数据库与初始化

## 初始化入口

`schema.sql` 与 `seed.sql` 是唯一源文件。Maven 将它们从本目录复制到 JAR 的 `database/` 资源；Java 通过 Spring Boot 的 SQL 初始化按顺序执行。`spring.sql.init.mode=always`，脚本缺失或执行失败会阻止正常启动。

没有同时使用 MySQL `/docker-entrypoint-initdb.d` 或 Flyway，避免重复机制。这样 P0 已存在的空业务数据库也能升级，无需删除卷。参见 [Spring Boot 初始化说明](https://docs.spring.io/spring-boot/how-to/data-initialization.html)。

- `CREATE TABLE IF NOT EXISTS` 只创建缺失表，不 drop、不 truncate，也不变更已有表结构。
- 种子使用唯一键与无操作的 duplicate-key 更新，不覆盖已有密码、模板内容、个人素材和任务。
- 新增种子 ID 会补充记录；已有 ID 或用户名保持原记录，不重置密码。
- 改动建表脚本不会自动迁移既有表。后续结构变更必须另写经过评审的迁移步骤，不靠删卷完成升级。
- P1 不插入历史任务或用户素材；只有两个演示账号和六个模板。个人记录由后续制作流程产生。

## 六张表

| 表 | 内容及关键约束 |
| --- | --- |
| users | UUID、规范化用户名、BCrypt 哈希、UTC 创建时间；用户名唯一 |
| templates | 分类 ID／标题、名称／描述、相对封面和结果路径、图片数量、JSON MIME 列表、大小限制 |
| assets | 用户归属、原文件名、实际 MIME、大小、受控存储路径、时间；JPEG／PNG、最大 5 MiB |
| tasks | 归属、模板及标题快照、requestId 与负载指纹、状态阶段、JSON 模拟快照、执行时间、结果和原因 |
| task_assets | 图片顺序，零起始 slot_index；同任务同上传位和同素材都唯一；复合外键保证任务及素材属于同一用户 |
| task_steps | 每任务每阶段唯一，阶段与步骤状态、开始结束时间、错误；任务外键 |

所有表使用 InnoDB、utf8mb4；UUID、规范化用户名和枚举使用明确的 ASCII 二进制比较。用户名转小写和输入规则由 P2 完成。时间使用 DATETIME(6)，Java 使用 Instant，JDBC 时区 UTC；测试验证微秒时间往返。

任务及步骤 CHECK 约束防止成功但无结果、等待中已有完成时间等矛盾状态。更新状态时必须同时维护关联字段。约束不替代 P4 的执行顺序和终态保护。

## 索引与映射

- `idx_tasks_queue(status, created_at, id)`：按创建顺序领取等待任务。
- `idx_tasks_user_history(user_id, created_at, id)`：个人历史稳定倒序分页。
- `idx_tasks_user_status(user_id, status, created_at, id)`：个人未完成与状态筛选。
- `uq_tasks_user_request(user_id, request_id)`：同用户提交幂等；request_fingerprint 由 Java 在 P4 生成，客户端不提供。
- task_assets 的复合外键分别指向 tasks(id,user_id)、assets(id,user_id)，避免跨用户关联。

MyBatis Mapper 和 XML 在 `backend/src/main/.../persistence/` 及 `resources/mappers/`。Record 按构造参数名映射；JSON MIME 列表使用 StringListJsonTypeHandler；枚举按名称存储，不使用 ordinal；Instant 使用 MyBatis 内置时间处理器。分页 limit／offset 和用户条件均通过参数绑定。

任务条件更新同时匹配预期 status 与 current_stage（NULL 安全比较），步骤更新匹配预期步骤状态；SQL 额外禁止重新打开成功或失败的终态。Mapper 只是持久层；P4 服务仍要验证允许的阶段顺序和转换，P2／P3／P4 服务仍要验证身份与输入。

## 数据与演示账号

本地演示账号 `demo_a`、`demo_b`，口令均为 `Demo123456!`。数据库只保存独立随机盐的 BCrypt cost 10 哈希，真实匹配由集成测试校验；不要将这些公开演示账号用于外部生产环境。

P1 初始化账号数据，P2 已实现注册登录接口，支持独立注册新账号，不限定只能使用演示账号；具体协议见 [认证说明](../docs/authentication.md)。

六个模板、三个分类，每分类两项：旅行明信片（2 张）、海岸假日（1 张）、光影肖像（1 张）、双人合影（2 张）、创意拼贴（3 张）、四季贺卡（3 张）。全部接受 JPEG／PNG，最大 5 MiB。来源及重生成见 [素材说明](../demo-assets/SOURCES.md)。

## 检查命令

正常启动：`docker compose up --build`。只读汇总 SQL 见 `verify.sql`。

PowerShell 中可执行：

```powershell
Get-Content -Raw -Encoding UTF8 database/verify.sql | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" "$MYSQL_DATABASE" --batch --raw'
```

独立真实 MySQL 测试：

```sh
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml run --rm p1-checks
docker compose -p assets-creation-p1 -f compose.yaml -f compose.p1.yaml down
```

该配置用只读源码挂载、独立 Maven 缓存与构建输出卷，RUN_DATABASE_TESTS=true 运行当前全部后端测试，现包含 PersistenceIntegrationTest 和 AuthIntegrationTest。默认镜像构建没有数据库服务，明确跳过这两组并执行基础及输入／图片测试；不能把跳过说成通过。后续 CI 需启用真实数据库测试开关。

`down` 保留数据卷，不删除默认开发项目的数据。实际执行结果及重启保持验证见 [P1 验证记录](../docs/p1-verification.md)。
