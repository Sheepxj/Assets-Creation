# API 契约

## 1. 范围与实现状态

本文是 P0 固定的前后端契约。业务由 Java 提供，浏览器通过 Next.js 同源 `/api` 转发访问。

P0～P6 已实现基础工程、Java 业务 API、正式页面及多任务／历史／恢复，浏览器接入同源接口。认证用法见[认证说明](authentication.md)，图片限制及存储见[上传说明](uploads.md)，后台行为及模拟／重启演示见[任务说明](tasks.md)，页面及状态边界见[前端说明](frontend.md)。P6 逐项证据见[验证记录](p6-verification.md)。

## 2. 通用约定

- ID 为不透明字符串，不转换为 JavaScript number。requestId 是一次明确提交对应的 UUID。
- JSON 使用 UTF-8、camelCase。时间使用 ISO 8601 UTC，例如 `2026-10-28T08:00:00Z`。
- 图片 URL 为同源相对地址，不能包含 `backend:8080` 或磁盘路径。
- 无值的阶段、时间、结果、错误字段返回 null；空列表返回数组，不返回 null。
- 历史分页从 1 开始，pageSize 默认 20、范围 1～100；非法参数返回 400。
- 历史按 createdAt、id 倒序。分类、模板和 active 返回数组，只有历史返回分页结构。
- HTTP 失败表示请求失败；任务执行失败由成功查询返回的 TaskDto 表达。
- 业务请求不缓存；P0 转发默认 `Cache-Control: no-store`。

统一错误：

```json
{
  "code": "VALIDATION_ERROR",
  "message": "请检查输入内容",
  "fieldErrors": { "username": "用户名格式不正确" }
}
```

无字段错误时 fieldErrors 为 `{}`。400 参数错误，401 未登录，403 CSRF 校验失败，404 不存在或不属于本人，409 唯一性／幂等冲突，413 过大，415 类型不支持，500 未预期错误，502 Java 无法连接，503 服务依赖不可用，504 同源转发超时。

## 3. 身份与 CSRF

Java 维护 Cookie 会话，默认 JSESSIONID、HttpOnly、SameSite=Lax、30 分钟空闲过期；HTTPS 部署启用 Secure。前端不在 localStorage 保存密码或会话 ID。

先 `GET /api/auth/csrf` 获取 Cookie 和 Token，写请求通过返回的 headerName 携带 token。JSON 与 multipart 均需 CSRF；FormData 的 Content-Type 由浏览器生成。注册、登录和退出后重新获取 Token。401／UNAUTHENTICATED 引导登录，BAD_CREDENTIALS 只作为表单错误，网络错误保留既有身份和任务。Java 重启后需要重新登录。

```json
{ "token": "opaque-csrf-token", "headerName": "X-CSRF-TOKEN", "parameterName": "_csrf" }
```

| 方法／路径 | 身份及输入 | 成功响应 | 阶段 |
| --- | --- | --- | --- |
| GET /api/health | 公开 | 200，服务及 MySQL 状态 | P0 |
| GET /api/auth/csrf | 公开 | 200，CsrfDto，必要时设置 Cookie | P0 |
| POST /api/auth/register | 公开，需 CSRF；Credentials | 201，UserDto，自动登录 | P2 |
| POST /api/auth/login | 公开，需 CSRF；Credentials | 200，UserDto，建立会话 | P2 |
| POST /api/auth/logout | 登录，需 CSRF | 204，无响应体 | P2 |
| GET /api/auth/me | 登录 | 200，UserDto；未登录 401 | P2 |

P8 加强就绪语义：启动恢复尚未完成或应用停止接流时，health 返回 503／SERVICE_NOT_READY；进入 Spring Boot ACCEPTING_TRAFFIC 后才检查数据库并返回 UP。数据库不可用为 503／DATABASE_UNAVAILABLE。响应不包含连接地址或凭据。就绪事件顺序依据 [Spring Boot 3.5 官方说明](https://docs.spring.io/spring-boot/3.5/reference/features/spring-application.html)。

Credentials：`{ "username": "demo_a", "password": "example-password" }`。

UserDto：`{ "id": "user-id", "username": "demo_a" }`，不返回密码哈希。

用户名去首尾空白并转小写，3～32 位英文字母、数字和下划线。密码不 trim，至少 8 个 Unicode 码点、UTF-8 不超过 72 字节。确认密码只在注册表单校验，不进入 Credentials。重名 409／USERNAME_TAKEN，用户名或密码错误统一 401／BAD_CREDENTIALS；会话无效是 401／UNAUTHENTICATED，非法 JSON 为 400／INVALID_JSON。

健康响应：

```json
{ "status": "UP", "service": "assets-creation-api", "database": "UP" }
```

健康检查通过 MyBatis 实际执行 SELECT 1；数据库不可用返回 503。Next.js 自身使用 `GET /health` 检查进程。

## 4. 模板

| 方法／路径 | 输入 | 成功响应 | 阶段 |
| --- | --- | --- | --- |
| GET /api/templates/categories | 无 | 200，CategoryDto[] | P3 |
| GET /api/templates | 可选 category，使用分类 ID | 200，TemplateDto[] | P3 |
| GET /api/templates/{id} | 模板 ID | 200，TemplateDto；不存在 404 | P3 |
| GET /api/demo/covers/{filename} | 受限封面文件名，公开 | 200，JPEG／PNG；不存在 404 | P3 |

CategoryDto：`{ "id": "travel", "title": "旅行风景" }`。

```json
{
  "id": "travel-postcard",
  "title": "旅行明信片",
  "category": "travel",
  "coverUrl": "/api/demo/covers/travel-postcard.jpg",
  "description": "上传两张图片，模拟生成一张明信片",
  "requiredImageCount": 2,
  "acceptedMimeTypes": ["image/jpeg", "image/png"],
  "maxFileSizeBytes": 5242880
}
```

以上为使用 P1 实际种子 ID 的 TemplateDto 示例。上述接口已实现；分类与模板直接读取 MySQL，封面通过公开受控路径读取。未知分类返回 `[]`，空白分类表示全部；详情不存在为 404／TEMPLATE_NOT_FOUND。请求失败与空列表区分。不提供模板 CRUD。

## 5. 素材

| 方法／路径 | 身份／输入 | 成功响应 | 阶段 |
| --- | --- | --- | --- |
| POST /api/assets | 登录、CSRF；multipart 字段 file | 201，AssetDto | P3 |
| GET /api/assets/{id}/content | 登录，本人素材 | 200，图片二进制 | P3 |

```json
{
  "id": "asset-id",
  "originalFilename": "photo.png",
  "mimeType": "image/png",
  "sizeBytes": 123456,
  "previewUrl": "/api/assets/asset-id/content"
}
```

上述接口已实现。每次恰好一个名为 file 的文件字段，接受实际可解码 JPEG／PNG；声明 MIME 也必须属于这两种并与实际内容一致。单文件最大 5 MiB（5,242,880 字节，含边界），multipart 总请求上限 6 MiB。分配像素缓存前额外限制为 4000 万像素。文件扩展名不作为格式依据，originalFilename 只保留最后一段、不能决定存储路径。归属来自服务端会话，不接受 userId 指定所有者。

| HTTP／code | 含义 |
| --- | --- |
| 400／INVALID_FILE_COUNT | 缺文件、文件字段名不正确或多文件 |
| 400／FILE_EMPTY | 空文件 |
| 400／INVALID_IMAGE | 图片损坏或不可解码 |
| 400／IMAGE_DIMENSIONS_TOO_LARGE | 超过 4000 万像素 |
| 400／INVALID_FILENAME | 文件名含控制字符或超过 255 个 Unicode 码点 |
| 400／UPLOAD_UNREADABLE | 上传流无法读取 |
| 413／FILE_TOO_LARGE | 文件或整个 multipart 请求超限 |
| 415／UNSUPPORTED_IMAGE_TYPE | 实际内容不支持，或声明 MIME 缺失／不支持 |
| 415／IMAGE_TYPE_MISMATCH | 声明 MIME 与实际 JPEG／PNG 不一致 |
| 415／HTTP_415 | 上传接口收到 JSON 等非 multipart 请求 |
| 503／STORAGE_UNAVAILABLE | 文件存储写入失败 |

素材不存在、非本人或文件缺失统一 404／RESOURCE_NOT_FOUND；未登录 401，CSRF 缺失／错误 403。预览返回实际 Content-Type、生成文件名的 inline Content-Disposition、nosniff、no-store。完整文件写入后才创建数据库记录，普通数据库失败会清理文件；文件与数据库事务的崩溃边界见[上传说明](uploads.md)。

不提供删除接口；替换／移除只更新当前表单引用，不删除服务端旧文件。P4 已在受理和素材检查阶段重新验证素材和模板要求，P5 负责上传位交互及客户端提示。

## 6. 任务

| 方法／路径 | 输入 | 成功响应 | 阶段 |
| --- | --- | --- | --- |
| POST /api/tasks | 登录、CSRF；CreateTaskRequest | 202，TaskDto，不等待制作 | P4 |
| GET /api/tasks | 登录；page、pageSize、可选 status | 200，PageResponse<TaskDto> | P4 |
| GET /api/tasks/active | 登录，无分页 | 200，所有未完成 TaskDto[] | P4 |
| GET /api/tasks/{id} | 登录，本人任务 | 200，TaskDto；不可访问 404 | P4 |
| GET /api/tasks/{id}/result | 登录，本人成功任务 | 200，图片二进制 | P4 |

CreateTaskRequest：

```json
{
  "templateId": "travel-postcard",
  "assetIds": ["asset-first", "asset-second"],
  "requestId": "72c878cf-a8b2-47c3-b115-673efff3f568"
}
```

assetIds 按上传位排列且不能重复。校验数量、类型、大小、归属与文件可用性。同用户、同 requestId、同模板及有序素材返回原任务；同键不同内容 409。请求结果未知时重试复用键，明确新制作或修改素材时使用新键；重试不重新执行失败任务。

以上任务接口均已实现。受理成功为 202，执行独立于 HTTP 请求；响应可能已经 RUNNING，也可在幂等重试时返回原终态。requestId 必须是标准 UUID，服务端规范为小写；仅该字段是幂等键，userId／模拟参数等额外字段不能覆盖服务端值。

输入结构错误为 400／VALIDATION_ERROR；数量、重复素材或模板限制不符为 400／INVALID_ASSETS；模板不存在为 404／TEMPLATE_NOT_FOUND；素材不存在或非本人为 404／RESOURCE_NOT_FOUND；真实内容复验的错误沿用上传错误码。同键不同内容为 409／IDEMPOTENCY_CONFLICT。page／pageSize 越界为 400／INVALID_PAGINATION，参数类型或状态枚举非法为 400／INVALID_PARAMETER。文件不存在、未成功或非本人任务结果均为 404。结果使用实际 PNG／JPEG 类型、inline、nosniff、no-store。

TaskDto：

```json
{
  "id": "task-id",
  "templateId": "travel-postcard",
  "templateTitle": "旅行明信片",
  "status": "RUNNING",
  "currentStage": "GENERATE",
  "steps": [
    { "stage": "MATERIAL_CHECK", "status": "SUCCEEDED", "startedAt": "2026-10-28T08:00:01Z", "finishedAt": "2026-10-28T08:00:03Z", "errorCode": null, "errorMessage": null },
    { "stage": "GENERATE", "status": "RUNNING", "startedAt": "2026-10-28T08:00:03Z", "finishedAt": null, "errorCode": null, "errorMessage": null },
    { "stage": "FINALIZE", "status": "PENDING", "startedAt": null, "finishedAt": null, "errorCode": null, "errorMessage": null }
  ],
  "createdAt": "2026-10-28T08:00:00Z",
  "startedAt": "2026-10-28T08:00:01Z",
  "finishedAt": null,
  "resultUrl": null,
  "errorCode": null,
  "errorMessage": null
}
```

分页：`{ "items": [], "page": 1, "pageSize": 20, "total": 0 }`。

### 状态与空值

- 任务 QUEUED → RUNNING → SUCCEEDED／FAILED；终态稳定。
- 阶段 MATERIAL_CHECK → GENERATE → FINALIZE；步骤按该顺序返回。
- 步骤 PENDING／RUNNING／SUCCEEDED／FAILED；失败后后续步骤保留 PENDING，前端解释为未执行。
- QUEUED 的 currentStage、执行时间、结果、错误均为空。
- RUNNING 的 currentStage、startedAt 有值，finishedAt、resultUrl 为空。
- SUCCEEDED 保留 FINALIZE，finishedAt、resultUrl 有值，错误为空。
- FAILED 保留失败阶段、执行时间与原因，resultUrl 为空。
- 重启将遗留 RUNNING 标为 FAILED；QUEUED 使用原配置继续，既有终态不变。
- active 只发现未完成 ID；消失不代表成功，必须读取详情终态。查询不推进阶段。
- 结果未就绪或文件不存在返回 404；不暴露未完成文件。

模拟快照已由 Java 保存，不由普通用户传入，不混入模板字段。执行失败码包括 SIMULATED_FAILURE、MATERIAL_CHECK_FAILED、GENERATE_FAILED、FINALIZE_FAILED、STATE_PERSISTENCE_FAILED、SERVICE_RESTARTED；通过成功的 GET 响应读取 TaskDto 的 errorCode／errorMessage，而非将其变成 HTTP 500。对应步骤保存相同原因，后续步骤保持 PENDING。

## 7. P0 专用转发验证

仅显式启用 `SPRING_PROFILES_ACTIVE=smoke` 时注册 `/api/_smoke/*`。默认无控制器；探针不落盘、不创建任务，不替代业务接口。

| 路径 | 行为 |
| --- | --- |
| GET /api/_smoke/cookies | 两个独立 Set-Cookie |
| POST /api/_smoke/echo | CSRF、Cookie、JSON 与会话传递 |
| POST /api/_smoke/upload | multipart 大小、MIME 和字节哈希 |
| GET /api/_smoke/file | 固定 PNG 内容及响应头 |
| GET /api/_smoke/error | 400 及统一错误体 |
| GET /api/_smoke/delay?milliseconds=12000 | 超过默认代理 10 秒，返回 504 |

容器内 `scripts/smoke-p0.mjs` 执行实际 HTTP 验证，命令见 README，结果见 `docs/p0-verification.md`。
