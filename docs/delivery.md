# 交付索引

提交形式：可读取的 [GitHub 仓库](https://github.com/Sheepxj/Assets-Creation)，另提供同一提交导出的源码 ZIP。原题接受任一形式，不需要另交运行数据库、node_modules、Maven 缓存、Docker 镜像、公网地址或部署截图。

## 验收版本

后续修复版本位于 `master`，包含审查发现的三个前端缺陷修复，详见[修复记录](audit-bugfix-verification.md)。下述标签和原 ZIP 保留 P9 历史基线，不含后续修复。验收修复版请 `git fetch origin` 后按修复消息给出的完整 SHA 检出，或使用 `origin/master`；重新构建启动命令不变。

固定标签：`delivery-2026-10-29`。该标签在最终文档完成后创建，指向最终交付提交；完整 commit 与该提交实际 CI 链接在交付消息一并提供。下载仓库时选择该标签，或按完整 SHA 检出，避免把后续 master 更新混入验收。

```sh
git fetch origin --tags
git rev-parse 'delivery-2026-10-29^{commit}'
git checkout delivery-2026-10-29
docker compose up --build
```

最终 ZIP 为此提交的 `git archive --format=zip --prefix=assets-creation/` 产物，附完整 SHA／CI 链接及 SHA-256 校验文件。它包含隐藏的 .github 和 .mvn，不含 .git 历史；解压后进入 assets-creation 目录执行标准 Compose 命令。没有单独生成另一套裁剪业务源码。

## 应提交的材料

| 材料 | 位置／内容 |
| --- | --- |
| 入口说明 | [README](../README.md)：版本、结构、连接、配置、命令、演示、API、限制、投入、AI 和来源 |
| 前端源码 | frontend/：App Router、React／TS 页面、认证／上传／任务生命周期、同源代理及测试 |
| Java 源码 | backend/：Spring Boot／MyBatis、认证、素材、异步三步、队列／恢复、查询／结果及测试 |
| 依赖与构建 | frontend/package.json／package-lock.json、backend/pom.xml／mvnw／.mvn、两个 Dockerfile 及 .dockerignore |
| 数据库 | database/schema.sql、seed.sql、README 和验证 SQL；六表、两个演示账号、六模板 |
| 图片 | demo-assets/ 全部 15 张真实 JPEG／PNG、manifest.sha256、SOURCES.md；scripts/GenerateDemoAssets.java |
| 运行配置 | compose.yaml、.env.example；其余 Compose 为容器检查／验收入口，均有说明 |
| CI | .github/workflows/ci.yml：push／PR 触发，前端检查和真实 MySQL Java 测试／构建 |
| 接口与可运行示例 | [api.md](api.md)、[examples/api-demo.mjs](../examples/api-demo.mjs)，在前端容器中实际跑通的登录→上传→任务→结果→退出 |
| 最终验收 | [acceptance.md](acceptance.md)：AC-01～18、R-01～14、证据方法、范围及已知限制 |
| 部署与回滚 | [operations.md](operations.md)：固定版本启动、数据库＋文件成套备份、隔离恢复、回退版本且保留卷 |
| 设计与过程 | docs/superpowers/specs／plans、P0～P8 阶段记录及源码复核，保留历史日期／当时结果 |

## 建议评估顺序

1. 阅读原题、README 和最终验收，确认 Java／Next.js 职责、模拟方式及范围。
2. 审查 TaskService→TaskStateStore／TaskWorker→TaskExecutionService／TaskStages，以及 MyBatis 条件更新和数据库约束。
3. 审查前端 ApiClient／SessionStore、UploadSession／Submission、TaskRegistry／TasksProvider，关注独立任务、未知提交、身份和迟到响应。
4. 标准 Compose 启动，使用 demo_a／demo_b 或注册，走成功、多任务、刷新和预览；按 README 配置三个失败阶段和耗时。
5. 在检查容器运行 Java 102／前端 76 项回归，查看验收提交对应的实际 CI，不将跳过集成测试或旧提交的成功当作当前全部通过。

## 不提交的内容

真实 .env／凭据、私人聊天和提示词、会话 Cookie、数据库导出和文件数据卷、.local 验收快照／日志／备份、node_modules、.next、target、覆盖率和下载缓存均不进入 Git 或源码 ZIP。公开本地演示口令及种子 BCrypt 哈希用于可复现演示，已在 README 明确说明。

附带的校验文件针对源码 ZIP 本身，不能用“压缩包存在”代替内容检查。交付前核对必需入口、隐藏 CI／Wrapper、SQL、15 张图片及来源／哈希文件，并排除运行数据与真实凭据。源码和容器环境是主要交付，浏览器截图只是本地验收证据，不是运行依赖。
