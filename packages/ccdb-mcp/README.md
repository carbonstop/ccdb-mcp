# CCDB Connect MCP

npm 包：`ccdb-mcp-server@2.0.0`；命令：`ccdb-mcp`。与旧 1.x 保持名称，不保证工具接口兼容。

独立 Node.js 22+ MCP 包，提供 stdio、包内登录和诊断。无需另外安装 CLI 或 ccdb-client。

## 从 npm 安装

```sh
npm install -g ccdb-mcp-server
ccdb-mcp --version
```

固定版本：`npm install -g ccdb-mcp-server@2.0.0`。镜像未同步时追加 `--registry=https://registry.npmjs.org/`。数据库访问仍需有效授权和可用后端。

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

本地默认端口仅在 CCDB_PROFILE=local 时生效：网关 8880、Agent 3100。OAuth 客户端默认 ccdb-connect-local，需在对应环境登记。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

## 远程 Streamable HTTP

源码新增 `CCDB_MCP_AUTH_MODE=direct`：MCP 提供公开 OAuth 发现，通过独立认证服务验证凭证，再直连内部业务接口，无需业务 Gateway 转发。需要新增后端校验契约并联调；当前 npm 2.0.0 不包含此改造。见 [direct 模式](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/DIRECT_HTTP.md)。以下说明适用于兼容保留的默认 gateway 模式。

远程优先使用宿主的 OAuth 授权流程（通常为授权码 + PKCE），不要求终端用户执行本地 device 登录。API Key 是宿主支持认证请求头时的手动备选，不在 OAuth 失败后自动切换。

配置内部执行地址、网关签名密钥和 Host 白名单后，运行 `ccdb-mcp serve`，通过网关公开 HTTPS `/mcp/ccdb`。此入口已实现无状态 Streamable HTTP，不是旧版 `/sse` + `/messages` 模式；GET/DELETE 返回 405，通知返回 202，不创建会话。

WorkBuddy 等远程宿主连接网关 URL，终端用户无需安装本包。OAuth 发现、用户鉴权和内部签名由网关/Auth 完成；不要公开 Node 端口、向宿主提供签名密钥，或让所有用户共用服务端登录凭证。

完整环境变量与联调要求见 [远程部署说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md)。官方 SDK 互操作测试通过不代表 WorkBuddy、真实 OAuth 或生产环境已完成验收。
