# 当前架构：Gateway-first

2026-09-08 决定采用 Gateway 在前的模式。此前 PR #5 的“宿主 → 独立公开 MCP → Gateway”规划被本方案替代；PR #4 的直连内部认证/Management 方案不采用。不是新增 direct 运行模式。

```text
授权：WorkBuddy → Gateway/Auth（现有 OAuth + PKCE）
协议：WorkBuddy → Gateway /mcp/ccdb → MCP
执行：MCP → Gateway /internal/ccdb/mcp/execute → Management → CCDB
```

Gateway 是每次 MCP 请求的公开入口，不仅用于首次授权。Token 有效时无需用户反复登录。MCP 独立部署在内网，不向宿主暴露 Node 服务，不另建 OAuth 登录页、Token 签发服务或 Token Exchange。

## 责任与身份边界

- Gateway 提供公共资源发现、未认证 401 challenge、用户 Token/Key 校验及代理。清除外部凭证和可伪造身份头，签发最长 60 秒执行票据。
- MCP `serve` 校验 X-CCDB-Execution-Context，按请求隔离身份；初始化和列工具不调用因子执行接口，不消费因子额度。用户 Bearer/Key 不能替代票据，不读取本地登录凭证。
- 工具执行只访问配置的 Gateway 执行 URL，携带当前票据，不携带用户原始 Token/Key。Gateway 再验票据并固定转发 Management，不回到 MCP。
- Management 检查当前授权/Key、用户组织、scope、重放、配额和审计。一张票据最多执行一次工具，不自动重试，不使用共享管理员身份。
- MCP resource 是 Gateway `/mcp/ccdb`；CLI/stdio REST resource 是 Gateway `/management/api/ccdb/v1`，两者 Token 不混用。

## 实现和发布状态

现有 MCP 代码支持该票据协议和执行路径，本次统一配置、部署说明及回归测试，无需为更换执行目标发布新的运行代码。旧 Management 执行地址迁移到 Gateway，必须先发布后端再切换。

后端 2026-09-08 交接报告：新增 Gateway 执行回程路由，本地通过真实换码、刷新、初始化/列工具、搜索、详情及撤权；修改当时尚未提交/推送，测试环境尚未发布。此为后端报告，不是本仓库独立完成的目标环境验收。

仍需确认后端提交发布，并验收真实 WorkBuddy/豆包、票据重放、Key 停用、双用户隔离及限流。DCR 仅在部署开启并由 metadata 公布 registration_endpoint 时使用，否则采用宿主支持的预注册。

## 部署与开源

见 [部署说明](REMOTE_MCP.md) 和 [Compose 模板](../deploy/docker-compose.yml)。同一仓库保留 stdio 和 HTTP；本地默认 device OAuth、API Key 为显式备选，不因本次调整改变。

公开模板不包含实际密钥。签名配置仅由 Secret 系统提供给受信任的 Gateway/MCP/Management，不给宿主或浏览器，不放 npm、Git、日志或聊天。开源 HTTP 模式依赖兼容 Gateway，不表示能无后端独立提供 CCDB 服务。
