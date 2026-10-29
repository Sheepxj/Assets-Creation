# 启动、备份与回滚

正常运行只需 Docker／Compose。以下命令从仓库根目录执行，项目脚本、构建及数据库操作均在容器内运行；PowerShell 只负责文件路径与 Docker 调用。首次需要联网拉取镜像和依赖，后续不依赖外部图片或 AI 服务。

## 固定版本启动

交付版本与检查结果见 [delivery.md](delivery.md)。首次检出交付标签，再启动：

```powershell
git fetch origin --tags
git checkout delivery-2026-10-29-v2
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail 80 backend
```

打开 http://localhost:3000；`/api/health` 应返回 UP，模板接口应有六项。MySQL 仅容器内可访问，Java 使用应用账户连接 mysql:3306；前端在服务端连接 backend:8080。已有用户、模板、上传及结果由两个数据卷保留。不要用删卷解决启动或密码问题；已有库密码不会随着 .env 初始化变量自动修改，schema.sql 也不是迁移工具。

## 一致性备份

数据库与文件不是同一事务资源。先停止写入和任务执行，再一起备份，不能只保存 MySQL。下面是默认项目的示例；重要数据应另存到安全位置，备份内有用户及密码哈希，不进入 Git。

```powershell
New-Item -ItemType Directory -Force .local/backups | Out-Null
$backupDir = (Resolve-Path .local/backups).Path
git rev-parse HEAD | Set-Content (Join-Path $backupDir 'commit.txt')

# 先在界面或 API 确认没有未完成任务；停止时仍可能中断过长任务。
docker compose stop -t 25 frontend backend
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF --hex-blob -u"$MYSQL_USER" "$MYSQL_DATABASE" > /tmp/assets-backup.sql'
docker compose cp mysql:/tmp/assets-backup.sql (Join-Path $backupDir 'database.sql')
docker compose run --rm --no-deps --entrypoint tar --volume "${backupDir}:/backup" backend -czf /backup/files.tar.gz -C /app/data .
docker compose start backend frontend
```

每次检查命令退出码；失败时不要用不完整备份覆盖旧备份。正式使用可按日期创建备份目录，另行安全保存配置；不要把真实 .env 或数据库导出放入提交材料。Session 在 Java 内存，备份不含登录状态。

## 在新项目恢复验证

仅对明确为空的恢复项目操作；不要把 SQL 导入正在服务的原库。下例新建 assets-creation-restore 项目及其专用卷；使用与备份相符的数据库名／配置。

```powershell
$env:FRONTEND_PORT = '3002'
docker compose --env-file .env.example -p assets-creation-restore build backend frontend
docker compose --env-file .env.example -p assets-creation-restore up -d --wait mysql
docker compose --env-file .env.example -p assets-creation-restore cp (Join-Path $backupDir 'database.sql') mysql:/tmp/assets-restore.sql
docker compose --env-file .env.example -p assets-creation-restore exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" < /tmp/assets-restore.sql'
docker compose --env-file .env.example -p assets-creation-restore run --rm --no-deps --user root --entrypoint tar --volume "${backupDir}:/backup:ro" backend -xzf /backup/files.tar.gz -C /app/data
docker compose --env-file .env.example -p assets-creation-restore up -d --wait
```

tar 恢复工具容器以 root 还原文件所有者；正常 Java 服务仍为 app 用户。重新登录后验证账号、完整任务／步骤及上传和结果文件字节，不能只看容器健康。验证完 `docker compose --env-file .env.example -p assets-creation-restore down`，保留专用恢复卷；清除本终端 FRONTEND_PORT，防止影响默认项目。

## 更新与回滚

1. 更新前记录当前完整 commit／镜像 ID、确认无执行中任务，并完成上述一致性备份。
2. 检出目标已验证提交，执行 `docker compose up --build -d --wait`，核对健康、模板、登录、历史和图片；保留原数据卷。
3. 回滚时检出上一个已验证提交，以相同配置重新构建启动；也可恢复已保存的旧镜像标签后 `docker compose up -d --wait`。P8 本地保留 pre-p8 镜像标签，仅为该机器的便捷回退，不是仓库交付依赖。
4. 代码回退不会撤销数据库或文件变更。当前没有破坏性迁移；若将来新增迁移，应先验证向前／向后兼容。需要数据回退时先在新的恢复项目验证成套数据库和文件备份，再决定切换，不能仅回退镜像。

不要求公网部署、自动发布或复杂平台。本项目未宣称生产高可用或多实例调度。完整已知限制和验收证据见 [acceptance.md](acceptance.md)。
