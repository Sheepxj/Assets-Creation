# 后台制作、查询与生命周期

P4 提供 Java API 的完整制作闭环。任务由 MySQL 保存并排队，由单个 Java 后台线程处理；Next.js 提供页面并转发接口。页面关闭或停止查询不取消制作。接口字段见 [API 契约](api.md)，上传及存储限制见 [上传说明](uploads.md)。P5～P6 已完成提交、连续制作、多任务／历史及查询恢复，使用方式见[前端说明](frontend.md)，逐项证据见[P6 验证](p6-verification.md)。

## 受理与幂等

登录并更新 CSRF Token 后，向 `POST /api/tasks` 提交：

```json
{
  "templateId": "travel-postcard",
  "assetIds": ["first-uploaded-asset-id", "second-uploaded-asset-id"],
  "requestId": "92d8763e-cf49-461b-96fd-155c074fd691"
}
```

assetIds 有顺序，数量必须准确，不能重复；每张素材必须属于当前用户、文件存在、元数据及真实内容满足模板格式／大小要求。重新解码文件的操作在创建事务之前完成。模板或本人资源不存在为 404；数量／重复／模板限制不符为 400／INVALID_ASSETS。requestId 必须是标准 UUID，服务端统一小写；输入字段错误为 400／VALIDATION_ERROR。客户端不能用 userId 或模拟配置字段决定归属与执行方式。

短事务一次创建 QUEUED 任务、按上传位排列的关联及三个 PENDING 步骤，并保存模板标题和模拟配置快照。全部提交后返回 202／TaskDto，不等待制作。后台可能已经开始，因此 202 中不保证仍是 QUEUED。

同一用户的 requestId 与模板及有序 assetIds 绑定，服务端保存 SHA-256 指纹。相同内容重试返回原任务，包括原终态；不同内容为 409／IDEMPOTENCY_CONFLICT。并发插入的失败事务先回滚，再读取已提交的原任务。幂等重试先查原记录，不会因为后续素材缺失而重新创建任务；只有用户明确发起新制作时才生成新键。

## 阶段与持久化

TaskWorker 在 ApplicationReady 后先恢复遗留任务，再每 300 ms 检查数据库队列。单线程固定延迟调度，TaskExecutionService 还有执行互斥，防止调度重入；只支持单后端实例。队列按 createdAt、id 正序领取。

| 边界 | 同一短事务内的变化 |
| --- | --- |
| 领取 | 条件 QUEUED→RUNNING，currentStage=MATERIAL_CHECK，同时首步 PENDING→RUNNING |
| 素材检查结束 | 首步 SUCCEEDED，GENERATE 步骤 RUNNING，任务阶段切到 GENERATE |
| 模拟生成结束 | GENERATE 步骤 SUCCEEDED，FINALIZE 步骤 RUNNING，任务阶段切到 FINALIZE |
| 结果整理结束 | 可读的独立结果文件已存在，FINALIZE 与任务同时 SUCCEEDED，保存结果路径和完成时间 |
| 失败 | 当前步骤及任务同时 FAILED，保存当前阶段、原因及完成时间；后续步骤保持 PENDING |

每次更新检查预期状态及阶段，任一影响行数不正确即回滚。所有延迟、图片解码和文件操作均在这些事务外执行。模板标题在受理时保存，历史不随之后模板标题变化。

三个实际步骤分别由 Java 执行：

1. **素材检查**：按持久化的素材顺序重新检查用户、数量、文件及真实内容。
2. **模拟生成**：选择该模板自带的预置结果，验证图片可用，不调用 AI、不真实合成上传内容。
3. **结果整理**：将图片写到数据卷 `results/{userId}/{taskId}.png|jpg`，再次验证可读及可解码，随后才提交成功状态。

先持久化阶段开始，再执行该阶段延迟及指定失败，阶段可独立观察。查询不推进阶段，不创建线程或触发制作。任务日志包含 taskId、stage 和错误码，不包含 Session 或密码。

指定失败为 SIMULATED_FAILURE，其他阶段失败分别为 MATERIAL_CHECK_FAILED、GENERATE_FAILED、FINALIZE_FAILED。状态持久化异常为 STATE_PERSISTENCE_FAILED；不在内存中假定成功。若失败状态本身暂时写不进去，下一次领取前先将无人执行的 RUNNING 记录标为失败；数据库仍不可用就继续重试持久化，不领取新任务。查询接口不可用是请求异常，不是任务失败。

## 模拟配置

| 环境变量 | 默认值 | 校验 |
| --- | --- | --- |
| SIM_CHECK_DELAY_MS | 2000 | 非负毫秒 |
| SIM_GENERATE_DELAY_MS | 8000 | 非负毫秒 |
| SIM_FINALIZE_DELAY_MS | 2000 | 非负毫秒 |
| SIM_FAIL_STAGE | NONE | NONE／MATERIAL_CHECK／GENERATE／FINALIZE |

负延迟、非法数字或失败阶段会阻止启动。零延迟可用于验证；无随机失败。每次受理保存完整 JSON：

```json
{ "checkDelayMs": 2000, "generateDelayMs": 8000, "finalizeDelayMs": 2000, "failStage": "NONE" }
```

后续执行只读取任务快照。修改环境并重建 Java 仅改变新任务；排队中的任务保留原耗时及失败设置。

演示指定失败：等已有任务全部结束，将 SIM_FAIL_STAGE 设置为目标阶段后执行 `docker compose up -d --force-recreate --no-deps --wait backend`，重新登录、上传／复用本人的素材并提交新任务。示例 PowerShell：

```powershell
$env:SIM_FAIL_STAGE = 'GENERATE'
$env:SIM_GENERATE_DELAY_MS = '3000'
docker compose up -d --force-recreate --no-deps --wait backend
```

通过任务详情可看到 MATERIAL_CHECK 成功、GENERATE 失败、FINALIZE 未执行。演示结束将变量恢复为 NONE，并恢复所需耗时后重建。Java 重建导致会话失效，必须重新登录；配置切换引起的中断与指定阶段失败是两种情况。

## 停止与恢复

正常关闭时先通过与领取事务共享的锁关闭领取入口，已进入但尚未领取的轮询必须再次检查；入口关闭可能先等待已进入的短领取事务完成（事务超时 10 秒）。随后最多等待当前任务 10 秒；之后中断执行线程，再等待最多 5 秒。关闭窗口内完成的任务保存正常终态，未完成的保持 RUNNING，下一次启动按 SERVICE_RESTARTED 恢复。容器默认短停止期限可能提前强制终止；要观察正常关闭窗口，可执行 `docker compose stop -t 25 backend`。源码复核的竞争复现及修复见 [P4 复核](p4-source-audit.md)。

开启调度前，遗留 RUNNING 任务和执行中步骤在事务内变为 FAILED，保留阶段，写“服务重启导致制作中断”。QUEUED 原样保留，随后按原快照继续；SUCCEEDED／FAILED 不变。不续跑、重试或取消已失败任务。单实例且先结束旧进程再启动新进程，不支持两个后端同时连接同一个制作队列。

## 个人查询与结果

- `GET /api/tasks?page=1&pageSize=20&status=SUCCEEDED`：本人历史，按 createdAt、id 倒序。page≥1，pageSize 为 1～100；状态可省略，非法数字／枚举返回 400／INVALID_PARAMETER，越界分页为 400／INVALID_PAGINATION。
- `GET /api/tasks/active`：本人所有 QUEUED／RUNNING，独立于历史分页，不将 active 当作任务 ID。
- `GET /api/tasks/{id}`：本人任务及固定顺序的三个步骤。历史、详情与步骤在同一个只读事务快照中读取。
- `GET /api/tasks/{id}/result`：本人 SUCCEEDED 才能读取，返回实际 PNG／JPEG、inline、nosniff、no-store。未完成、失败、缺文件或非本人均为 404。

终态不会因查询而改变。active 中消失不等于成功，P6 已通过逐任务详情获取真实终态。HTTP 暂时失败时保留 TaskDto、单独显示查询错误并提供恢复入口，不将其改成 FAILED。

## 独立容器验证

**自动化测试库与实际执行器必须隔离。** 自动化测试使用 `assets-creation-p4-tests` 项目，只启动 MySQL 和 p1-checks；实际 HTTP 使用 `assets-creation-p4` 项目，启动三服务。测试资源设置 app.worker.enabled=false，只禁止该测试上下文自己的自动调度，不能阻止另一个后端消费同一数据库队列。

```sh
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml run --rm p1-checks
docker compose -p assets-creation-p4-tests -f compose.yaml -f compose.p1.yaml down
```

HTTP 检查在 PowerShell 中启动：

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
$env:FRONTEND_PORT = '3001'
$env:SIM_CHECK_DELAY_MS = '500'
$env:SIM_GENERATE_DELAY_MS = '1500'
$env:SIM_FINALIZE_DELAY_MS = '500'
$env:SIM_FAIL_STAGE = 'NONE'
docker compose -p assets-creation-p4 -f compose.yaml -f compose.p4.yaml up --build -d --wait mysql backend frontend
docker compose -p assets-creation-p4 -f compose.yaml -f compose.p4.yaml run --rm p4-http-checks
```

full 模式验证快速受理、三步、队列、幂等、结果、用户隔离与无查询执行。先运行 full 生成 .local/p4-tasks.json，再分别切换环境中的失败阶段、重建 backend，执行：

```powershell
docker compose -p assets-creation-p4 -f compose.yaml -f compose.p4.yaml run --rm -e P4_CHECK_MODE=failure p4-http-checks
```

`prepare-restart`／`verify-restart` 用于强制终止验证：先把素材检查耗时设为 15000、另外两步为 0、失败阶段设为 MATERIAL_CHECK 后重建；prepare-restart 保存执行中和排队 ID；立即 `docker compose -p assets-creation-p4 -f compose.yaml -f compose.p4.yaml kill -s SIGKILL backend`；将全部耗时改为 0、失败设为 NONE，重建后运行 verify-restart。旧排队任务仍按旧快照在素材检查阶段发生模拟失败，终态历史不变。

`prepare-graceful`／`verify-graceful` 用于正常停止：素材检查设为 6000、其他延迟为 0、失败 NONE 后重建；prepare-graceful 保存两个任务，立即 `stop -t 25 backend`；通过 MySQL 读取快照中的两个 ID，确认分别为 SUCCEEDED、QUEUED；再重建，运行 verify-graceful 确认排队任务继续成功。不要用“重启后两个都成功”替代停止期间 QUEUED 的数据库证据。

结束后 `docker compose -p assets-creation-p4 -f compose.yaml -f compose.p4.yaml down` 保留验证卷。清除当前 PowerShell 的 FRONTEND_PORT 和四项 SIM_* 临时环境变量，避免影响默认开发环境。HTTP 每次运行会新增专用素材及任务，快照含 Cookie，均仅存 .local、不进入 Git 或镜像。实际验证结果见 [P4 记录](p4-verification.md)。

## 当前限制

MySQL 和文件系统不是分布式事务；进程崩溃或提交结果不确定可能留下未关联结果文件，接口仅开放本人成功任务已记录的结果。普通失败尽力清理，缺文件返回 404；不自动清理孤立文件。没有多实例调度、配额、任务取消、重试失败任务或执行中续跑。数据库持续不可用时不伪造成功，任务状态需要数据库恢复后保存，或重启后明确失败。
