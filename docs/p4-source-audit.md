# P4 源码复核

当前基线 a8671ef 的再次源码检查及重新执行的 98 项测试见 [P4 当前源码复查](p4-current-source-review.md)。本文件保留首次复核及修复经过；其中页面完成度描述对应当时已提交版本。

日期：2026-10-28（Asia/Shanghai）。审查基线为 aee3253（首次 P4 实现），按开发计划 P4-01～P4-19 核对源码调用链、SQL、事务及测试，不以计划勾选或上次通过记录代替审查。

结论：首次实现存在一处 P4-15 关闭竞争，已经复现并修复；后端要求现已覆盖。新增测试后完整后端组为 98 项。页面上的“后续未执行”文案尚未实现，属于 P6-05；当前服务端已提供 FAILED 任务及后续 PENDING 步骤，不能据此宣称页面已完成。

## 1. 查出的缺陷与修复

**P4-15：轮询已开始，但尚未领取时关闭，仍可能领取一个新任务。**

旧代码 `TaskWorker.poll` 只在入口检查 running，随后调用 `TaskExecutionService.runNextTask`。如果线程在检查之后、领取之前被暂停，stop 将 running 设为 false 并关闭调度器，已经进入的方法仍会执行 `state.claimNext()`。该任务从本可保留的 QUEUED 变为 RUNNING，若随后被终止，重启时就会被标为中断失败。

复现测试 `TaskWorkerTest.shutdownDuringPollMustNotClaimAnotherTask` 使用两个 CountDownLatch 控制时序：轮询阻塞在持久化检查 → 另一线程启动 stop → 确认已停止运行 → 释放轮询。旧实现得到 `claimNext(): Never wanted but invoked`，3 项测试中 1 项失败，直接证明关闭后仍发生了领取调用。

修复位置：

- [TaskExecutionService](../backend/src/main/java/com/sheepxj/assets/task/TaskExecutionService.java)：增加领取入口状态和 claimLock。每次轮询先检查，持久化检查后在锁内再次检查，并在同一锁内提交领取事务。
- [TaskWorker.stop](../backend/src/main/java/com/sheepxj/assets/task/TaskWorker.java)：先关闭领取入口，再停止调度并等待当前工作；start 在恢复完成后重新开放入口。

关闭与领取共享同一个同步边界。关闭入口后，已经进入但尚未领取的轮询不能再领取；已经开始的领取事务允许提交后作为当前工作收尾。入口关闭可能先等待已进入的短领取事务完成（该事务配置 10 秒超时），随后才进入原有 10 秒等待／5 秒中断收尾窗口。

## 2. 逐项源码核对

以下“完成”指本计划 P4 末尾定义的 **Java API 后端闭环**；页面职责单独列明。

| 项目 | 源码依据及核对内容 | 结果 |
| --- | --- | --- |
| P4-01 状态模型 | [ApiContracts](../backend/src/main/java/com/sheepxj/assets/contract/ApiContracts.java) 三类枚举；[schema.sql](../database/schema.sql) 生命周期 CHECK；状态转换集中在 TaskStateStore | 完成 |
| P4-02 参数／素材 | [TaskService.create](../backend/src/main/java/com/sheepxj/assets/task/TaskService.java) 校验结构和 UUID；[TaskMaterials.validate](../backend/src/main/java/com/sheepxj/assets/task/TaskMaterials.java) 校验数量、重复、归属、模板要求、真实文件及解码 | 完成 |
| P4-03 原子受理 | TaskService 的 TransactionTemplate 同时写 tasks、task_assets、task_steps；Controller 返回 202；文件检查在事务前，不会执行到制作结束才响应 | 完成 |
| P4-04 幂等竞争 | 用户＋requestId 唯一键；有序素材指纹；先读取原记录；DuplicateKeyException 在事务回滚后处理；不同指纹 409 | 完成 |
| P4-05 排队及互斥 | [TaskMapper.xml](../backend/src/main/resources/mappers/TaskMapper.xml) 按 created_at、id 排序及 QUEUED 条件更新；Worker 单线程；执行器 AtomicBoolean 拒绝重入 | 完成 |
| P4-06 分步边界 | [TaskStateStore.claimNext／completeStage](../backend/src/main/java/com/sheepxj/assets/task/TaskStateStore.java) 领取与首步原子开始、前步成功与后步开始原子切换；执行器按枚举顺序执行三步 | 完成 |
| P4-07 素材检查 | [TaskStages.checkMaterials](../backend/src/main/java/com/sheepxj/assets/task/TaskStages.java) 重新读数据库关联及实际图片；缺失／损坏会停止后续步骤 | 完成 |
| P4-08 模拟生成 | TaskStages.generate 选择并验证模板预置图片；执行器从任务 JSON 读取延迟和指定失败，不调用外部 AI | 完成 |
| P4-09 结果整理 | TaskStages.finalizeResult 写专属结果并复验；[FileStorage](../backend/src/main/java/com/sheepxj/assets/storage/FileStorage.java) 用受控路径、临时文件及完整移动；最后步骤与任务成功在同一事务提交 | 完成 |
| P4-10 失败中止 | 执行器异常分支映射稳定错误码、日志含 ID／阶段；TaskStateStore.fail 同时写当前步骤及任务失败，后续保持 PENDING | 后端完成；界面文案待 P6-05 |
| P4-11 事务／终态 | 延迟和文件操作在状态事务外；[步骤 SQL](../backend/src/main/resources/mappers/TaskStepMapper.xml) 及任务 SQL 均校验原状态，禁止终态重开；轮询捕获异常继续，状态保存失败先处理遗留 RUNNING 再领取 | 完成 |
| P4-12 配置校验 | [SimulationSettings](../backend/src/main/java/com/sheepxj/assets/task/SimulationSettings.java) 绑定及构造校验；[application.yaml](../backend/src/main/resources/application.yaml) 的四项默认值与计划一致 | 完成 |
| P4-13 任务快照 | 创建时将四项配置序列化到任务；执行时只解析 task.simulationConfigJson，后续环境变化不覆盖旧排队任务 | 完成 |
| P4-14 启动恢复 | Worker.start 先 failRunning(SERVICE_RESTARTED)，完成后才允许领取；fail 只处理 RUNNING、保留当前阶段，不碰 QUEUED／终态 | 完成；补齐三阶段恢复测试 |
| P4-15 停止行为 | 旧入口 running 检查存在竞争，已改为共享领取锁；关闭后不新增领取，当前工作允许收尾，中断任务由重启恢复 | 本次修复后完成 |
| P4-16 个人历史 | [TaskQueryService.history](../backend/src/main/java/com/sheepxj/assets/task/TaskQueryService.java) 按 CurrentUser 过滤、分页和状态筛选；SQL 稳定倒序，DTO 使用标题快照 | 完成 |
| P4-17 active／详情 | 字面 /active 独立路由，SQL 无历史分页限制；三个步骤固定顺序；查询类只读事务，没有执行器调用 | 完成 |
| P4-18 结果读取 | query.result 先确认本人及 SUCCEEDED，再读取受控文件；[TaskController.result](../backend/src/main/java/com/sheepxj/assets/task/TaskController.java) 返回实际类型和私有预览头；未完成／失败／越权均不能读 | 完成 |
| P4-19 API 闭环 | [smoke-p4.mjs](../scripts/smoke-p4.mjs) 经真实 Next.js→Java 验证受理、三个阶段、队列、幂等、隔离、结果及无查询执行；失败与两种停止场景独立验证 | 完成 |

## 3. 本次验证及新增覆盖

源码修复后，在 `assets-creation-p4-tests` 独立数据库运行完整 Maven verify：**98 项，失败 0、错误 0、跳过 0**。实际 HTTP 项目为另一个数据库，不会消费测试夹具。

| 本次新增／加强 | 验证内容 |
| --- | --- |
| 关闭与轮询竞争 | 可控线程交错先证明旧版本失败，再证明修复后不会调用 claimNext |
| 领取入口关闭／重开 | 关闭后不读写队列；重新开放后正常领取 |
| 三个实际阶段异常 | 分别从素材检查、生成、整理抛出真实异常替身，验证错误码及停止后续调用，区别于只测指定模拟失败 |
| 三个重启中断点 | 真实 MySQL 分别推进到三阶段，恢复后此前步骤保持成功、当前步失败、后续未执行；排队快照及终态不变 |
| 迟到状态更新 | 对成功任务再次失败／再次完成均不能覆盖其终态 |

当前组数为原 P0～P3 62＋配置 3＋执行器 10＋Worker 3＋任务集成 20＝98。普通镜像构建执行 40 项，报告跳过 54 项；禁用参数化测试按方法计数，故其报告总数为 94，不能把跳过当作通过。

修复后重新构建实际后端，HTTP 成功组 7 项、三个指定失败各 1 项、SIGKILL 后恢复 3 项、正常关闭后继续执行及结果读取 1 项均通过。正常关闭另有独立 MySQL 的 SUCCEEDED／QUEUED 直接证据；重启后读取原三份和正常关闭两份成功结果，五份 PNG 哈希均与预置图片一致，不只看重启后的最终状态。默认 3000 三服务已更新修复版并保持健康；两个专用验证组完成后停止、保留卷，不修改默认用户数据。

复现关闭竞争测试（当前修复版应通过）：

```sh
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml run --rm p1-checks -Dtest=TaskWorkerTest
```

全部后端测试去掉最后的 `-Dtest=TaskWorkerTest`。原 aee3253 配合本次新增的竞争测试会得到断言失败；测试源码及本地 .local 日志可区分旧版复现、修复后的自动化与实际 HTTP，不提交 Cookie 或构建日志。

## 4. 不冒充已完成的部分

- P4-10 的“页面解释后续未执行”对应 P6-05，目前没有正式任务页面，只有正确的服务端状态数据；该页面要求仍保留在计划中。
- 多实例、执行中续跑、失败重试、取消及孤立文件自动清理仍是设计明确排除项，不因本次复核追加范围。
- 数据库与文件系统不是分布式事务；崩溃及提交结果不确定时的文件残留边界仍存在，接口只开放本人成功任务的已记录结果。

首次实现及历史测试证据见 [P4 验证记录](p4-verification.md)，运行／模拟方式见[任务说明](tasks.md)。本次审查与修复单独提交，验收版本以本次 Git 提交为准。
