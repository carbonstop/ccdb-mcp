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

环境与 OAuth 客户端配置见 [配置说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/CONFIGURATION.md)。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

## 远程连接器：Streamable HTTP

唯一目标架构采用 [PR #5](https://github.com/carbonstop/ccdb-mcp/pull/5)：

```text
用户授权：WorkBuddy → Gateway/Auth（OAuth + PKCE）
工具请求：WorkBuddy → 公共 MCP → Gateway → 业务服务
```

MCP 独立提供协议端点及资源发现，复用现有 Gateway/Auth，不重新实现登录页或发 Token，也不直接调用 Management 内网接口。远程优先宿主 OAuth；API Key 是宿主支持认证请求头时的显式备选，不自动降级。

**实现状态：该目标调用链尚未实现，不能通过当前 npm 包的环境变量启用。** Token 校验、资源绑定和下游调用契约需先确认，见 [架构与接入前置条件](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/GATEWAY_BACKED_MCP.md)。PR #4 的 direct-Management 草稿已关闭，不采用该方案。

当前版本的 `serve` 仍是旧 Gateway-first 实现，仅保留用于已有部署的兼容；[历史部署说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md) 不是目标架构的配置指南。新部署请等待目标模式实现及验收，不要混用两者参数。
