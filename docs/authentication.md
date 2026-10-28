# 注册、登录、会话与归属

Java 认证在 P2 实现，正式登录／注册及身份生命周期在 P5 接入，详见[前端说明](frontend.md)和[P5 验证](p5-verification.md)。确认密码、安全 returnTo、恢复身份、CSRF 刷新、过期提示及用户切换清理均已实现；凭据不写浏览器 storage。网络结果未知时暂时阻止私有写操作并提供重新确认，不直接清空已知身份。

## 已实现接口

所有路径由 Java 提供，浏览器经 Next.js 同源 `/api` 访问。

| 接口 | 输入 | 成功响应 |
| --- | --- | --- |
| GET /api/auth/csrf | 无 | token、headerName、parameterName；必要时创建会话 Cookie |
| POST /api/auth/register | username、password，需 CSRF | 201，id／username，自动登录 |
| POST /api/auth/login | username、password，需 CSRF | 200，id／username，建立会话 |
| GET /api/auth/me | 会话 Cookie | 200，id／username；无效会话 401 |
| POST /api/auth/logout | 已登录、CSRF | 204 空响应，注销会话和 Cookie |

响应不含密码、哈希或角色参数。服务端生成注册用户 ID，不使用请求中的 userId／id。登录入口不限定演示账号；P1 的 `demo_a`、`demo_b` 和新注册账号都从 MySQL 查询、使用 BCrypt 验证。

## 输入与错误

- 注册与登录使用同一用户名规则：去首尾空白、Locale.ROOT 转小写，规范化后为 3～32 位英文字母、数字或下划线。
- 密码不 trim、不转换大小写；至少 8 个 Unicode 码点，UTF-8 最多 72 字节。ASCII 72 字符、24 个汉字或 18 个四字节 emoji 均已通过实际 BCrypt 注册／登录测试；超过上限拒绝，不截断。
- 密码哈希为 BCrypt cost 10、随机盐；Credentials 的诊断字符串隐藏密码，认证服务不记录凭据。非法 JSON 返回通用错误，不记录包含原文的解析异常。
- 400／VALIDATION_ERROR 含 fieldErrors；400／INVALID_JSON 表示 JSON 不可读；409／USERNAME_TAKEN 表示重名。
- 401／BAD_CREDENTIALS 表示用户名或密码不正确；不存在用户与错误密码使用相同响应，并都执行 BCrypt 匹配。
- 401／UNAUTHENTICATED 才表示访问所需的会话无效。已登录 A 时尝试错误的 B 密码，A 的会话保持不变；前端不能把 BAD_CREDENTIALS 当作全局退出。
- 403／FORBIDDEN 表示 CSRF 等请求校验失败，不代表账号密码错误或制作失败。
- 确认密码由 P5 注册表单校验，后端 Credentials 不包含该字段。

数据库唯一约束是重名的最终依据，不使用“先查询无记录”代替约束。注册事务提交后才建立会话；两个并发同名注册实际返回 201 和 409，只提交一个用户。

## 会话与 CSRF 生命周期

1. 初始获取 `/auth/csrf`，保留服务器设置的 JSESSIONID Cookie；使用返回的 headerName 在写请求头提交 Token。
2. 注册／登录成功后执行 ChangeSessionIdAuthenticationStrategy 和 CsrfAuthenticationStrategy，轮换会话 ID、清除旧 CSRF。
3. 认证上下文使用新对象，显式保存到 RequestAttribute／HttpSession SecurityContextRepository；不是仅设置当前线程变量。
4. 再次 GET `/auth/csrf` 获取新 Token，随后才能继续上传、提交或退出。旧 Token 的写请求返回 403，但不会清除已认证身份。
5. 退出调用 Spring Security 的 CSRF 与 SecurityContext 注销处理器，移除服务端会话和上下文，并发送 JSESSIONID 的 Max-Age=0 Cookie。
6. 退出后再取 Token 会建立新的匿名会话，可再次登录。

Cookie 为 HttpOnly、SameSite=Lax、Path=/；本地 HTTP 的 Secure=false，HTTPS 部署按配置设为 true。客户端不在 localStorage 保存密码或会话 ID。

默认空闲超时为 30 分钟，实际 Tomcat 会话读取值为 1800 秒。轮询等请求会刷新会话访问时间，这是空闲期限而非绝对登录期限。本次未等待完整 30 分钟；已验证配置、退出失效和真实 Java 重启失效。

`server.servlet.session.persistent=false`：会话只在 Java 内存，重启后重新登录；MySQL 用户及个人记录保留。认证主体只含 id／username，认证上下文含固定普通用户权限；CSRF Token 另存于会话，不保存密码或哈希。

参考 [Spring Security 6.5 会话持久化](https://docs.spring.io/spring-security/reference/6.5/servlet/authentication/session-management.html)、[CSRF 生命周期](https://docs.spring.io/spring-security/reference/6.5/servlet/exploits/csrf.html)、[注销处理](https://docs.spring.io/spring-security/reference/6.5/servlet/authentication/logout.html)。

## 资源归属入口

`CurrentUser.require()` 仅接受服务端已认证的 UserIdentity。`OwnedResources.requireAsset(id)`、`requireTask(id)` 在 SQL 中同时使用资源 ID 与当前用户 ID；不存在和非本人均返回 404／RESOURCE_NOT_FOUND。

P3 文件／上传接口、P4 任务接口已复用这些入口。后台执行器本身使用已持久化任务身份，不依赖浏览器线程的 CurrentUser。

P2 通过仅位于 src/test 的控制器测试实际会话与归属助手：A 访问本人成功、B 即使提交 A 的 userId 也返回 404。测试控制器不进入运行 JAR。P3／P4 随后补齐正式素材、任务及结果资源接口，并在真实 HTTP 验证用户隔离，见各阶段记录。

## 可重复容器验证

完整后端测试沿用 `compose.p1.yaml` 的共享测试服务，名称虽然保留 p1-checks，实际运行当前全部后端测试：

```sh
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p1.yaml up -d --wait mysql
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p1.yaml run --rm p1-checks
```

P2 当时为 41 项全部通过：6 基础、2 素材、5 密码规则、13 持久层、15 认证集成。当前完整后端组为 98 项，普通镜像构建执行 40 项、报告跳过 54 项；须使用专用服务设置 RUN_DATABASE_TESTS=true 才运行完整组。参数化测试禁用时按方法计数，不把跳过当作通过。

实际 Next.js → Java HTTP 验证，在 PowerShell 中设置隔离端口：

```powershell
$env:FRONTEND_PORT = '3001'
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml up --build -d --wait mysql backend frontend
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml run --rm p2-http-checks
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml restart backend
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml up -d --wait backend frontend
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml run --rm -e P2_CHECK_MODE=verify-restart p2-http-checks
```

第一组 10 项检查包括 Cookie、CSRF、会话固定防护、注册、重名、错误密码、两个用户、切换及退出；第二组验证旧会话重启失效及新账号继续登录。仅测试组启用 smoke profile，默认开发环境不启用。

重启检查需要 `.local/p2-session.json` 保存专用用户 ID 和会话 Cookie；它已被 Git 及 Docker 构建忽略，不应分享或提交。该文件的测试密码是脚本公开演示常量，不使用个人账号。

实际 HTTP 注册会提交专用测试账号，不能通过业务 API 删除（本题没有删除功能）。完成后可按本轮已执行的方法在专用库清理，避免影响后续测试的种子数量断言：

```powershell
$state = Get-Content -Raw -Encoding UTF8 .local/p2-session.json | ConvertFrom-Json
foreach ($id in $state.createdUserIds) {
  $parsed = [Guid]::Empty
  if (-not [Guid]::TryParse($id, [ref]$parsed)) { throw 'Invalid verification ID' }
  $canonical = $parsed.ToString()
  $sql = "DELETE FROM users WHERE id='$canonical' AND username REGEXP '^p2_http_[a-z0-9_]+$';"
  $sql | docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
  if ($LASTEXITCODE -ne 0) { throw 'Cleanup failed' }
}
docker compose -p assets-creation-p2 -f compose.yaml -f compose.p2.yaml down
Remove-Item Env:FRONTEND_PORT
```

仅针对本轮生成 UUID 和 p2_http_ 名称，显式指定隔离项目，不删除默认开发数据或数据卷。先运行后端测试、再运行 HTTP 组；若 HTTP 中断，应先完成专用账号清理再重新跑数量断言。
