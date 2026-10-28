# P4 当前源码复查

复查时间：2026-10-28 22:39（Asia/Shanghai）。代码基线：`a8671ef21b18a52f4755aadadcbefba7908022bb`。本次检查时，`backend/`、`database/`、`scripts/smoke-p4.mjs` 及 `compose.p4.yaml` 相对该提交没有修改。工作区另有未提交的前端开发代码，本次保留原状，不将其作为 P4 已交付页面的证据。

依据：[题目说明](../题目说明.md)、[开发计划 P4](superpowers/plans/2026-10-28-assets-creation-implementation-plan.md)、Java 调用链、Mapper SQL、数据库约束和测试源码。先核对实现，再运行独立容器回归。

**结论：按计划定义的 Java API 后端闭环，P4-01～P4-19 已全部覆盖，本次没有发现新的阻断缺陷或遗漏。** P4-10 包含一句页面文案要求，计划已将它明确分配到 P6-05；后端提供失败任务及后续 PENDING 步骤，不代表后续前端阶段已经验收完成。

## 逐项核对

下表定位到实际源码与测试行为；“完成”均指 P4 的后端职责。

| 条目 | 本次核对的源码及行为 | 结论 |
| --- | --- | --- |
| P4-01 状态模型 | `ApiContracts` 的任务／阶段／步骤枚举；`schema.sql` 生命周期约束；`TaskStateStore` 保存阶段、时间、结果和原因 | 完成 |
| P4-02 提交校验 | `TaskService.create/validate` 校验 UUID 及请求结构；`TaskMaterials.validate` 校验模板、数量、重复、本人素材、真实文件、类型、大小及解码 | 完成 |
| P4-03 短事务受理 | `TaskService` 在文件校验后，通过同一个 TransactionTemplate 写任务、顺序关联、三个步骤及配置快照；Controller 返回 202，不调用执行器 | 完成 |
| P4-04 幂等 | 用户＋requestId 唯一约束；模板及有序素材的 SHA-256 指纹；重复键异常在创建事务回滚后处理；相同请求返回原任务，内容不同返回 409 | 完成 |
| P4-05 领取与互斥 | `TaskMapper.xml` 按 created_at、id 正序；领取 UPDATE 检查 QUEUED；Worker 单线程，执行器 AtomicBoolean 防重入 | 完成 |
| P4-06 三步编排 | `TaskStateStore.claimNext/completeStage` 原子持久化首步开始及相邻步骤切换；`TaskExecutionService.execute` 按三个阶段依次调用并分别保存 | 完成 |
| P4-07 素材检查 | `TaskStages.checkMaterials` 再次读取数据库关联、顺序及文件；缺失或损坏时进入失败分支，后续步骤不调用 | 完成 |
| P4-08 模拟生成 | 从任务保存的 SimulationSettings JSON 读取耗时及失败配置；`TaskStages.generate` 读取并验证模板预置图片，无真实 AI 请求 | 完成 |
| P4-09 结果整理 | `TaskStages.finalizeResult` 写任务专属文件并重新验证；最后步骤与任务成功在同一事务；结果写入失败和状态更新失败均有测试 | 完成 |
| P4-10 失败终止 | 执行器保存稳定错误码及阶段原因，日志含 ID／阶段；`TaskStateStore.fail` 原子保存任务及当前步骤 FAILED，后续保留 PENDING | 后端完成；页面职责见下文 |
| P4-11 事务与终态 | 延迟及文件操作在短事务外；任务和步骤 UPDATE 均检查原状态；终态不能重开；Worker 捕获轮询异常，下一轮先处理遗留 RUNNING，持久化失败不会伪造成功 | 完成 |
| P4-12 配置校验 | `SimulationSettings`、`TaskConfiguration`、application.yaml、Compose 和 .env.example 对应四个配置；三个失败阶段可选，负耗时及非法枚举阻止启动 | 完成 |
| P4-13 配置快照 | 受理时序列化完整配置，执行时读取任务 JSON；请求体不能指定归属或模拟配置；排队任务保持原配置 | 完成 |
| P4-14 启动恢复 | `TaskWorker.start` 先提交 SERVICE_RESTARTED 恢复，再开放领取；只处理 RUNNING，保留阶段，QUEUED 及终态保持 | 完成 |
| P4-15 正常停止 | `TaskExecutionService` 的 claimLock 将关闭入口和领取事务串行化；已有轮询在领取前再次检查；Worker 停止领取后等待当前执行，超时中断，未完成者留待恢复 | 完成；历史缺陷已修复 |
| P4-16 个人历史 | `TaskQueryService.history` 从 CurrentUser 获取身份，支持分页与状态筛选；SQL 按时间及 ID 倒序；返回标题快照 | 完成 |
| P4-17 active／详情 | `/active` 独立字面路由，返回全部本人未完成任务；详情步骤固定顺序；查询类只读事务且不调用执行器 | 完成 |
| P4-18 结果访问 | 先按本人任务查询，再检查 SUCCEEDED，最后读受控文件；返回实际图片类型、inline、no-store；越权／未完成／失败均不可读取 | 完成 |
| P4-19 API 闭环 | 核对 `smoke-p4.mjs` 的快速返回、排队、三阶段、幂等、隔离、图片、无查询执行、指定失败及两种停止验证；此前实际 HTTP 记录保留 | 完成；本次未重跑该 HTTP 组 |

## 本次重新执行的验证

使用 `assets-creation-p4-tests` 独立 Compose 项目，仅启动测试 MySQL 与 Maven 检查容器；未连接默认开发数据库或另一前端验证项目。集成测试配置关闭自身自动 Worker，通过显式执行器控制时序，避免后台消费夹具。

```sh
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml run --rm p1-checks
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml down
```

本次 Maven verify 于 22:39:21 完成：**98 项，失败 0、错误 0、跳过 0，BUILD SUCCESS**；Maven 报告耗时 26.105 秒。

| 测试组 | 实际通过数 |
| --- | --- |
| SimulationSettingsTest | 3 |
| TaskExecutionServiceTest | 10 |
| TaskWorkerTest | 3 |
| TaskIntegrationTest（真实 MySQL） | 20 |
| P0～P3 回归测试 | 62 |
| 合计 | 98 |

本次特别确认了测试并非只检查 Mapper 调用：

- 创建最后一个步骤插入失败时，任务和关联在真实 MySQL 中全部回滚。
- 最后步骤成功 UPDATE 已执行后，再拒绝任务成功 UPDATE，步骤更新仍回滚，随后保存明确失败。
- 三个指定失败点及三个实际阶段异常均停止后续调用；失败任务不妨碍下一任务。
- 三个重启中断阶段分别验证此前成功、当前失败、后续 PENDING，排队快照及原终态不变。
- 使用 CountDownLatch 控制关闭与轮询交错，关闭后不会调用 claimNext。
- 并发同键只创建一个任务；历史跨页排序稳定；active 不受历史页大小限制；其他用户不能访问任务和结果。

日志保存于被忽略的 `.local/p4-current-source-review-tests.log`，不提交运行日志及敏感会话快照。

## 历史修复与交付边界

1. **关闭竞争已在 a8671ef 修复，本次没有重复修改业务代码。** 原实现只在轮询入口检查 running，关闭可能发生在检查之后、领取之前；当前通过领取锁和二次检查封闭这一窗口。复现过程见 [上次源码复核](p4-source-audit.md)。
2. **页面属于后续阶段。** 当前工作区 `frontend/src/features/tasks/cards.tsx` 已有“失败任务＋PENDING 步骤→未执行”的文案，但它属于未提交的前端工作。本次不据此勾选 P5／P6，也不把前端轮询、查询异常恢复和浏览器交互算成已通过的 P4 验收。
3. **实际 HTTP、SIGKILL 和正常停止验证沿用既有记录。** 本次重新运行的是上述完整后端自动化；此前 HTTP 结果及图片哈希证据见 [P4 验证记录](p4-verification.md) 与 [上次源码复核](p4-source-audit.md)，不冒充本次重跑。
4. **设计限制继续保留。** 单 Java 实例；中断任务明确失败而非自动续跑；不提供取消或失败重试；文件系统与 MySQL 不是分布式事务，异常崩溃可能留下未关联文件，没有自动清理。这些已在设计／任务说明排除，不属于 P4 漏做。

本次复查不会将“P4 后端完成”扩展为“整套系统完成”。后续阶段仍按开发计划分别实施和验收。
