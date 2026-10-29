# P7 自动化测试与行为回归

日期：2026-10-29（Asia/Shanghai）。基线为 P6 提交 `d855d28`。范围为开发计划 P7-01～P7-05、BE-01～BE-14、FE-01～FE-11。此次未修改业务代码；补齐关键集成断言及测试资源回收，全部安装、测试、构建均在容器中执行。

**最终结果：Java 101 项、前端 74 项全部通过；前端 lint／独立类型检查／生产构建、Maven verify／Spring Boot 打包均成功。P7 五项退出检查全部完成，P8～P9 仍待执行。**

## 1. 新增与加强

- 后端增加三项真实 MySQL 集成测试：执行器被闩锁阻塞时仍能受理另一任务；创建事务最后一个步骤尚未插入时不能领取半成品；成功／失败详情、历史、active 和结果查询均不写任务或步骤状态。
- 阻塞执行测试同时检查另一任务仍 QUEUED、执行入口不可重入、首任务完成后才领取下一任务及开始／结束时间顺序。不用耗时猜测异步行为。
- 前端增加四项真实 Creator 组件测试：上传／提交按钮禁用、受理后结束提交态并连续制作、替换移除竞争、结果未知的同键手动重试、离开详情后确认仍加入共享跟踪。
- 增加普通成功任务与另一 RUNNING 任务的阶段／结果独立测试，以及查询测试环境的取消、GC 定时器和订阅回收测试。
- 完整组从 P6 的后端 98／前端 68，增加到 **101／74**；原有核心测试继续运行，未删除或跳过失败用例。

## 2. 后端 BE 清单

测试源位于 [task](../backend/src/test/java/com/sheepxj/assets/task/)、[auth](../backend/src/test/java/com/sheepxj/assets/auth/)、[asset](../backend/src/test/java/com/sheepxj/assets/asset/)。下列每行均经本次完整组验证通过，不以历史 HTTP 演示替代本次自动化。

| ID | 源码依据与实际断言 | 结果 |
| --- | --- | --- |
| BE-01 | TaskExecutionServiceTest.stagesRunInOrderWithIndependentPersistentBoundaries 验证调用顺序及每步一次；TaskIntegrationTest.successfulStepsAreObservableOutsideTransactionsAndResultIsPrivate 验证三步可观察、真实图片字节及成功状态 | 通过 |
| BE-02 | specifiedFailureStopsAllLaterStages 的 MATERIAL_CHECK 分支不调用生成／整理；everySpecifiedFailureStopsLaterStepsAndAllowsTheNextTask 保存当前阶段、原因及后续 PENDING；缺失／损坏真实素材测试补充实际异常 | 通过 |
| BE-03 | 上述 GENERATE 参数分支验证前一步完成、后一步不调用；集成读取失败阶段、原因、步骤和空结果 | 通过 |
| BE-04 | FINALIZE 参数分支及 resultWriteFailureCannotProduceSuccess；前两步成功，整理失败且无结果地址；最终事务故障还验证步骤回滚 | 通过 |
| BE-05 | 新增 blockedExecutionDoesNotBlockAcceptanceAndQueueOrderIsStable、workerCannotClaimAnUncommittedPartialSubmission：未释放闩锁仍返回 202，未提交的 tasks 行不可见且执行器领取不到，提交后可完整执行 | 通过 |
| BE-06 | acceptanceIsAtomicQueuedAndQueriesNeverDriveExecution 检查只读 QUEUED；新增 terminalHistoryAndResultQueriesNeverWriteTaskOrStepState，成功／失败 DTO 恒定，Mapper.transition 和 Delay 均未调用 | 通过 |
| BE-07 | 阻塞执行集成测试验证首任务 RUNNING 时另一条 QUEUED，第二次执行入口不能重入；释放后首条成功，下一条才开始且时间不早于首条完成 | 通过 |
| BE-08 | sameRequestReturnsOriginalTerminalTaskAndDifferentOrderConflicts、concurrentIdenticalRequestsCreateExactlyOneCommittedTask：同键同内容原 ID，顺序不同 409，并发仅一条 | 通过 |
| BE-09 | invalidSubmissionsNeverCreatePartialTasks、stricterTemplateRequirementsAreRecheckedAtSubmission、跨用户素材提交及缺文件测试：数量、重复、模板、素材、归属及模板限制均检查，非法请求无半成品 | 通过 |
| BE-10 | recoveryFailsRunningOnlyAndQueuedKeepsItsOriginalSnapshot 对三个阶段参数化；此前成功／当前失败／后续 PENDING，排队继续用旧快照、原终态不变；TaskWorkerTest 检查恢复先于领取 | 通过 |
| BE-11 | SimulationSettingsTest 绑定、零延迟、三个负值及非法失败阶段；执行器独立验证 11／22／33 延迟和三个失败点；恢复测试中的存储快照优先于当前 NONE 设置 | 通过 |
| BE-12 | AuthIntegrationTest.registrationCommitsHashAutoLogsInAndIgnoresClientIdentity、duplicateNormalizedUsernameReturnsConflictWithoutReplacingTheUser、并发注册及 logoutInvalidatesContextSessionCookieAndAllowsFreshLogin | 通过 |
| BE-13 | TaskIntegrationTest 本人成功结果与 B 越权 404；AssetIntegrationTest.ownershipUsesTheSessionEvenWithForgedFormAndQueryUserIds；认证与真实上传测试验证缺会话／CSRF 拒绝，不能用请求 userId 决定归属 | 通过 |
| BE-14 | AssetIntegrationTest 的真实 JPEG／PNG、精确 5 MiB、超限、伪装／损坏／空文件、文件缺失、类型头；ImageValidatorTest 检查真实内容、尺寸及解码；FileStorageTest 检查受控路径 | 通过 |

使用真实 MySQL 8.4，不以 H2 推断 SQL 或事务。测试关闭自身自动 worker，通过明确执行器和闩锁控制时序；没有另一个应用 Worker 连接该库。

## 3. 前端 FE 清单

测试源在 [features](../frontend/src/features/)，使用真实根 Providers／ApiClient／TanStack Query 和受控网络。请求替身验证客户端行为；图片内容、数据库及文件真实性由上述 Java 测试负责。

| ID | 本次实际断言 | 结果 |
| --- | --- | --- |
| FE-01 | lifecycle.test.tsx 新增成功 A 与运行 B 独立：A 图片始终为自身 resultUrl，B 从素材检查到结果整理，只有 B 继续请求，未完成数为 1 | 通过 |
| FE-02 | lifecycle 的任务 A 失败原因只出现在 A，B 仍制作中并随后成功；registry／cards 补充状态隔离 | 通过 |
| FE-03 | provider 的单条 503 与 lifecycle 的真实 ApiClient 10 秒超时路径都保留原状态；错误请求不会创造 FAILED，只有服务器返回 FAILED 才显示制作失败 | 通过 |
| FE-04 | 单条暂停时另一条继续；“恢复查询”读取真实终态；history 刷新失败保留旧数据，明确重试后恢复 | 通过 |
| FE-05 | provider／lifecycle 假时钟验证分别停止终态任务、最后完成后 active／详情无定时请求；焦点／重连不隐式重取；新受理从空闲重新启动 | 通过 |
| FE-06 | lifecycle 切换账户中止旧 signal，传输忽略取消仍不能发布 A；history 检查 B 新键、旧键无数据／请求／观察者，页码／筛选重置 | 通过 |
| FE-07 | lifecycle 卸载后中止在途请求、额外 8 秒无请求、重挂恢复；新增 creation 离开详情而根布局仍在时迟到受理确认不丢失；resources 检查清理定时器 | 通过 |
| FE-08 | upload-session 的替换／移除／无效替换序号与 assetId 测试；新增 creation 通过真实文件输入替换、旧请求取消且迟到不回填，移除后按钮禁用且不能 POST | 通过 |
| FE-09 | 新增 creation 集成：某位仍上传时按钮禁用，全部成功才启用；POST 中按钮和上传位禁用，重复点击仅一次请求；202 后退出提交态、出现任务，清空新表单不丢旧任务 | 通过 |
| FE-10 | submission 的网络／502／504 复用原键、修改素材新键及迟到确认；新增 creation 在实际网络拒绝后保留两文件，点击安全重试的完整 payload 与原请求相同 | 通过 |
| FE-11 | lifecycle 恢复 20 条近期之外的旧 active；history 验证 26 条三页、翻页期间其他任务继续跟踪，终态及筛选总数变化正确同步 | 通过 |

## 4. 资源清理检查

1. **前端缓存和定时器**：renderApp 使用生产 Providers，捕获其测试专用 QueryClient。全局 teardown 先卸载，再 clear 缓存；Vitest hooks 明确 list 顺序，随后才恢复假时钟和 DOM shim。独立 gallery 的 QueryClient 也纳入回收。
2. **可运行的清理断言**：resources.test.tsx 使用真实 Query 订阅、2 秒轮询、挂起传输和默认 GC；卸载中止 signal，清理后缓存空、假时钟计数为 0，额外推进 10 秒也不新增请求或定时器。没有用 clearAllTimers 隐藏轮询泄漏。
3. **线程**：TaskWorkerTest 每项结束检查不存在存活的 asset-task-worker；自建虚拟线程 Executor 使用 try-with-resources，闩锁在 finally 释放，future 有明确超时和结束确认。
4. **连接池**：四个数据库集成测试类在 AFTER_CLASS 关闭 Spring 测试上下文；日志显示 HikariPool-1～4 全部 Shutdown completed。TaskIntegrationTest 每项清理后还检查 activeConnections=0。手动取得的连接在 finally 中 release，文件遍历流使用 try-with-resources。
5. **测试数据**：完整回归后直接 SQL 验证仅剩 users=2、templates=6；assets／tasks／task_assets／task_steps 全为 0。上传／任务测试目录由各测试回收，其余容器临时目录随检查容器移除；不污染宿主机依赖和默认数据库。

未通过延长任意 sleep 修复不稳定测试。后端新增竞争测试使用 CountDownLatch；前端轮询使用假时钟及通知队列推进，保留每文件 jsdom 隔离。

## 5. 命令与最终结果

```sh
docker compose -p assets-creation-p7-tests -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p7-tests -f compose.yaml -f compose.p1.yaml run --rm p1-checks
docker compose -p assets-creation-p7-frontend -f compose.yaml -f compose.frontend.yaml run --build --rm frontend-checks
docker compose build frontend
docker compose -p assets-creation-p7-tests -f compose.yaml -f compose.p1.yaml down
docker compose -p assets-creation-p7-frontend -f compose.yaml -f compose.frontend.yaml down
```

Java 专用服务显式设置 RUN_DATABASE_TESTS=true；普通后端镜像构建不运行这些数据库集成测试，不能把 skip 当作通过。

| 检查 | 本次结果 |
| --- | --- |
| Java 单元＋真实 MySQL 集成＋verify／打包 | **101 项，0 失败、0 错误、0 跳过，BUILD SUCCESS** |
| 前端 lint／独立 tsc | 通过 |
| 前端行为测试 | **14 文件，74 项全部通过** |
| Next.js 生产构建 | 通过；构建流程再次执行上述 74 项及静态检查 |
| 资源及数据库残留 | 上述断言通过，四池关闭，专用库仅保留种子 |
| 打包文件 | 实际 Spring Boot JAR 非空，包含 TaskWorker.class、schema.sql、seed.sql、素材 manifest.sha256 |

完整 Java 最终 verify 耗时 53.845 秒；前端检查中的测试 8.32 秒，生产构建中的测试 5.33 秒。这是命令时间，不代表人工工时；首次后端独立缓存还包含依赖准备。

## 6. 失败记录与未验证边界

- **已修复的测试失败**：首轮 Java 101 项有 1 项错误。新增事务闩锁夹具对 MyBatis 接口代理调用 callRealMethod，Mockito 报抽象方法不可调用，创建返回 500；改为 SqlSessionTemplate 执行同一真实 MyBatis insert 映射，保持事务和闩锁断言不变。修正后完整 101 项重跑通过，没有修改业务逻辑或弱化断言。
- **当前必需项无未通过检查**：P7-01～05、BE／FE 矩阵与构建全部有本次结果。日志在忽略的 `.local/p7-backend-verify-initial.log`、`p7-backend-verify.log`、`p7-frontend-checks.log`、`p7-frontend-build.log`、`p7-database-cleanup.txt`，不提交会话或构建缓存。
- **本阶段未重新执行**：P4～P6 真实 HTTP／浏览器／SIGKILL 演示沿用各阶段历史记录，不冒充本次重跑；业务代码未变，P7 当前结果来自自动化和构建。
- **仍待 P8／P9**：GitHub Actions 尚未配置／运行，完整冷启动及最终交付验收未在本阶段宣布完成。专用验证服务结束后停止并保留卷，默认应用继续运行。
