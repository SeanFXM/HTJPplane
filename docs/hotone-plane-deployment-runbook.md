# Hotone – Plane 集成部署与凭证清理 Runbook

本文档适用于 Hotone 工作台通过 Plane service token 读取任务、并使用带版本条件的状态指令回写 Plane 的部署。

## 本次数据变更

- `0129_hotonetaskstatecommand` 新增标量化、不依赖 Project/Issue/User 外键的指令 ledger。Project 或 Issue 后续删除时，已记录的结果仍可重放。
- `0130_redact_api_activity_credentials` 不可逆地清理 PostgreSQL `api_activity_logs` 中当前已知 token 和符合 `plane_api_<32 hex>` 形式的历史 token。
- `redact_api_activity_credentials` 管理命令同时清理 PostgreSQL 和已配置的 MongoDB，然后验证零残留。MongoDB 已配置但不可用时，命令必须失败。
- API Activity logger 只保留明确允许的 header，并对 path/query/body/response/user-agent 脱敏；普通 `RequestLogger` 不记录 query string；worker 在写入 PostgreSQL/MongoDB 前再次脱敏。Gunicorn 和静态 Nginx 的原始 access log 已关闭，避免无法脱敏的 request line/referrer/user-agent 进入平台日志。
- migrator 入口在 `migrate` 后自动执行上述管理命令；清理或验证失败会阻止发布。

## 上线顺序（必须按顺序）

Hotone 内部小团队推荐使用短维护窗口，这能避免旧 API/worker 在清理结束后再次写入凭证。

1. 用同一 commit 构建不可变镜像，确认新镜像同时包含 HTTP logger 脱敏、worker 二次脱敏、`0129` 和 `0130`。
2. 备份 PostgreSQL 和 MongoDB。备份可能仍含历史凭证，必须限制访问、设置短保留期，恢复后必须重新执行清理。
3. 关闭入口流量，并停止所有旧版 API 和 Celery worker。不能只停 migrator。
4. 部署新版 API/worker 镜像，但暂不对外开放流量。这一步确保之后能写日志的进程全部已经脱敏。
5. 使用同一新镜像运行 migrator：

   ```bash
   python manage.py migrate
   python manage.py redact_api_activity_credentials
   ```

   标准 migrator 入口会依次执行这两条命令。任何一条失败都不得继续上线。

6. 在旧进程已全部退出的前提下，再手动执行一次 `redact_api_activity_credentials`。命令成功输出只包含更新数量，不应输出 token 内容。
7. 按下文执行零残留验证。
8. 轮换 Hotone service token，更新 Hotone 服务的 secret，完成冒烟测试后立即停用旧 token。
9. 再次执行清理命令和零残留验证，然后恢复流量。

如果必须零停机，需要拆成两个发布物：第一个只包含 HTTP/worker 脱敏，并等待全部旧进程退出；第二个才执行迁移、清理和轮换。不得在旧 logger 仍可写入时把“已执行一次清理”当作完成。

## 零残留验证

不要查询或打印凭证原文；只返回计数。PostgreSQL 的结果必须为 `0`：

```sql
SELECT count(*)
FROM api_activity_logs
WHERE token_identifier ~ 'plane_api_[0-9a-fA-F]{32}'
   OR path             ~ 'plane_api_[0-9a-fA-F]{32}'
   OR query_params     ~ 'plane_api_[0-9a-fA-F]{32}'
   OR headers          ~ 'plane_api_[0-9a-fA-F]{32}'
   OR body             ~ 'plane_api_[0-9a-fA-F]{32}'
   OR response_body    ~ 'plane_api_[0-9a-fA-F]{32}'
   OR user_agent       ~ 'plane_api_[0-9a-fA-F]{32}';
```

MongoDB 的结果也必须为 `0`：

```javascript
db.api_activity_logs.countDocuments({
  $or: [
    { token_identifier: /plane_api_[0-9a-fA-F]{32}/ },
    { path: /plane_api_[0-9a-fA-F]{32}/ },
    { query_params: /plane_api_[0-9a-fA-F]{32}/ },
    { headers: /plane_api_[0-9a-fA-F]{32}/ },
    { body: /plane_api_[0-9a-fA-F]{32}/ },
    { response_body: /plane_api_[0-9a-fA-F]{32}/ },
    { user_agent: /plane_api_[0-9a-fA-F]{32}/ },
  ],
});
```

如果该实例历史上使用过 MongoDB，不得为了跳过验证而删除 MongoDB 配置；应恢复连接、完成清理后再变更存储配置。旧的容器 stdout、日志 drain、备份和第三方 APM 不在数据库清理范围内；必须使用平台的删除/保留策略处理，并依靠 token 轮换使旧值失效。

## Hotone 状态指令协议

Hotone 只能对 work-item detail 路由发送 `PATCH`，body 只能包含 `state`：

```http
PATCH /api/v1/workspaces/{slug}/projects/{project_id}/work-items/{issue_id}/
X-Api-Key: <service token>
X-Hotone-Command-ID: <canonical UUID>
X-Hotone-Command-Mode: apply | cancel
X-Hotone-Expected-Updated-At: <timezone-aware ISO-8601>
X-Hotone-Actor-ID: <canonical employee Plane user UUID>
Content-Type: application/json

{"state":"<canonical state UUID>"}
```

- `apply` 在一个事务中锁定 workspace→project→人员/成员关系→issue→assignee→state，检查 `updated_at` 后才改状态。
- 已删除/已归档 workspace 或 project 会记录可重放的 `HOTONE_SCOPE_NOT_FOUND`；`apply` 永远不会越过已撤销的作用域。
- `cancel` 用于 Hotone 本地员工身份已撤销后冻结一条尚未在 Plane 记录的指令。它只依赖仍有效且绑定同一 workspace 的 service token，因此 Project 删除并级联软删除成员关系后仍能写入 `HOTONE_COMMAND_CANCELLED`。
- 同一 `command_id` 只能表示同一个 workspace/project/issue/actor/state/version 信封。重试只会返回首次持久化的 status/body，不再次修改 issue。
- 无 `X-Hotone-Command-Mode` 或未知 mode 均返回 `400`，且不写 ledger。
- service token 在其他 unsafe API 上是只读的。不得把该 token 复用为通用 Plane 管理凭证。

## 轮换后冒烟检查

1. 新 token 能读取指定 workspace/project 的任务。
2. 用新 `command_id` 执行一次 `apply`，然后原样重试；两次 status/body 必须一致，且只有一条 ledger/activity。
3. 用另一个新 `command_id` 先发 `cancel` 再发延迟 `apply`；两次必须都返回已持久化的 `HOTONE_COMMAND_CANCELLED`，issue 不变。
4. 尝试用 service token 写入任意非 Hotone 路由，必须返回 `403`。
5. 停用旧 token，确认旧 token 读写均失败；再执行清理与零残留验证。

## 回滚

- `0130` 是不可逆的脱敏迁移，回滚代码不应还原凭证。
- 不得删除 `hotone_task_state_commands` 或清空 ledger 来“修复重试”，否则延迟请求可能再次改变任务。
- 如果新版应用需回滚，保留 `0129/0130` 数据结构和已脱敏数据，停止 Hotone 写回，修复后再恢复。
