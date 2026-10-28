# 模板、上传与文件访问

P3 已实现模板分类／列表／详情、公开封面、单图片上传和本人预览，P4 已补齐制作时的模板与素材组合校验。P5 已接入正式页面、动态上传位及提交，详见[前端说明](frontend.md)。接口字段见 [API 契约](api.md)。

## 模板读取

- `GET /api/templates/categories` 返回三个分类；`GET /api/templates?category=travel` 返回该分类模板。
- 不传 category 或只传空白表示全部；未知分类返回 `[]`。分类与模板由 Java 通过 MyBatis 读取 MySQL，不是前端静态数据。
- `GET /api/templates/{id}` 返回标题、描述、图片数量、MIME 和大小要求；不存在为 404／TEMPLATE_NOT_FOUND。
- `coverUrl` 使用 `/api/demo/covers/{filename}`，公开读取打包在 JAR 中的封面。只开放该目录下受限文件名，不开放磁盘路径或整个示例目录；结果文件由 P4 的本人任务接口提供。

## 上传与预览

先按[认证协议](authentication.md)登录并重新获取 CSRF Token，然后用 FormData 向 `POST /api/assets` 上传。

```typescript
const body = new FormData();
body.append("file", file);
const response = await fetch("/api/assets", {
  method: "POST",
  headers: { [csrf.headerName]: csrf.token },
  body,
});
```

不要手写 multipart 的 Content-Type，浏览器需要生成 boundary。一次请求恰好一个名为 file 的文件字段；重复 file、其他文件字段或缺文件返回 400。普通表单中的 userId 不参与归属判断。

201 返回 id、originalFilename、mimeType、sizeBytes、previewUrl。id 由服务端随机生成；mimeType 来源于真实内容；预览地址为同源 API，不含存储路径。原文件名只保留最后一段作为元数据，过长或包含控制字符拒绝，扩展名不决定图片类型。

`GET /api/assets/{id}/content` 要求登录并从数据库按 id 与当前用户一起查询。本人获得图片二进制、实际 Content-Type、生成文件名的 inline Content-Disposition、nosniff 和 no-store。其他用户、不存在记录、记录存在但文件缺失均为 404／RESOURCE_NOT_FOUND；无会话为 401。刷新页面后可再次请求同一个地址；Java 重启后重新登录即可读取已保存素材。

## 校验和各层限制

| 层 | 行为 |
| --- | --- |
| Java multipart | 单文件 5 MiB，整个 multipart 请求 6 MiB，留出表单头开销；超限统一 413／FILE_TOO_LARGE |
| Java 图片内容 | 字节计数上限 5,242,880；只接受 image/jpeg、image/png 声明，并核对实际文件头和 ImageIO 解码结果 |
| 解码内存保护 | 分配图片像素缓存前检查宽高乘积，超过 40,000,000 像素返回 400／IMAGE_DIMENSIONS_TOO_LARGE；是实现的附加资源限制 |
| Next.js 转发 | App Router 流式转发 FormData 和响应，保留 Cookie、CSRF、状态及 JSON 错误；没有较小的 Server Action 体积限制 |
| 请求超时 | 默认 10 秒，PROXY_TIMEOUT_MS 可调整；上传超时是请求异常，不能据此推断未来制作任务失败 |
| P5 页面校验 | 已根据模板的 acceptedMimeTypes／maxFileSizeBytes 做即时反馈，并展示服务端错误；上传中、未齐或失败时不能提交 |

空文件 400／FILE_EMPTY；不支持或伪装格式 415／UNSUPPORTED_IMAGE_TYPE；声明与实际 JPEG／PNG 不一致 415／IMAGE_TYPE_MISMATCH；解码失败 400／INVALID_IMAGE；文件字段不合法 400／INVALID_FILE_COUNT。缺少或不可解析的 MIME 声明不予接收。合法 JPEG 即使文件名以 .png 结尾，仍按 JPEG 保存和读取。

5 MiB 包含边界。边界测试使用可解码 PNG 加尾部填充到精确大小，既证明图片有效又验证全部字节被保留；5 MiB + 1 及整个请求超过 6 MiB 均已通过真实 Next.js→Java 验证。上传接口不接收图片数组；模板需要的素材数量在 P4 创建任务时校验。

## 存储与失败处理

STORAGE_ROOT 在 Compose 中为 `/app/data`，挂载 asset-data 数据卷。启动时创建并检查目录可写。

1. 完成图片校验，确定用户身份、随机 UUID 和扩展名。
2. 在受控根目录的 `.tmp` 写完全部文件；同文件系统优先原子移动到 `uploads/{userId}/{assetId}.png|jpg`，不支持原子移动时使用普通移动。
3. 完整文件存在后，用短数据库事务创建素材记录并提交，再返回 201。
4. 文件写失败清理临时文件并返回 503／STORAGE_UNAVAILABLE；数据库写入或事务提交抛错则尝试删除完整文件并返回错误。

读取仅使用数据库记录中的相对路径，规范化并检查真实路径位于根目录，不允许越界或指向根目录外的符号链接。HTTP 不提供任意路径读取参数。

数据库事务与文件系统不是分布式事务：进程在写文件后崩溃、提交结果不确定或清理遇到 I/O 错误时仍可能留下孤立文件或缺文件记录；清理错误记日志，缺文件读取返回 404。当前没有后台孤立文件扫描、自动修复或磁盘配额。

## 替换和移除

P5 替换时立即清空旧 assetId，新上传成功后再保存新 ID；移除只清空表单引用。不提供删除素材 API，也不自动删除旧素材，避免影响已创建的任务。已通过取消信号、选择序号及账户 scope 检查拒绝迟到响应，替换、移除和卸载释放临时预览 URL。

P4 创建任务已检查模板存在、素材数量准确、ID 不重复、当前用户归属、实际文件存在及 MIME／大小符合该模板，执行素材检查步骤时再次确认可解码和可用。P3 的单文件上传通过不意味着可以跳过这些校验，详见[任务说明](tasks.md)。

## 容器复现

完整后端测试沿用 `compose.p1.yaml` 的通用 p1-checks 服务，P3 为 62 项，P4 复核后当前为 98 项，须设置该服务中的 RUN_DATABASE_TESTS=true 才包含真实数据库集成，且测试库不能与正在运行的后台执行器共用。

PowerShell 在仓库根目录执行下列 HTTP 检查；使用专用项目和 3001 端口，避免影响默认 3000 入口：

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
$env:FRONTEND_PORT = '3001'
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p3.yaml up --build -d --wait mysql backend frontend
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p3.yaml run --rm p3-http-checks
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p3.yaml up -d --force-recreate --no-deps --wait backend
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p3.yaml run --rm -e P3_CHECK_MODE=verify-restart p3-http-checks
docker compose -p assets-creation-p3 -f compose.yaml -f compose.p3.yaml down
Remove-Item Env:FRONTEND_PORT
```

full 模式为 13 项 HTTP 检查，verify-restart 为 2 项。脚本读取仓库内的真实图片，使用演示账号 demo_a／demo_b，向专用卷写入四份素材；重复 full 会新增素材。最后 down 保留专用卷及素材，没有清理默认项目，也没有调用不存在的删除 API。

`.local/p3-assets.json` 仅用于本地重建验证，包含会话 Cookie 与素材哈希，不提交 Git、不复制进应用镜像；需要重新验证时先运行 full 生成新快照。实际结果见 [P3 验证记录](p3-verification.md)。
