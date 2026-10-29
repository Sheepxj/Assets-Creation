# 交付索引

提交形式：可读取的 [GitHub 仓库](https://github.com/Sheepxj/Assets-Creation)，另提供同一提交导出的源码 ZIP。原题接受任一形式，不需要另交运行数据库、node_modules、Maven 缓存、Docker 镜像、公网地址或部署截图。

## 验收版本

当前修订标签：`delivery-2026-10-29-v2`，包含审查发现的三个前端缺陷修复，详见[修复记录](audit-bugfix-verification.md)。修复提交为 `d12d2dc041a8dff134321232afa71cdebb3c7435`，其[实际 CI](https://github.com/Sheepxj/Assets-Creation/actions/runs/40877435928)已成功；修订交付提交在此基础上更新文档，完整 SHA 和该提交的实际 CI 链接在交付清单及交付消息中提供。

原标签 `delivery-2026-10-29` 仍指向 P9 历史基线 `b667052`，未移动或覆盖。旧包 `assets-creation-b667052.zip` 不含三个修复，不能用来验收当前修订版。下载仓库时选择 v2 标签，或按完整 SHA 检出，避免把后续 master 更新混入验收。

```sh
git fetch origin --tags
git rev-parse 'delivery-2026-10-29-v2^{commit}'
git checkout delivery-2026-10-29-v2
docker compose up --build
```

当前 ZIP 为 v2 标签提交的 `git archive --format=zip --prefix=assets-creation/` 产物，命名为 `assets-creation-<短SHA>.zip`。本地交付目录为 `.local/delivery/`，`DELIVERY.txt` 列出本次应交的包名、完整 SHA、CI 链接和验证范围，`SHA256SUMS.txt` 仅列出当前包的 SHA-256。旧包保留但不再列为当前提交材料。ZIP 包含隐藏的 .github 和 .mvn，不含 .git 历史；解压后进入 assets-creation 目录执行标准 Compose 命令。没有单独生成另一套裁剪业务源码。

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
5. 在检查容器运行 Java 102／前端 89 项回归，查看验收提交对应的实际 CI，不将跳过集成测试或旧提交的成功当作当前全部通过。

## 不提交的内容

真实 .env／凭据、私人聊天和提示词、会话 Cookie、数据库导出和文件数据卷、.local 验收快照／日志／备份、node_modules、.next、target、覆盖率和下载缓存均不进入 Git 或源码 ZIP。公开本地演示口令及种子 BCrypt 哈希用于可复现演示，已在 README 明确说明。

附带的校验文件针对源码 ZIP 本身，不能用“压缩包存在”代替内容检查。交付前核对必需入口、隐藏 CI／Wrapper、SQL、15 张图片及来源／哈希文件，并排除运行数据与真实凭据。源码和容器环境是主要交付，浏览器截图只是本地验收证据，不是运行依赖。
