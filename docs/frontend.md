# 前端页面与状态管理

P5～P6 已接入真实 Java API 并完成多任务／历史／异常恢复专项。Next.js 负责页面与同源转发，业务校验、任务执行和持久化仍在 Java／MySQL。验证依据见 [P5](p5-verification.md)、[P6 记录](p6-verification.md)。

## 页面与演示

| 路径 | 内容 |
| --- | --- |
| `/` | Java 分类、模板卡片及筛选；加载、空态、错误和重试 |
| `/templates/{id}` | 模板要求、动态上传位、上传／提交反馈、当前模板制作记录 |
| `/login` | 用户名密码、字段错误、安全 returnTo、切换账户 |
| `/register` | 用户名／密码／确认密码，重名反馈，成功自动登录 |
| `/tasks` | 本人历史、状态筛选、分页、进度及成功图片预览 |

启动 `docker compose up --build` 后打开 http://localhost:3000。可注册新账户，或使用 `demo_a`／`demo_b`，密码均为 `Demo123456!`。选择“海岸假日”只需一张图片；“旅行明信片”需要两张，“创意拼贴”需要三张。可上传仓库 `demo-assets/samples/` 中的图片。

所有位上传成功才能提交。受理后按钮结束提交态，任务加入右侧记录；点击“开始下一次制作”可选下一组图片，原任务继续。导航“我的作品”查看历史，成功任务可打开图片预览，Escape 关闭并恢复按钮焦点。刷新从 Java 恢复；退出不取消后台制作。模拟结果为项目预置图片。

## 请求与身份边界

`src/lib/api/client.ts` 统一 Cookie、CSRF、JSON／multipart、10 秒超时及取消。业务请求不缓存；FormData 由浏览器生成 boundary。403 清除旧 CSRF，下一次用户操作重新获取，不自动重放写请求。

- 401／UNAUTHENTICATED：已知会话过期，取消旧请求、清理私有缓存／跟踪及表单，显示重新登录入口。
- 401／BAD_CREDENTIALS：表单显示密码错误，保留既有账户身份。
- 403、字段错误：显示服务端反馈，不冒充退出。
- 网络故障或认证结果未知：保留已知身份，暂时阻止私有写操作，提供“重新确认账户”；GET me 成功后才恢复。

`SessionStore` 在身份操作前及成功后建立请求边界，增加 scope，取消旧请求并清理 Query 缓存和 TaskRegistry。即使传输层忽略 abort，旧 scope 响应也不能发布。Creator 以模板和身份 revision 为 key，切换账户时清理素材引用与临时 URL。会话恢复和登录成功后刷新 CSRF。凭据不写 localStorage／sessionStorage。

同源标签页通过 BroadcastChannel 同步账号失效通知，不支持时退回 storage 事件。登录／注册／退出成功或结果未知会通知其他标签页；接收页立即撤销旧 scope、清理私有状态、隐藏旧身份，再从 Java 重新确认 me 和 CSRF。通知仅含固定信号，storage 退路仅保存随机标记，不保存身份、密码、Cookie 或令牌。两种浏览器通信均被禁用时可整页刷新恢复身份。

returnTo 只接受已知站内页面 `/`、`/tasks`、`/templates/{id}`，保留查询参数与 hash；拒绝外站、双斜杠、反斜杠、控制字符、数组及认证页循环。用户名和密码规则与 Java 一致，密码不截断、不 trim。

## 上传及提交生命周期

`UploadSession` 每个位独立保存文件、临时预览、状态、错误及服务端 AssetDto。依据模板的 MIME／大小要求即时校验，真实内容仍由 Java 复验。选择、替换、移除立即清除旧 assetId，取消旧请求并增加选择序号；响应还需通过序号、信号和身份 scope 检查。成功使用服务端 previewUrl，失败可重传；替换、移除和卸载释放 object URL。移除不删除服务端文件。

`Submission` 管理 idle／pending／unknown／error／accepted，与上传及后台任务分开。同步入口防重复点击，按有序 assetIds 绑定 UUID requestId。网络、超时、502／504／5xx 或不可读取的受理响应都属于结果未知：保留素材和原 requestId，显示“安全重试本次提交”，主动刷新记录。没有自动创建重试；用户手动重试仍用原键。素材改变或明确开始下一次制作时使用新键。

受理成功后立刻向共享 TasksProvider 注册任务并刷新历史。离开详情页取消未完成上传，但不丢弃已经发出的提交确认：若原账户仍有效，确认可写入共享跟踪器；身份改变会在 ApiClient 层取消并拒绝旧确认。后端任务本身不受这些浏览器请求取消影响。

## 共享任务、历史及恢复

制作记录首次查询失败时只显示错误与重试；成功确认无记录后才显示空引导，查询失败仍保留已知卡片。近期任务的 UTC 时间先补齐到九位小数秒再排序，保留微秒／纳秒精度；同一时刻按 ID 降序。历史分页继续使用 Java／MySQL 的排序。

共享 TasksProvider 和按 ID 的 TaskRegistry 在根布局存活，跨列表／详情／历史页面保持跟踪；卸载、过期、退出及切换账户时取消旧请求，不取消 Java 任务。身份确认后读取全部 active 和最近 20 条历史，active 不受历史分页限制。每个未完成 ID 约两秒查询详情，终态停止该任务、无未完成任务停止 active 间隔；焦点及重连不隐式重取。新受理任务立即恢复跟踪。

查询错误独立提示，保留最后服务端状态；单条详情暂停不影响其他任务，提供“恢复查询”。发现失败及历史刷新失败也提供手动恢复，历史已有内容不会被清空。active 中消失不等于成功，已知任务仍需详情终态。

详情、近期或分页查询发现终态后，统一更新详情缓存、失效相关历史页和近期记录，未完成数归零后无定时请求。Registry 拒绝终态及非终态阶段倒退，避免旧快照覆盖。历史以 Java 的 12 条／页分页并支持状态筛选；筛选重置页码，任务完成导致集合缩小时回到最后可用页。切换历史页不停止其他任务。

结果通过本人受保护地址预览；原生 dialog 支持标题、关闭和键盘操作，关闭恢复焦点。图片错误只提示预览失败，不修改任务成功状态。P6 完整专项及 P7 回归已通过；当前任务相关 6 文件共 26 项，另有 Creator 表单、身份、上传及请求测试。真实浏览器证据在 P6，完整回归矩阵见 [P7 记录](p7-verification.md)；P8 生产联调及重建复查见 [P8 记录](p8-verification.md)，P9 待执行。

## 布局与验证入口

深色底色、浅色面板及亮色主操作参考题目主要布局。1280px 桌面模板六列；详情制作区／记录区双栏；375px 窄屏单栏可操作。表单、上传、图标按钮均有标签，保留 focus-visible，使用原生 dialog 管理模态焦点；支持减少动效偏好。

仅运行前端检查，无需启动 Java 或 MySQL：

```sh
docker compose -p assets-creation-frontend-checks -f compose.yaml -f compose.frontend.yaml run --build --rm frontend-checks
```

检查镜像内执行 lint、tsc 及 Vitest（当前 15 文件／76 项），不安装宿主机依赖。`docker compose build frontend` 还执行以上检查和 Next.js 生产构建。测试为每次 render 建立独立生产 Providers，teardown 先卸载再清 QueryClient、最后恢复时钟与 DOM shim；资源审计确认订阅、传输及 GC 计时器回收。P8 新增代理 413 连接关闭及多 Cookie／头过滤测试；生产上传、任务、超时和浏览器重建验证见 [P8](p8-verification.md)。既有页面状态矩阵见 [P5](p5-verification.md)、[P6](p6-verification.md)、[P7 验证记录](p7-verification.md)。
