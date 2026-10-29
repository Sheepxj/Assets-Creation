# 容器化 CI

配置为 [.github/workflows/ci.yml](../.github/workflows/ci.yml)，监听 push、pull_request，并允许 workflow_dispatch。配置存在不代表运行通过；本阶段实际运行结果在 P8 验证记录中补齐，也可查看[仓库 Actions](https://github.com/Sheepxj/Assets-Creation/actions/workflows/ci.yml)。

两个 job 在 Ubuntu 24.04 runner 的独立容器中执行：

| job | 固定环境 | 显式检查 |
| --- | --- | --- |
| frontend | node:22.23.4-bookworm-slim | npm ci、lint、独立 tsc、Vitest、Next.js 生产构建 |
| backend | maven:3.9.16-eclipse-temurin-21，独立 mysql:8.4.13 service | Wrapper 版本、真实 MySQL 单元／集成测试、verify 及 Spring Boot 打包 |

MySQL health 使用应用账户执行 SELECT 1，通过后才开始 job。数据库连接使用容器服务名 mysql，不开放宿主机端口。RUN_DATABASE_TESTS=true 启用全部后端集成测试；测试资源关闭自己的自动 Worker，不会与另一个应用竞争队列。CI 口令是公开的临时演示值，只用于每次创建的数据库，没有真实凭据或仓库 secrets 要求。

缓存只保存 npm／Maven 下载数据，键包含工具链和锁文件／pom；每次仍 npm ci、重新测试和构建，不缓存 node_modules、target 或测试结果。Maven 明确使用 $HOME/.m2/repository，与缓存及 Wrapper 目录保持一致。Java 测试报告保留七天供失败诊断，不自动发布应用。

官方 Actions 已核对 tag 对应提交并固定完整 SHA：checkout v7.0.1、cache v6.1.0、upload-artifact v7.0.2，均使用 Node 24 action runtime；job 内构建命令仍使用上述 Node 22／Java 21 容器工具链。Workflow 只授予 contents:read，checkout 不保留凭据；相同分支新提交可取消旧运行。

容器 job 与服务网络依据 [GitHub 官方说明](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers)。版本来源：[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1)、[cache](https://github.com/actions/cache/releases/tag/v6.1.0)、[upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)。

本地等价命令见 README 的 compose.frontend.yaml、compose.p1.yaml。完整容器构建用 docker compose build。若需核对不依赖缓存，可用 --no-cache，并为 backend 指定全新的 MAVEN_CACHE_ID 构建参数；不要清理其他项目的 Docker 缓存或数据卷。
