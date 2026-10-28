# P5 页面、身份、上传与提交验证

本文件保留 2026-10-28 的 P5 交付证据（当时 49 项测试）。P6 已于次日完成专项检查和修复，当前前端 68 项通过，见 [P6 验证记录](p6-verification.md)；下文“待 P6”描述对应历史阶段。

日期：2026-10-28（Asia/Shanghai）。范围：开发计划 P5-01～P5-12，沿用已确认的设计和 P4 Java 契约。P5 约 21:23 开始，22:30 完成最终生产镜像构建，随后完成浏览器补验、文档与远程同步；期间含 P4 再次复查，墙钟时间不能当作纯实现工时。

**P5 全部 12 项已实现并验证。** 为完成连续制作，已提供 P6 所需的共享任务跟踪和历史基础；P6 完整专项清单保持待验收，P7～P9 集中回归、CI 和最终交付也未宣布完成。

## 1. 逐项证据

源码路径相对 `frontend/`。

| 条目 | 实现位置与不变量 | 验证依据 |
| --- | --- | --- |
| P5-01 页面基础 | app 页面、components/ui、shell、globals.css；语义表单、中文反馈、加载／空／错误、原生 dialog、焦点样式 | 默认首页及详情桌面查看；375px 历史可用且无横向溢出；预览 Escape 与焦点恢复 |
| P5-02 请求层 | lib/api/client.ts；同源 Cookie、CSRF、超时、取消、字段错误；只由 UNAUTHENTICATED 触发身份失效 | client 7 项测试；真实注册／上传经 Next.js→Java；BAD_CREDENTIALS 保留旧账户 |
| P5-03 登录 | auth/form、session 及 app/login；防重复、站内 returnTo、恢复 me／刷新 CSRF、无浏览器凭据持久化 | session／form 测试；真实登录返回原详情，错误密码后旧用户名仍存在 |
| P5-04 注册 | 确认密码、Unicode／UTF-8 边界及重名字段错误；成功自动登录 | form 3 项；session 规则测试；浏览器先不一致阻止提交，再成功创建专用账户 |
| P5-05 身份生命周期 | SessionStore 的 operation／scope／revision；边界取消及清理；未知账户状态阻止私有写操作 | session 17 项；浏览器切换 demo_b 无旧记录；退出处理中任务后再登录仍完成；Java 重建触发过期提示 |
| P5-06 模板广场 | templates/gallery；Java 分类／列表、按分类 queryKey 及 signal、加载／空／错误重试 | gallery 测试；真实六模板、旅行分类两模板；迟到分类响应不能覆盖新分类 |
| P5-07 模板详情 | templates/detail；仅真实详情成功后显示 Creator，数量与限制来自模板 | 404 组件测试及真实不存在模板；无提交按钮；浏览器验证 1／2／3 上传位 |
| P5-08 上传位 | upload-session 及 UploadTile；独立状态／assetId，即时类型／大小校验、预览、替换、移除、失败／重传 | upload-session 6 项；浏览器 PNG／JPEG 成功、替换／移除、Markdown 类型拒绝，多位未齐不可提交 |
| P5-09 上传竞争 | AbortController＋选择序号＋scope；替换／移除立即清旧 ID；释放 blob URL | 上传测试明确模拟忽略 abort 的迟到响应、移除、无效替换、重传及身份清理 |
| P5-10 提交受理 | Submission 同步入口防重；所有位 ready；UUID；受理后退出 pending、共享注册、历史失效刷新 | submission 7 项；真实连续两次提交，按钮结束提交态，记录出现排队／处理中 |
| P5-11 结果未知 | 网络／超时／5xx／畸形受理响应保留 intent、原键及素材；手动安全重试；变更生成新键 | submission 测试覆盖 0／502／504 原键重试、素材变更及迟到确认；无自动重放 POST |
| P5-12 连续制作 | 清空表单开始下一次，已受理任务独立保存在根级 TaskRegistry／TasksProvider | 浏览器两个独立任务先后成功并预览；provider 测试证明一条查询失败不影响另一条，终态停止自动查询 |

## 2. 容器自动化与生产构建

`compose.frontend.yaml` 使用 Dockerfile 的 checks 阶段，不依赖宿主机 Node，也不启动数据库：

```sh
docker compose -p assets-creation-p5-checks -f compose.yaml -f compose.frontend.yaml run --build --rm frontend-checks
docker compose build frontend
```

最终前端：**lint 通过、TypeScript 通过、9 文件 49 项测试通过、Next.js 生产构建通过**。最后一次生产构建包含全部 49 项，产物路由为 `/`、`/login`、`/register`、`/templates/[id]`、`/tasks` 及既有代理／健康入口。未更改依赖版本或锁文件。

| 测试文件 | 数量 | 核心覆盖 |
| --- | --- | --- |
| lib/api/client.test.ts | 7 | Cookie／CSRF／multipart、超时与取消、401 区别、403 不重放、旧 scope／畸形响应 |
| features/auth/session.test.ts | 17 | 身份切换／过期／未知响应、旧请求、CSRF、安全 returnTo、Unicode 规则 |
| features/auth/form.test.tsx | 3 | 确认密码、禁重复、自动登录跳转及重名字段 |
| features/templates/gallery.test.tsx | 3 | 分类竞争、空态／重试、不存在详情无伪造表单 |
| features/upload/upload-session.test.ts | 6 | 替换／移除竞争、精确 5 MiB／超限／空文件、重传及 URL 清理 |
| features/upload/submission.test.ts | 7 | 未就绪／防重、未知原键、变更新键、离页确认及身份隔离 |
| features/tasks/registry.test.ts | 3 | 按 ID 独立、终态不回退、身份清理 |
| features/tasks/cards.test.tsx | 2 | 查询异常与任务失败区分、后续未执行／结果入口 |
| features/tasks/provider.test.tsx | 1 | 完整 Provider 中双任务查询、单条暂停／恢复、终态停止轮询 |

早期前端检查有失败记录，已修正后完整重跑；这里只统计最终结果。构建及检查日志存被忽略的 `.local/p5-final-build.log`、`.local/p5-verified-checks.log`。本次后端代码未改；P4 再次复查另重新运行 **98 项全部通过**，见 [P4 当前复查](p4-current-source-review.md)。49＋98 不是同一条 CI 流水线，GitHub Actions 仍待 P8。

## 3. 实际浏览器与真实 Java

使用独立 `assets-creation-p5` 三服务、MySQL 和文件卷，端口 3001。浏览器地址使用 `127.0.0.1:3001`，与默认 `localhost:3000` 分离 Cookie 主机，避免跨端口会话互扰。操作由浏览器 UI 完成，上传使用仓库真实图片；没有用前端定时文案模拟 Java 状态。

已实际观察：

1. 六模板、三个分类，旅行筛选两张卡；两图详情匿名时引导登录，注册链接保留 returnTo。
2. 确认密码错误阻止注册；修正后自动登录并回到详情。单图、双图、三图上传位与 Java 要求一致。
3. PNG、JPEG 上传与服务端预览，替换和移除立即更新；未齐的双图表单不可提交；选择 Markdown 显示类型错误且不可提交。
4. 单图模板连续两次制作，先看到一条排队、一条处理中，并显示实际阶段；两条独立成功。预览图片完成加载（自然宽度 960），原生 dialog 的 Escape 关闭并恢复焦点。
5. A 已登录时尝试 B 的错误密码，仍保留 A 身份；正确切到 demo_b 后历史为空且没有 A 卡片；再登录 A 恢复记录。
6. 375×812 窄屏历史及状态筛选：失败筛选空态、成功筛选显示两条；document.scrollWidth 不超过 innerWidth。截图保存供本地查看。
7. 创建第三条任务后退出，私有卡片立即消失；随后登录 A，任务已成功；刷新页面仍恢复三条记录。
8. 不存在模板给出可理解的错误，无可提交伪造表单。
9. 等原任务结束后将隔离 Java 改为 GENERATE 指定失败并重建，旧会话收到过期提示；重新登录后创建第四条任务，显示素材检查完成、模拟生成失败、结果整理“未执行”，原因明确，失败卡片没有预览按钮。此前三条成功记录仍在。
10. 默认前端镜像更新后，`localhost:3000` 实际读取 Java 六模板、分类及匿名登录／注册入口；三个默认服务健康，默认后端模拟配置未改。

本地截图 `.local/p5-gallery-desktop.jpg`、`p5-creation-desktop.jpg`、`p5-history-mobile.jpg`、`p5-failed-task-desktop.jpg` 不进入 Git。浏览器临时视口已恢复，隔离验证服务停止、卷保留；默认 3000 服务继续运行。测试会话和 Cookie 不进入文档或仓库。

## 4. 完成范围与边界

- M2 的浏览器注册、上传、连续提交及结果预览已经跑通；P6 的共享跟踪、历史和基本恢复已经有实现，完整 P6 清单仍单独验收。
- P5 的网络竞争、提交结果未知等用可控测试验证；没有声称所有网络故障都在真实浏览器中人为注入过。
- 不持久化未提交表单，刷新丢失其素材引用；已受理任务从 Java 恢复。替换／移除不删除服务端文件，无孤立文件自动清理。
- 沿用单 Java 实例和模拟生成边界，不新增真实 AI、取消、失败重试、模板后台等题外功能。
- 本次已同步页面说明、认证／上传／任务文档、设计状态、README 及 P5 计划勾选；Git 验收提交以本次远程同步记录为准。
