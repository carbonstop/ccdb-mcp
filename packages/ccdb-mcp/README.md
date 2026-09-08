# CCDB Connect MCP

npm 包：`ccdb-mcp-server`；命令：`ccdb-mcp`。升级前请阅读仓库中的迁移说明，旧工具接口可能不兼容。

独立 Node.js 22+ MCP 包，提供 stdio、包内登录和诊断。无需另外安装 CLI 或 ccdb-client。

## 从 npm 安装

```sh
npm install -g ccdb-mcp-server@latest
ccdb-mcp --version
```

再次执行上述命令可升级到 npm latest。镜像未同步时追加 `--registry=https://registry.npmjs.org/`。数据库访问仍需有效授权和可用后端。

## 本地 stdio：默认 device OAuth，API Key 为备选

仅本地 stdio 用户执行以下登录；远程连接器用户不需要在本机安装或登录此包。

```sh
ccdb-mcp login
ccdb-mcp status --json
ccdb-mcp stdio
```

`ccdb-mcp login` 默认使用 device OAuth，等价于 `ccdb-mcp login --method device`。用户在浏览器完成登录和授权；无浏览器终端可加 `--no-browser`，在另一台设备打开显示的授权链接。设备码登录不是 CLI 专属，这里是本地 MCP 的登录辅助命令，不是宿主通过 stdio 自动进行 OAuth 协商。

API Key 是用户主动选择的备选：使用 `ccdb-mcp login --method api-key` 安全输入，或通过宿主 Secret 配置 `CCDB_API_KEY`。不要在聊天、命令参数或日志里粘贴完整 Key。

默认推荐顺序不改变显式配置：`CCDB_API_KEY` 存在时仍优先于保存的凭证；要恢复 OAuth，用户需从实际启动 MCP 的环境中移除该变量并完成登录。没有环境 Key 时使用已保存的凭证；OAuth 失败不会自动改用 API Key，Key 失败也不会切换 OAuth。查询不会自动发起 device 登录。

业务工具只有 search_emission_factors 和 get_emission_factor_detail。成功返回原始 CCDB JSON 和 structuredContent；不依赖大模型 Key，不自动做建模写入，不将原始候选铺成最终推荐卡片。

环境与 OAuth 客户端配置见 [配置说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/CONFIGURATION.md)。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

## 远程连接器：Streamable HTTP

当前采用 Gateway-first 架构：

```text
用户授权：WorkBuddy → Gateway/Auth（OAuth + PKCE）
协议请求：WorkBuddy → Gateway /mcp/ccdb → 内网 MCP
工具执行：MCP → Gateway /internal/ccdb/mcp/execute → Management → CCDB
```

宿主填写 Gateway 的公开 MCP URL，不连接内部 Node。Gateway 每次校验 OAuth Token 或 API Key，生成短时签名票据；MCP 验票并仅向 Gateway 发出工具执行请求。MCP 不直接调用 Management，不另建登录页、Token 签发或 Token Exchange。API Key 为宿主支持认证头时的显式备选，不自动降级。

现有 `ccdb-mcp serve` 支持该票据协议，更换执行目标不需要新运行模式。先发布后端 Gateway 执行路由，再配置 MCP 的 CCDB_MCP_EXECUTION_URL 指向 Gateway。后端交接中的本地通过结果不代表测试/生产已发布或 WorkBuddy 已验收。

此前 PR #5 的宿主直连独立 MCP 规划已被替代；不采用 PR #4 的 direct-Management 方案。见 [当前架构](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/GATEWAY_BACKED_MCP.md) 和 [部署配置](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md)。
