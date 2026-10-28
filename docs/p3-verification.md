# P3 模板与图片上传验证记录

日期：2026-10-28（Asia/Shanghai）。范围为 P3-01～P3-07，依赖 P1 数据与 P2 身份。P4 制作流程及 P5～P6 正式页面尚未实现。

本阶段约 19:01 开始，至 19:28 完成实现、完整后端测试、HTTP／重建验证和默认环境更新，文档及 Git 收尾另计。为自动执行与等待墙钟时间，不代表人工工时。完整 Maven 测试与打包单次耗时 3 分 38 秒。

## 1. 逐项完成依据

| 项目 | 实施 | 直接验证 |
| --- | --- | --- |
| P3-01 模板接口 | TemplateService／Controller 读取 MyBatis；分类、列表、筛选、详情及公开封面 | 真实 MySQL 中修改标题后接口立即返回新值；三分类六模板，未知分类空数组、详情不存在 404；六封面与仓库文件逐字节一致 |
| P3-02 上传校验 | ImageValidator 对声明 MIME、字节、文件头及 ImageIO 解码依次检查 | 真实 JPEG／PNG 成功；空、伪装 HTML／SVG、MIME 错配、损坏及超大被拒绝；4000 万像素资源保护在解码分配前触发 |
| P3-03 可靠存储 | FileStorage：受控根目录、服务端 UUID、临时写完再移动；AssetService：完整文件存在后短事务入库 | 路径／符号链接越界不可读；写入失败无临时文件；插入与提交抛错会移除完整文件；真实重建保持数据 |
| P3-04 DTO | id、originalFilename、真实 mimeType、sizeBytes、同源 previewUrl | DTO 不返回 userId／storagePath；新请求、重复请求、容器重建后哈希均相同 |
| P3-05 本人预览 | OwnedResources 按身份查询，文件受控读取；公开封面 | A 可读，B／伪造 userId／不存在统一 404；匿名 401；文件缺失 404；Content-Type、inline、nosniff、no-store 正确 |
| P3-06 各层限制 | Java 单文件 5 MiB、请求 6 MiB；Next.js 流式转发；统一 JSON 错误和 P5 提示协议 | 实际同源链路精确 5 MiB 成功、5 MiB+1 与 7 MiB 返回 JSON 413；非法文件反馈明确，Cookie／CSRF 正常 |
| P3-07 替换／移除 | 不提供删除 API；[上传说明](uploads.md)固定表单引用语义及 P4 再校验要求 | 当前上传与预览实现未提供删除；替换／移除交互属于 P5、制作组合校验属于 P4，未伪称本阶段已经实现 |

原题对应 R-02 模板与数据、R-03 上传及服务端验证、R-10 用户隔离。R-03 的页面上传位／替换／移除和任务提交数量校验分别由 P5、P4 完成；当前不宣称整条 R-03 已交付。

## 2. 后端构建与完整测试

在独立 assets-creation-p3 项目运行 MySQL 8.4.13，通过 compose.p1.yaml 的通用 p1-checks 服务执行 `./mvnw -B -ntp verify`；RUN_DATABASE_TESTS=true。源码只读，输出、Maven 缓存和测试存储不写入宿主源码目录。

```sh
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p1.yaml run --rm p1-checks
```

结果：**62 项，失败 0、错误 0、跳过 0，BUILD SUCCESS**。

| 测试组 | 数量 | 重点 |
| --- | --- | --- |
| InfrastructureContractTest | 6 | 健康、安全及基础 CSRF 回归 |
| DemoAssetsTest | 2 | 示例图片、哈希和目录回归 |
| CredentialValidatorTest | 5 | 密码与用户名回归 |
| PersistenceIntegrationTest | 13 | 真实 SQL、约束、个人记录及初始化回归 |
| AuthIntegrationTest | 15 | 注册登录、CSRF、并发、身份归属回归 |
| ImageValidatorTest | 6 | 真实图片、大小、文件头、损坏、像素上限、文件名 |
| FileStorageTest | 3 | 完整写入及清理、目录／符号链接边界、写入失败 |
| AssetServiceTest | 2 | 数据库插入失败和事务提交失败的文件清理 |
| AssetIntegrationTest | 10 | 真实模板、封面、落盘／MySQL、归属、非法上传、边界和缺文件 |

普通 Docker 后端镜像构建另外通过，执行 24 项，因没有数据库而明确跳过 38 项。完整通过来自上述独立 MySQL 测试，不能把镜像构建中的跳过算作通过。集成测试按事务回滚，测试文件写入专用临时目录并清理。

## 3. 真实同源 HTTP

compose.p3.yaml + scripts/smoke-p3.mjs，独立项目使用宿主 3001。Node 22 检查容器请求 Next.js，再到 Java 和真实 MySQL，使用真实 Session／CSRF。默认 profile 未启用 smoke 探针。

full 模式 **13 项全部通过**：

1. 分类、全列表、分类筛选和空列表。
2. 六个详情、数量／格式／大小要求及不存在模板的 JSON 404。
3. 六个封面真实 JPEG 和缺封面 404，逐字节与仓库文件比较。
4. 真实 PNG 上传及 DTO，伪造 userId 不影响所有者。
5. 真实 JPEG 使用误导扩展名仍按内容分类。
6. 独立与重复请求均能读取完全相同的图片，私有预览响应头正确。
7. B 访问 A、伪造查询用户与不存在记录同为 404，匿名 401。
8. 上传要求登录与 CSRF，缺 CSRF 为 403。
9. 空文件、HTML、SVG、损坏 PNG、MIME 错配的错误状态及 JSON。
10. 缺文件、多文件、错误字段名、非 multipart JSON 被拒绝。
11. 可解码 PNG 填充到精确 5 MiB，上传和预览 SHA-256 一致。
12. 5 MiB+1 与 7 MiB 请求经真实 servlet／代理返回 413／FILE_TOO_LARGE。
13. 客户端路径式文件名只保留末段元数据，不影响生成的预览路径。

本轮写入四份素材：PNG、JPEG、5 MiB PNG、路径式名称 PNG。非法图片未新增记录或文件由 AssetIntegrationTest 的前后计数断言验证；存储异常与数据库故障清理由独立故障测试验证，不依靠 HTTP 成功路径推断。

## 4. 数据卷与容器重建

保留 MySQL 与 asset-data 数据卷，使用 `up -d --force-recreate --no-deps --wait backend` **重建** Java 容器，然后运行 verify-restart 模式，**2 项通过**：

- 原会话读取个人图片返回 401，符合内存 Session 设计。
- 以 demo_a 重新登录，四份素材的地址、大小、MIME、SHA-256 均与重建前一致。

不是只验证 JVM 内对象，也没有重新上传图片。MySQL 元数据与文件卷共同保留。专用验证容器已 down，专用卷及四份素材保留；没有删除默认开发环境的数据。重复 full 会追加素材。

本地 .local/p3-assets.json 包含 Cookie 和测试证据，不提交 Git，也不进入应用构建上下文。复现完整命令见[上传说明](uploads.md)。

## 5. 默认开发环境

已用 P3 镜像更新默认服务，三个服务 healthy。实际请求结果：

- `/` 可访问，仍为基础工程首页。
- `/api/health` 为 200，database=UP。
- `/api/templates` 为 200，六模板；`/api/templates/categories` 为 200，三分类。
- `/api/_smoke/cookies` 为 404，探针默认关闭。
- 未登录 `/api/assets/unknown/content` 为 401。

入口 [http://localhost:3000](http://localhost:3000)。当前可直接查看模板 JSON；P5 后通过正式页面浏览模板、注册登录、上传和提交，P6 后查看多任务进度、历史及刷新恢复。P4 先完成后台制作闭环。

## 6. 变更与已知边界

- 复用 P1 Mapper 与 P2 CurrentUser／OwnedResources，业务仍在 Java；Next.js 本阶段无业务实现变更。
- 原认证测试原先断言尚未实现的模板路径为 404，本轮改为 200，未知封面继续为 404。
- 通用 Maven 测试服务增加临时存储目录配置，适应后端启动时的可写性检查，未放宽只读源码挂载。
- 额外的 4000 万像素限制已写入 API／设计／上传说明，P5 应显示服务端具体错误。
- 文件系统与 MySQL 不是分布式事务。普通失败会补偿清理，但崩溃、数据库提交结果不确定或清理失败仍可能留下孤立文件或缺文件记录；缺文件返回 404，清理失败记录日志。不做后台清理、配额和多实例共享存储。
- 不提供素材删除接口；已有素材不会因前端移除上传位自动删除。P4 必须重新验证模板和素材组合，本阶段不提前实现任务系统。
- 前端代码本阶段未变，沿用 P0 已通过的 lint／typecheck／构建产物；容器构建使用其缓存，没有冒充本轮重新执行前端检查。多任务核心测试、CI、成品验收仍按 P6～P9 实施。

## 7. Git 定位

代码、测试、HTTP 脚本、Compose、API／设计／计划和本记录一同提交。提交标题为 `feat: implement P3 templates and image uploads`，精确提交 ID 以交付消息和 Git 历史为准，避免自引用哈希。
