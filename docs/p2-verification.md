# P2 注册登录与隔离验证记录

日期：2026-10-28（Asia/Shanghai）。P2-01～P2-08 已完成，P3～P9 尚未实施。

本轮约 17:32 开始，至 18:02 完成主要实现、自动化及 HTTP／重启验证，文档和 Git 收尾另计。为自动执行及等待时间，不代表人工工时。

## 1. 逐项完成依据

| 项目 | 实施 | 验证 |
| --- | --- | --- |
| P2-01 输入 | CredentialValidator，统一 strip／Locale.ROOT 小写，3～32 ASCII 用户名，密码码点／UTF-8 上限，不截断 | 单元边界及真实 BCrypt 的 ASCII、汉字、emoji 注册登录 |
| P2-02 注册 | AuthService 事务创建用户、独立 BCrypt 哈希、唯一冲突 409 | 并发同名仅一个 201，另一个 409；库内一行，密码非明文 |
| P2-03 登录与自动登录 | SessionLogin：ID 轮换、旧 CSRF 清除、新上下文显式保存 | 注册后下一请求 me；登录后下一请求；旧 Cookie 失效；切换用户 |
| P2-04 me／退出 | 最小 UserDto、注销上下文与 Session／Cookie、30 分钟空闲、关闭持久化 | 204 空体、旧会话 401、新匿名 Token 可再次登录，真实 Java 重启 401 |
| P2-05 CSRF／Cookie | HttpSessionCsrfTokenRepository、会话策略、统一 JSON 403 | JSON、multipart 写请求；旧 Token 失败／刷新成功；Cookie HttpOnly／Lax |
| P2-06 路径边界 | GET 模板／示例公开；身份入口公开；个人资源受保护 | 匿名 me／素材／结果 401 JSON，公开未实现路径 404 而非 401 |
| P2-07 归属入口 | CurrentUser、OwnedResources、带用户条件的 Mapper | A 成功；B 和伪造 userId 均 404；不存在与越权同错误 |
| P2-08 专项验证 | 41 项后端测试、10 项 HTTP、2 项重启 | 全部通过，未将跳过的测试宣称通过 |

## 2. 后端测试

运行独立项目 `assets-creation-p2` 的 MySQL 8.4.13，沿用 compose.p1.yaml 中通用 Maven 测试容器。源码只读、输出与缓存使用专用卷，未在宿主机安装或执行 Java 业务代码。

最终统计：**41 项，失败 0、错误 0、跳过 0，BUILD SUCCESS**。

| 组 | 数量 | 内容 |
| --- | --- | --- |
| InfrastructureContractTest | 6 | 原有健康、安全与 CSRF 基础回归 |
| DemoAssetsTest | 2 | 原有素材解码、哈希与目录安全回归 |
| CredentialValidatorTest | 5 | 规范化、非法名、码点／字节边界、缺失字段、密码诊断隐藏 |
| PersistenceIntegrationTest | 13 | 原有真实 SQL、约束、归属、分页、终态、初始化回归 |
| AuthIntegrationTest | 15 | 真实注册登录、会话、CSRF、并发和归属 |

认证集成覆盖：

1. 注册提交后自动登录，后续独立请求识别身份；请求 id／userId 不能决定用户 ID。
2. 演示账号正常化登录，SecurityContext 存入 Session，凭据为空、主体不含哈希。
3. 不存在用户与错误密码同一 401 响应。
4. 字段错误可理解、响应不回显密码、非法 JSON 400。
5. 72 字节 ASCII／汉字／emoji 真实 BCrypt 注册与登录成功，超限拒绝且不写用户。
6. 重复规范化用户名 409，不替换原密码。
7. 两个并发同名请求得到 201／409，数据库只有一行。
8. 登录清除旧 CSRF，旧写请求 403，新 Token 可操作。
9. 退出使上下文、Session 和 Cookie 失效，可建立新匿名会话再登录。
10. A→B 切换轮换会话，me 不再返回 A。
11. B 的错误密码不会覆盖 A 的既有登录。
12. 注册、登录、退出及 multipart 均要求 CSRF。
13. 通过真实会话及测试控制器验证资产／任务归属，伪造 userId 不绕过。
14. 两个独立用户及其中一方退出互不影响。
15. 匿名 401、公开 GET 与受保护资源路径边界。

测试控制器在 src/test，运行 JAR 不包含；真实 HTTP 也验证其路径返回 404。普通镜像构建无数据库时执行 13 项、跳过 28 项，完整通过来自设置 RUN_DATABASE_TESTS=true 的测试服务。

## 3. 实际 HTTP 与 Java 重启

在独立 3001 端口运行 Next.js、Java、MySQL。`scripts/smoke-p2.mjs` 从 Node 容器请求 Next.js，再转发 Java；使用真实 Cookie 和 CSRF，不使用 MockMvc 或身份替身。

10 项 HTTP 全部通过：

- 匿名 me 的 JSON 401，Cookie 的 HttpOnly／SameSite=Lax，本地 HTTP 无 Secure。
- 登录和注册缺少 CSRF 被拒绝。
- 注册用户名规范化，下一请求 me 成功，服务端忽略伪造身份。
- 登录轮换 Cookie，旧匿名 Cookie 不能访问当前身份。
- 认证前 Token 不再可用，刷新后 multipart 可通过。
- 实际 Tomcat 会话空闲期限为 1800 秒。
- 重名 409，错误用户名／密码同一 401。
- 两用户独立，切换轮换 Cookie，退出撤销当前会话、另一用户不受影响。
- 测试专用归属控制器没有打包进运行 JAR。

重启 Java 后额外 2 项通过：旧认证 Cookie 访问 me 为 401；重启前注册账号仍可登录，返回同一数据库用户 ID。

未等待整整 30 分钟测试自然超时；已验证实际 Session 配置、退出撤销及真实进程重启失效。30 分钟是空闲时间，请求会更新访问时间。

仅 `.local/p2-session.json` 保存专用 Cookie 快照，不进入 Git 或镜像。已按严格校验的 UUID 和 p2_http_ 名称范围移除专用 HTTP 用户，停止验证组并保留数据卷；默认开发数据未参与写入。

## 4. 发现并修正的问题

- 初轮非法 JSON 被通用异常处理器变成 500：增加 HttpMessageNotReadableException 的通用 400／INVALID_JSON 分支，不输出请求原文，回归通过。
- 不存在用户测试原先用包含连字符的 UUID 片段做用户名，实际触发格式校验：修正为合法不存在用户名，再验证统一 401；没有放宽真实用户名规则。
- 显式认证上下文保存、ChangeSessionId 和 CsrfAuthenticationStrategy 均实际运行，防止仅线程内登录或旧 CSRF 沿用。

## 5. 边界与交付

本阶段是账号后端及归属基础，不包含 P5 登录／注册页面，也不提前实现 P3 素材或 P4 制作 HTTP 接口。OwnedResources 已可供后续业务复用。

Session 在内存，不使用 JWT、Redis 或数据库会话。仅普通用户，无邮箱／短信、找回密码或角色管理。公开本地演示账号仍为 demo_a／demo_b，口令见 README。

默认环境已更新为 P2 正常 profile，仍通过三服务健康检查，smoke 探针关闭。API 与认证协议见 [认证说明](authentication.md)、[API 契约](api.md)。

提交标题 `feat: implement P2 registration and session authentication`，具体提交 ID 由交付消息与 Git 历史定位；本记录与代码、测试、计划一起提交。
